// ============================================================================
// Cœur de l'i18n mobile — pur (aucune dépendance React Native), donc testable avec node.
//   • repli sur le français si une clé manque ; clés vérifiées à la compilation ;
//   • le fournisseur React (index.tsx) persiste le choix de langue et expose useI18n() / tr().
// ============================================================================
import { fr, type Dict } from './fr';
import { en } from './en';

export type Locale = 'fr' | 'en';
export const LOCALES: Locale[] = ['fr', 'en'];
export const DEFAULT_LOCALE: Locale = 'fr';
const DICTS: Record<Locale, Dict> = { fr, en };
const INTL: Record<Locale, string> = { fr: 'fr-FR', en: 'en-GB' };

type Paths<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Paths<T[K], `${P}${K}.`>;
}[keyof T & string];
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
export const interpolate = (s: string, params?: Params) =>
  params ? s.replace(/\{(\w+)\}/g, (_, k) => (k in params ? String(params[k]) : `{${k}}`)) : s;

export interface I18n {
  locale: Locale;
  intl: string;
  t: (key: TKey, params?: Params) => string;
  /** Pluriel : `<key>_one` / `<key>_other` selon la langue ; `n` est ajouté aux paramètres. */
  tn: (key: string, n: number, params?: Params) => string;
  /** Libellé dynamique (clé issue de la base) avec repli. */
  tdyn: (prefix: string, id: string | null | undefined, fallback: string) => string;
  fmtDuration: (minutes: number) => string;
  fmtDate: (iso: string, opts?: Intl.DateTimeFormatOptions) => string;
  fmtSlot: (iso: string) => string;
  /** Contenu éditorial (base) dans la langue courante : row.i18n[locale][name] sinon la valeur d'origine (français). */
  field: (row: { i18n?: Record<string, Record<string, string>> | null } & Record<string, any>, name: string) => string | null;
  /** Liste éditoriale : une entrée par ligne dans i18n, sinon le tableau d'origine. */
  list: (row: { i18n?: Record<string, Record<string, string>> | null } & Record<string, any>, name: string) => string[];
}

export function createI18n(locale: Locale): I18n {
  const dict = DICTS[locale] ?? fr;
  const raw = (key: string) => lookup(dict, key) ?? lookup(fr, key);
  const rules = new Intl.PluralRules(INTL[locale]);
  const intl = INTL[locale];
  const t = (key: string, params?: Params) => interpolate(raw(key) ?? key, params);
  const tn = (key: string, n: number, params?: Params) =>
    interpolate(raw(key + (rules.select(n) === 'one' ? '_one' : '_other')) ?? raw(key + '_other') ?? key, { n, ...params });
  return {
    locale, intl,
    t: t as I18n['t'], tn,
    tdyn: (prefix, id, fallback) => (id ? raw(`${prefix}.${id}`) ?? fallback : fallback),
    fmtDuration: (m) => {
      if (m < 60) return t('dur.min', { n: m });
      if (m < 60 * 24) { const h = Math.floor(m / 60), r = m % 60; return r ? t('dur.hm', { h, m: String(r).padStart(2, '0') }) : t('dur.h', { h }); }
      return tn('dur.day', Math.round(m / (60 * 24)));
    },
    fmtDate: (iso, opts = { day: 'numeric', month: 'long', year: 'numeric' }) =>
      new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString(intl, { timeZone: 'Africa/Abidjan', ...opts }),
    field: (row, name) => {
      const v = row.i18n?.[locale]?.[name];
      return typeof v === 'string' && v.trim() ? v : (row[name] as string | null | undefined) ?? null;
    },
    list: (row, name) => {
      const v = row.i18n?.[locale]?.[name];
      if (typeof v === 'string' && v.trim()) return v.split('\n').map((x) => x.trim()).filter(Boolean);
      return Array.isArray(row[name]) ? (row[name] as string[]) : [];
    },
    fmtSlot: (iso) => new Date(iso).toLocaleString(intl, { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Abidjan' }),
  };
}

