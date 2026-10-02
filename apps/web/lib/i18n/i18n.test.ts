// Tests du socle i18n — lancer : pnpm --filter @soutra/web test:i18n
import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { DEFAULT_LOCALE, ENABLED_LOCALES, LOCALES, LOCALE_COOKIE, localePath, stripLocale, isEnabledLocale } from './config';
import { createI18n } from './t';
import { fr } from './dictionaries/fr';
import { en } from './dictionaries/en';
import { languageAlternates } from './seo';
import { middleware } from '../../middleware';

const flatten = (o: unknown, p = ''): Record<string, string> =>
  Object.entries(o as Record<string, unknown>).reduce((acc, [k, v]) =>
    typeof v === 'string' ? { ...acc, [p + k]: v } : { ...acc, ...flatten(v, `${p}${k}.`) }, {});
const params = (s: string) => (s.match(/\{(\w+)\}/g) ?? []).sort().join(',');

test('dictionnaires : mêmes clés, mêmes paramètres, aucun texte vide', () => {
  const a = flatten(fr), b = flatten(en);
  assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort());
  for (const k of Object.keys(a)) {
    assert.ok(a[k].trim() !== '' && b[k].trim() !== '', `texte vide : ${k}`);
    assert.equal(params(a[k]), params(b[k]), `paramètres différents : ${k}`);
  }
  // une traduction identique au français est suspecte, sauf noms propres / nombres / emojis
  const same = Object.keys(a).filter((k) => a[k] === b[k] && /[a-zà-ÿ]{4,}/i.test(a[k]));
  console.log(`  (${Object.keys(a).length} clés ; ${same.length} identiques FR/EN : ${same.slice(0, 8).join(', ')}…)`);
});

test('config : langues actives et par défaut', () => {
  assert.equal(DEFAULT_LOCALE, 'fr');
  assert.deepEqual(ENABLED_LOCALES, ['fr', 'en']);
  assert.equal(LOCALES.ar.dir, 'rtl');
  assert.equal(isEnabledLocale('en'), true);
  assert.equal(isEnabledLocale('es'), false);   // déclarée mais désactivée
  assert.equal(isEnabledLocale('xx'), false);
});

test('stripLocale / localePath', () => {
  assert.deepEqual(stripLocale('/en'), { locale: 'en', path: '/' });
  assert.deepEqual(stripLocale('/en/voyages/x'), { locale: 'en', path: '/voyages/x' });
  assert.deepEqual(stripLocale('/voyages/x'), { locale: 'fr', path: '/voyages/x' });
  assert.deepEqual(stripLocale('/english'), { locale: 'fr', path: '/english' });   // pas de faux positif
  assert.deepEqual(stripLocale('/entrees'), { locale: 'fr', path: '/entrees' });
  assert.equal(localePath('/voyages/x', 'fr'), '/voyages/x');
  assert.equal(localePath('/voyages/x', 'en'), '/en/voyages/x');
  assert.equal(localePath('/', 'en'), '/en');
  assert.equal(localePath('/explorer?cat=hotels', 'en'), '/en/explorer?cat=hotels');
  assert.equal(localePath('/en/explorer', 'en'), '/en/explorer');              // idempotent
  assert.equal(localePath('https://x.com/a', 'en'), 'https://x.com/a');        // externe intact
  assert.equal(localePath('//x.com/a', 'en'), '//x.com/a');
  assert.equal(localePath('#how', 'en'), '#how');
  assert.equal(localePath('mailto:a@b.c', 'en'), 'mailto:a@b.c');
  assert.equal(localePath('/?q=1', 'en'), '/en?q=1');
});

test('t : interpolation, repli, clés inconnues', () => {
  const f = createI18n('fr'), e = createI18n('en');
  assert.equal(f.t('common.page', { n: 2, total: 5 }), 'Page 2 / 5');
  assert.equal(e.t('common.page', { n: 2, total: 5 }), 'Page 2 of 5');
  assert.equal(e.t('common.page'), 'Page {n} of {total}');                      // paramètre manquant conservé
  assert.equal(f.t('nope.key' as never), 'nope.key');
  assert.equal(createI18n('es').t('common.search'), 'Search');                  // es → repli sur l'anglais
});

test('tn : pluriels FR (0 et 1 au singulier) et EN', () => {
  const f = createI18n('fr'), e = createI18n('en');
  assert.equal(f.tn('cards.seatsLeft', 0), '0 place restante');
  assert.equal(f.tn('cards.seatsLeft', 1), '1 place restante');
  assert.equal(f.tn('cards.seatsLeft', 2), '2 places restantes');
  assert.equal(e.tn('cards.seatsLeft', 1), '1 seat left');
  assert.equal(e.tn('cards.seatsLeft', 0), '0 seats left');
});

test('tdyn : libellés issus de la base, avec repli', () => {
  const e = createI18n('en');
  assert.equal(e.tdyn('venueCat', 'hotel', 'Hôtel'), 'Hotel');
  assert.equal(e.tdyn('venueCat', 'categorie_inconnue', 'Brut'), 'Brut');
  assert.equal(e.tdyn('venueCat', null, 'Brut'), 'Brut');
  assert.equal(createI18n('fr').tdyn('actCat', 'randonnee', '?'), 'Randonnée');
});

test('field / list : surcharge de contenu éditorial', () => {
  const row = { title: 'Balade', summary: null, inclusions: ['Eau', 'Guide'], i18n: { en: { title: 'Boat trip', inclusions: 'Water\n Guide \n' } } };
  const e = createI18n('en'), f = createI18n('fr');
  assert.equal(e.field(row, 'title'), 'Boat trip');
  assert.equal(f.field(row, 'title'), 'Balade');
  assert.equal(e.field(row, 'summary'), null);
  assert.deepEqual(e.list(row, 'inclusions'), ['Water', 'Guide']);
  assert.deepEqual(f.list(row, 'inclusions'), ['Eau', 'Guide']);
  assert.equal(e.field({ title: 'X', i18n: { en: { title: '   ' } } }, 'title'), 'X');   // vide → origine
  assert.equal(e.field({ title: 'X' }, 'title'), 'X');
});

test('formats : durée, montant, date', () => {
  const f = createI18n('fr'), e = createI18n('en');
  assert.equal(f.fmtDuration(45), '45 min');
  assert.equal(f.fmtDuration(90), '1 h 30');
  assert.equal(f.fmtDuration(120), '2 h');
  assert.equal(f.fmtDuration(4320), '3 jours');
  assert.equal(e.fmtDuration(1440), '1 day');
  assert.equal(e.fmtDuration(4320), '3 days');
  assert.match(f.fmtXOF(1500000).replace(/\s/g, ' '), /^1 500 000 FCFA$/);
  assert.equal(e.fmtXOF(1500000), '1,500,000 FCFA');
  assert.match(e.fmtDate('2026-10-09'), /9 October 2026/);
  assert.match(f.fmtDate('2026-10-09'), /9 octobre 2026/);
});

test('SEO : hreflang et canonical', () => {
  const a = languageAlternates('/voyages/mon-voyage', 'en');
  assert.equal(a.canonical, '/en/voyages/mon-voyage');
  assert.deepEqual(a.languages, { fr: '/voyages/mon-voyage', en: '/en/voyages/mon-voyage', 'x-default': '/voyages/mon-voyage' });
  assert.equal(languageAlternates('/', 'fr').canonical, '/');
});

test('middleware : réécriture /en/*, en-tête non falsifiable, redirection par cookie', () => {
  const hdr = (res: Response, name: string) => res.headers.get(`x-middleware-request-${name}`);
  // /en/explorer → réécrit vers /explorer, x-locale=en
  let res = middleware(new NextRequest('http://localhost/en/explorer?cat=hotels'));
  assert.equal(res.headers.get('x-middleware-rewrite'), 'http://localhost/explorer?cat=hotels');
  assert.equal(hdr(res, 'x-locale'), 'en');
  // /en → /
  res = middleware(new NextRequest('http://localhost/en'));
  assert.equal(res.headers.get('x-middleware-rewrite'), 'http://localhost/');
  // français : pas de réécriture, x-locale=fr
  res = middleware(new NextRequest('http://localhost/explorer'));
  assert.equal(res.headers.get('x-middleware-rewrite'), null);
  assert.equal(hdr(res, 'x-locale'), 'fr');
  // un client ne peut pas forger x-locale
  res = middleware(new NextRequest('http://localhost/explorer', { headers: { 'x-locale': 'en' } }));
  assert.equal(hdr(res, 'x-locale'), 'fr');
  res = middleware(new NextRequest('http://localhost/en/explorer', { headers: { 'x-locale': 'fr' } }));
  assert.equal(hdr(res, 'x-locale'), 'en');
  // cookie : seul '/' redirige
  const cookie = { headers: { cookie: `${LOCALE_COOKIE}=en` } };
  res = middleware(new NextRequest('http://localhost/', cookie));
  assert.equal(res.status, 307); assert.equal(new URL(res.headers.get('location')!).pathname, '/en');
  res = middleware(new NextRequest('http://localhost/explorer', cookie));
  assert.equal(res.status, 200);
  // cookie invalide ignoré
  res = middleware(new NextRequest('http://localhost/', { headers: { cookie: `${LOCALE_COOKIE}=zz` } }));
  assert.equal(res.status, 200);
});
