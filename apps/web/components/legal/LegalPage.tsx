import type { Metadata } from 'next';
import Link from 'next/link';
import { TourismNav } from '@/components/tourism/TourismNav';
import { SiteFooter } from '@/components/home/SiteFooter';
import { getI18n } from '@/lib/i18n/server';
import { languageAlternates } from '@/lib/i18n/seo';
import { LEGAL, TBD } from '@/lib/legal/config';
import { LEGAL_DOCS, type LegalKey, type LegalLang } from '@/lib/legal/content';

const PATH: Record<LegalKey, string> = { terms: '/cgu', privacy: '/confidentialite', about: '/a-propos' };

const lang = (l: string): LegalLang => (l === 'en' ? 'en' : 'fr');

export function legalMetadata(key: LegalKey): Metadata {
  const { locale } = getI18n();
  const doc = LEGAL_DOCS[lang(locale)][key];
  return { title: doc.title, description: doc.intro, alternates: languageAlternates(PATH[key], locale) };
}

/** Remplace {company}, {email}… par les informations de l'éditeur ; « [à compléter] » si non renseignées. */
function fill(text: string, l: LegalLang): string {
  return text.replace(/\{(\w+)\}/g, (_, k: string) => {
    const val = (LEGAL as Record<string, unknown>)[k];
    return typeof val === 'string' && val ? val : TBD[l];
  });
}

export function LegalPage({ docKey }: { docKey: LegalKey }) {
  const { locale, lp, t } = getI18n();
  const l = lang(locale);
  const doc = LEGAL_DOCS[l][docKey];
  const isAbout = docKey === 'about';
  const others: [LegalKey, string][] = [['terms', LEGAL_DOCS[l].terms.title], ['privacy', LEGAL_DOCS[l].privacy.title], ['about', LEGAL_DOCS[l].about.title]];
  const date = new Date(LEGAL.updated + 'T00:00:00').toLocaleDateString(l === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <>
      <TourismNav />
      <main className="mx-auto max-w-3xl px-4 pb-28 pt-8 sm:px-6">
        {!LEGAL.reviewed && !isAbout && (
          <p role="note" className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {l === 'en'
              ? 'Draft version — this text has not yet been reviewed by a lawyer and may change.'
              : "Version provisoire — ce texte n'a pas encore été relu par un juriste et peut évoluer."}
          </p>
        )}
        <h1 className="font-display text-3xl font-extrabold text-night sm:text-4xl">{doc.title}</h1>
        {!isAbout && <p className="mt-1 text-sm text-neutral-600">{l === 'en' ? 'Last updated' : 'Dernière mise à jour'} : {date}</p>}
        <p className="mt-4 text-lg text-neutral-700">{fill(doc.intro, l)}</p>

        <div className="mt-8 space-y-8">
          {doc.sections.map((s) => (
            <section key={s.h} aria-labelledby={`h-${s.h}`}>
              <h2 id={`h-${s.h}`} className="font-display text-xl font-bold text-night">{s.h}</h2>
              {s.blocks.map((b, i) => (
                <div key={i} className="mt-2 text-[15px] leading-relaxed text-neutral-800">
                  {b.p && <p>{fill(b.p, l)}</p>}
                  {b.ul && <ul className="list-disc space-y-1 pl-5">{b.ul.map((x) => <li key={x}>{fill(x, l)}</li>)}</ul>}
                </div>
              ))}
            </section>
          ))}
        </div>

        <nav aria-label={l === 'en' ? 'Legal pages' : 'Pages légales'} className="mt-12 flex flex-wrap gap-x-5 gap-y-2 border-t border-neutral-200 pt-6 text-sm font-semibold">
          {others.filter(([k]) => k !== docKey).map(([k, title]) => (
            <Link key={k} href={lp(PATH[k])} className="min-h-[32px] text-primary-700 hover:underline">{title}</Link>
          ))}
          <Link href={lp('/')} className="min-h-[32px] text-neutral-600 hover:underline">{t('nav.home')}</Link>
        </nav>
      </main>
      <SiteFooter />
    </>
  );
}
