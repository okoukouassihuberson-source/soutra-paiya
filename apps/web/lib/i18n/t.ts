import type { Dict } from './dictionaries/fr';
import { dictionaryFor } from './dictionaries';
import { DEFAULT_LOCALE, type Locale, intlLocale, localePath } from './config';

type Paths<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Paths<T[K], `${P}${K}.`>;
}[keyof T & string];

/** Clés de traduction valides (vérifiées à la compilation). */
export type TKey = Paths<Dict>;
export type Params = Record<string, string | number>;

function lookup(dict: unknown, key: string): string | undefined {
  let cur: unknown = dict;
  for (const part of key.split('.')) {
    if (cur && typeof cur === 'object' && part in (cur as object)) cur = (cur as Record<string, unknown>)[part];
    else return undefined;
  }
  return typeof cur === 'string' ? cur : undefined;
}

function interpolate(s: string, params?: Params): string {
  return params ? s.replace(/\{(\w+)\}/g, (_, k) => (k in params ? String(params[k]) : `{${k}}`)) : s;
}

export interface I18n {
  locale: Locale;
  /** Traduction ; repli sur le français si la clé manque dans la langue courante. */
  t: (key: TKey, params?: Params) => string;
  /** Pluriel : utilise `<key>_one` / `<key>_other` selon Intl.PluralRules de la langue. */
  tn: (key: string, n: number, params?: Params) => string;
  /** Libellé dynamique (clé issue de la base) : renvoie `fallback` si aucune traduction. */
  tdyn: (prefix: string, id: string | null | undefined, fallback: string) => string;
  /** Chemin interne préfixé par la langue courante. */
  lp: (href: string) => string;
  /**
   * Champ de contenu éditorial (base de données) dans la langue courante :
   * row.i18n[locale][name] si renseigné, sinon la valeur d'origine (français).
   */
  field: (row: { i18n?: Record<string, Record<string, string>> | null } & Record<string, any>, name: string) => string | null;
  /** Liste de contenu éditorial : i18n[locale][name] (une entrée par ligne) sinon le tableau d'origine. */
  list: (row: { i18n?: Record<string, Record<string, string>> | null } & Record<string, any>, name: string) => string[];
  /** Durée lisible : 90 → « 1 h 30 », 4320 → « 3 jours ». */
  fmtDuration: (minutes: number) => string;
  /** Locale Intl (dates, nombres). */
  intl: string;
  fmtNumber: (n: number) => string;
  fmtXOF: (n: number) => string;
  fmtDate: (iso: string, opts?: Intl.DateTimeFormatOptions) => string;
}

export function createI18n(locale: Locale): I18n {
  const dict = dictionaryFor(locale);
  const fr = dictionaryFor(DEFAULT_LOCALE);
  const intl = intlLocale(locale);
  const raw = (key: string) => lookup(dict, key) ?? lookup(fr, key);
  const rules = new Intl.PluralRules(intl);
  return {
    locale, intl,
    t: (key, params) => interpolate(raw(key) ?? key, params),
    tn: (key, n, params) => {
      const suffix = rules.select(n) === 'one' ? '_one' : '_other';
      return interpolate(raw(key + suffix) ?? raw(key + '_other') ?? key, { n, ...params });
    },
    tdyn: (prefix, id, fallback) => (id ? raw(`${prefix}.${id}`) ?? fallback : fallback),
    lp: (href) => localePath(href, locale),
    field: (row, name) => {
      const v = row.i18n?.[locale]?.[name];
      return typeof v === 'string' && v.trim() ? v : (row[name] as string | null | undefined) ?? null;
    },
    list: (row, name) => {
      const v = row.i18n?.[locale]?.[name];
      if (typeof v === 'string' && v.trim()) return v.split('\n').map((x) => x.trim()).filter(Boolean);
      return Array.isArray(row[name]) ? (row[name] as string[]) : [];
    },
    fmtDuration: (m) => {
      const str = (k: string, p: Params) => interpolate(raw(k) ?? k, p);
      if (m < 60) return str('dur.min', { n: m });
      if (m < 60 * 24) {
        const h = Math.floor(m / 60), r = m % 60;
        return r ? str('dur.hm', { h, m: String(r).padStart(2, '0') }) : str('dur.h', { h });
      }
      const d = Math.round(m / (60 * 24));
      return interpolate(raw('dur.day' + (rules.select(d) === 'one' ? '_one' : '_other')) ?? 'dur.day', { n: d });
    },
    fmtNumber: (n) => new Intl.NumberFormat(intl, { maximumFractionDigits: 0 }).format(n),
    fmtXOF: (n) => new Intl.NumberFormat(intl, { maximumFractionDigits: 0 }).format(n) + ' FCFA',
    fmtDate: (iso, opts = { day: 'numeric', month: 'long', year: 'numeric' }) =>
      new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString(intl, { timeZone: 'Africa/Abidjan', ...opts }),
  };
}
