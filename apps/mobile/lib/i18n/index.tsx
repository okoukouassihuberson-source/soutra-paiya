// ============================================================================
// i18n de l'application mobile (FR par défaut, EN en option) — fournisseur React.
//   • choix persisté dans AsyncStorage ; français tant que l'utilisateur n'a pas choisi :
//     l'anglais est PARTIEL (écrans historiques non traduits), il ne doit jamais s'activer tout seul ;
//   • `useI18n()` dans les composants ; `tr()` hors composants (modules lib) ;
//   • repli sur le français si une clé manque ; clés vérifiées à la compilation (core.ts).
// ============================================================================
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createI18n, DEFAULT_LOCALE, type I18n, type Locale, type Params, type TKey } from './core';

export { createI18n, DEFAULT_LOCALE, LOCALES, interpolate } from './core';
export type { I18n, Locale, Params, TKey } from './core';
const STORAGE_KEY = 'soutra.locale';

// Langue courante pour les modules hors composants (messages d'erreur, libellés de statuts).
let current: Locale = DEFAULT_LOCALE;
export const currentLocale = () => current;
export const tr = (key: TKey, params?: Params) => createI18n(current).t(key, params);

interface Ctx { i18n: I18n; setLocale: (l: Locale) => void }
const LocaleCtx = createContext<Ctx>({ i18n: createI18n(DEFAULT_LOCALE), setLocale: () => {} });

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLoc] = useState<Locale>(DEFAULT_LOCALE);
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => { if (v === 'fr' || v === 'en') { current = v; setLoc(v); } })
      .catch(() => {});
  }, []);
  const setLocale = useCallback((l: Locale) => {
    current = l; setLoc(l);
    AsyncStorage.setItem(STORAGE_KEY, l).catch(() => {});
  }, []);
  const value = useMemo(() => ({ i18n: createI18n(locale), setLocale }), [locale, setLocale]);
  return <LocaleCtx.Provider value={value}>{children}</LocaleCtx.Provider>;
}

export const useI18n = (): I18n => useContext(LocaleCtx).i18n;
export const useSetLocale = () => useContext(LocaleCtx).setLocale;
