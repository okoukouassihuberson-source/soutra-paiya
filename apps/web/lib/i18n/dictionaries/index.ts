import { fr, type Dict } from './fr';
import { en } from './en';
import { DEFAULT_LOCALE, type Locale } from '../config';

// Langues avec dictionnaire. Une langue déclarée dans config.ts mais absente ici retombe sur l'anglais.
const DICTS: Partial<Record<Locale, Dict>> = { fr, en };

export function dictionaryFor(locale: Locale): Dict {
  return DICTS[locale] ?? DICTS.en ?? DICTS[DEFAULT_LOCALE]!;
}
