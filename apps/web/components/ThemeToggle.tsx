'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n/client';

const KEY = 'soutra.theme';

/** Bascule clair / sombre. Sans choix mémorisé, suit la préférence du système (y compris en direct). */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const { t } = useI18n();
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    setDark(document.documentElement.dataset.theme === 'dark');
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      let stored: string | null = null;
      try { stored = localStorage.getItem(KEY); } catch { /* noop */ }
      if (!stored) { document.documentElement.dataset.theme = mq.matches ? 'dark' : 'light'; setDark(mq.matches); }
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const toggle = () => {
    const next = !dark;
    document.documentElement.dataset.theme = next ? 'dark' : 'light';
    try { localStorage.setItem(KEY, next ? 'dark' : 'light'); } catch { /* noop */ }
    setDark(next);
  };

  return (
    <button type="button" onClick={toggle} aria-label={dark ? t('theme.toLight') : t('theme.toDark')} aria-pressed={dark ?? false}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border border-neutral-300 bg-white text-neutral-700 transition hover:border-primary-400 hover:text-primary-700 ${className}`}>
      {dark
        ? <svg aria-hidden width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4" /></svg>
        : <svg aria-hidden width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>}
    </button>
  );
}
