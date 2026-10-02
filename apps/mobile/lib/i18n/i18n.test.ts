/**
 * Tests de l'i18n mobile (cœur pur). Exécution :
 *   node --import tsx --test apps/mobile/lib/i18n/i18n.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createI18n, interpolate } from './core';
import { fr } from './fr';
import { en } from './en';

const flatten = (o: unknown, p = ''): Record<string, string> =>
  Object.entries(o as Record<string, unknown>).reduce((acc, [k, v]) =>
    typeof v === 'string' ? { ...acc, [p + k]: v } : { ...acc, ...flatten(v, `${p}${k}.`) }, {} as Record<string, string>);
const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

test('parité FR / EN : mêmes clés et mêmes paramètres', () => {
  const f = flatten(fr), e = flatten(en);
  assert.deepEqual(Object.keys(e).sort(), Object.keys(f).sort());
  for (const k of Object.keys(f)) {
    assert.equal(params(e[k]), params(f[k]), `paramètres différents pour ${k}`);
    assert.ok(e[k].trim().length > 0, `traduction vide : ${k}`);
  }
});

test('interpolation : paramètres manquants conservés', () => {
  assert.equal(interpolate('a {x} b {y}', { x: 1 }), 'a 1 b {y}');
});

test('pluriels selon la langue', () => {
  assert.equal(createI18n('fr').tn('trips.seats', 1), '1 place');
  assert.equal(createI18n('fr').tn('trips.seats', 3), '3 places');
  assert.equal(createI18n('en').tn('trips.seats', 1), '1 seat');
  assert.equal(createI18n('en').tn('trips.seats', 0), '0 seats');
});

test('clé inconnue : la clé elle-même (pas de plantage) ; tdyn avec repli', () => {
  const i = createI18n('en');
  assert.equal((i.t as (k: string) => string)('nope.nope'), 'nope.nope');
  assert.equal(i.tdyn('cat', 'safari', 'x'), 'Safari');
  assert.equal(i.tdyn('cat', 'inconnu', 'Repli'), 'Repli');
  assert.equal(i.tdyn('cat', null, 'Repli'), 'Repli');
});

test('durées', () => {
  const f = createI18n('fr');
  assert.equal(f.fmtDuration(45), '45 min');
  assert.equal(f.fmtDuration(90), '1 h 30');
  assert.equal(f.fmtDuration(120), '2 h');
  assert.equal(f.fmtDuration(60 * 24 * 3), '3 jours');
  assert.equal(createI18n('en').fmtDuration(60 * 24), '1 day');
});

test('contenu éditorial : surcharge par langue, repli sur l’original', () => {
  const row = { title: 'Bassam', includes: ['Transport'], i18n: { en: { title: 'Bassam trip', includes: 'Transport\nLunch' } } };
  const en_ = createI18n('en'), fr_ = createI18n('fr');
  assert.equal(en_.field(row, 'title'), 'Bassam trip');
  assert.equal(fr_.field(row, 'title'), 'Bassam');
  assert.deepEqual(en_.list(row, 'includes'), ['Transport', 'Lunch']);
  assert.deepEqual(fr_.list(row, 'includes'), ['Transport']);
  assert.equal(en_.field({ title: 'X', i18n: { en: { title: '  ' } } }, 'title'), 'X');
  assert.equal(en_.field({ title: null }, 'title'), null);
});

test('codes d’erreur serveur couverts par le dictionnaire', () => {
  for (const c of ['PROMO_NOT_FOUND', 'PROMO_RATE_LIMITED', 'PROMO_ALREADY_USED', 'NOT_ENOUGH_SEATS', 'SLOT_CLOSED']) {
    const k = c.startsWith('PROMO') ? `promo.err.${c}` : `book.err.${c}`;
    assert.ok(flatten(fr)[k] && flatten(en)[k], k);
  }
});
