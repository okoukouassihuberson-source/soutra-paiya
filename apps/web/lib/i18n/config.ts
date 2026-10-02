// ============================================================================
// SOUTRA PLAYCE V2 — Internationalisation : configuration (pur, client + serveur).
//
// Routage : le français reste à la racine (aucune URL existante ne change) ;
// chaque autre langue active est préfixée (/en/…). Le middleware réécrit
// /en/xxx → /xxx en posant l'en-tête x-locale ; il n'y a donc PAS de dossier
// [locale] à maintenir. Pour ajouter une langue :
//   1. passer `enabled: true` ci-dessous,
//   2. créer lib/i18n/dictionaries/<code>.ts (type Dict : le compilateur liste
//      les clés manquantes) et l'enregistrer dans dictionaries/index.ts.
// es / it / pt / ar sont déclarées (dir, format) mais désactivées tant que le
// dictionnaire n'existe pas.
// ============================================================================

export const LOCALES = {
  fr: { label: 'Français', short: 'FR', dir: 'ltr', intl: 'fr-FR', og: 'fr_CI', enabled: true },
  en: { label: 'English', short: 'EN', dir: 'ltr', intl: 'en-GB', og: 'en_GB', enabled: true },
  es: { label: 'Español', short: 'ES', dir: 'ltr', intl: 'es-ES', og: 'es_ES', enabled: false },
  it: { label: 'Italiano', short: 'IT', dir: 'ltr', intl: 'it-IT', og: 'it_IT', enabled: false },
  pt: { label: 'Português', short: 'PT', dir: 'ltr', intl: 'pt-PT', og: 'pt_PT', enabled: false },
  ar: { label: 'العربية', short: 'AR', dir: 'rtl', intl: 'ar', og: 'ar_AR', enabled: false },
} as const;

export type Locale = keyof typeof LOCALES;
export const DEFAULT_LOCALE: Locale = 'fr';
export const LOCALE_COOKIE = 'soutra_locale';
export const LOCALE_HEADER = 'x-locale';

export const ENABLED_LOCALES = (Object.keys(LOCALES) as Locale[]).filter((l) => LOCALES[l].enabled);
/** Langues préfixées dans l'URL (toutes les langues actives sauf la langue par défaut). */
export const PREFIXED_LOCALES = ENABLED_LOCALES.filter((l) => l !== DEFAULT_LOCALE);

export function isEnabledLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (ENABLED_LOCALES as string[]).includes(v);
}

/** Sépare une pathname éventuellement préfixée : '/en/voyages/x' → { locale:'en', path:'/voyages/x' }. */
export function stripLocale(pathname: string): { locale: Locale; path: string } {
  for (const l of PREFIXED_LOCALES) {
    if (pathname === `/${l}`) return { locale: l, path: '/' };
    if (pathname.startsWith(`/${l}/`)) return { locale: l, path: pathname.slice(l.length + 1) };
  }
  return { locale: DEFAULT_LOCALE, path: pathname };
}

/**
 * Préfixe un chemin interne avec la langue. Laisse intacts les liens externes,
 * ancres, mailto/tel et les chemins déjà préfixés.
 */
export function localePath(href: string, locale: Locale): string {
  if (!href.startsWith('/') || href.startsWith('//')) return href;
  if (locale === DEFAULT_LOCALE) return href;
  if (stripLocale(href.split(/[?#]/)[0]).locale !== DEFAULT_LOCALE) return href;
  if (href === '/') return `/${locale}`;
  if (href.startsWith('/?') || href.startsWith('/#')) return `/${locale}${href.slice(1)}`;
  return `/${locale}${href}`;
}

export function intlLocale(locale: Locale): string {
  return LOCALES[locale].intl;
}
