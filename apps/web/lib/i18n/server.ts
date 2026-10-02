import { headers } from 'next/headers';
import { DEFAULT_LOCALE, LOCALE_HEADER, isEnabledLocale, type Locale } from './config';
import { createI18n, type I18n } from './t';

/** Langue de la requête (posée par le middleware ; français si absente). */
export function getLocale(): Locale {
  const v = headers().get(LOCALE_HEADER);
  return isEnabledLocale(v) ? v : DEFAULT_LOCALE;
}

export function getI18n(): I18n {
  return createI18n(getLocale());
}
