'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { DEFAULT_LOCALE, type Locale } from './config';
import { createI18n, type I18n } from './t';

const Ctx = createContext<Locale>(DEFAULT_LOCALE);

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <Ctx.Provider value={locale}>{children}</Ctx.Provider>;
}

export function useLocale(): Locale {
  return useContext(Ctx);
}

/** Même API que getI18n() côté serveur. */
export function useI18n(): I18n {
  const locale = useContext(Ctx);
  return useMemo(() => createI18n(locale), [locale]);
}
