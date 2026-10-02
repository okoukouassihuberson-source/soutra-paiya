'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ENABLED_LOCALES, LOCALES, LOCALE_COOKIE, localePath, stripLocale, type Locale } from '@/lib/i18n/config';
import { useI18n } from '@/lib/i18n/client';

/**
 * Sélecteur de langue : bascule vers la même page dans l'autre langue
 * (/voyages/x ⇄ /en/voyages/x) et mémorise le choix (cookie 1 an) pour que
 * l'accueil s'ouvre directement dans cette langue.
 */
export function LanguageSwitcher({ className = '', tone = 'light' }: { className?: string; tone?: 'light' | 'dark' }) {
  const { locale, t } = useI18n();
  const pathname = usePathname() ?? '/';
  const [suffix, setSuffix] = useState('');

  // Query + hash côté navigateur uniquement (évite de rendre la page dynamique pour useSearchParams).
  useEffect(() => { setSuffix(window.location.search + window.location.hash); }, [pathname]);

  if (ENABLED_LOCALES.length < 2) return null;
  const { path } = stripLocale(pathname);
  const remember = (l: Locale) => { document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`; };

  return (
    <div role="group" aria-label={t('lang.switch')} className={`inline-flex overflow-hidden rounded-full border text-xs font-bold ${tone === 'dark' ? 'border-white/25' : 'border-neutral-300'} ${className}`}>
      {ENABLED_LOCALES.map((l) => (
        <a key={l} href={localePath(path, l) + suffix} hrefLang={l} lang={l} onClick={() => remember(l)}
          aria-current={l === locale ? 'true' : undefined} title={LOCALES[l].label}
          className={`flex min-h-[36px] items-center px-3 ${l === locale ? 'bg-primary-500 text-night' : tone === 'dark' ? 'text-white/80 hover:bg-white/10' : 'text-neutral-600 hover:bg-neutral-100'}`}>
          {LOCALES[l].short}
        </a>
      ))}
    </div>
  );
}
