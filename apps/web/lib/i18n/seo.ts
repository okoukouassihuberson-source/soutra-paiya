import { DEFAULT_LOCALE, ENABLED_LOCALES, LOCALES, localePath, type Locale } from './config';

/**
 * Métadonnées d'alternance de langue : canonical de la langue courante + hreflang
 * de toutes les langues actives (+ x-default = langue par défaut).
 * `path` est le chemin SANS préfixe de langue (ex. '/voyages/mon-voyage').
 */
export function languageAlternates(path: string, locale: Locale) {
  const languages: Record<string, string> = {};
  for (const l of ENABLED_LOCALES) languages[l] = localePath(path, l);
  languages['x-default'] = localePath(path, DEFAULT_LOCALE);
  return { canonical: localePath(path, locale), languages };
}

export const openGraphLocale = (locale: Locale) => LOCALES[locale].og;
