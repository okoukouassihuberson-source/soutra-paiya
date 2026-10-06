'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { stripLocale } from '@/lib/i18n/config';
import { useI18n } from '@/lib/i18n/client';
import { supabaseBrowser } from '@/lib/supabase';
import { AssistantChat } from '@/app/assistant/AssistantChat';

const HIDDEN = ['/assistant', '/login', '/admin', '/scan-voyage'];

/**
 * Soutra (assistant IA) accessible de partout : bouton flottant (écrans ≥ xl ;
 * en dessous la barre mobile porte déjà le bouton « Soutra ») + panneau latéral.
 * La page consultée est transmise à l'assistant comme contexte.
 */
export function AssistantDock() {
  const { t, lp } = useI18n();
  const pathname = usePathname() ?? '/';
  const { path } = stripLocale(pathname);
  const [open, setOpen] = useState(false);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [title, setTitle] = useState('');
  const closeBtn = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    if (!open) return;
    setTitle(document.title.replace(/\s*·\s*Soutra-Playce\s*$/, ''));
    (supabaseBrowser() as any).auth.getSession().then(({ data }: any) => setAuthed(!!data.session)).catch(() => setAuthed(false));
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); opener.current?.focus(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (HIDDEN.some((h) => path === h || path.startsWith(`${h}/`))) return null;

  return (
    <>
      <button type="button" onClick={(e) => { opener.current = e.currentTarget; setOpen(true); }} aria-haspopup="dialog" aria-label={t('siaDock.open')}
        className="fixed bottom-6 right-6 z-40 hidden items-center gap-2 rounded-full bg-night px-5 py-3 text-sm font-bold text-white shadow-xl shadow-night/30 ring-2 ring-primary-400/60 transition hover:-translate-y-0.5 hover:ring-primary-400 xl:inline-flex">
        <span aria-hidden className="text-lg leading-none text-primary-400">✦</span>Soutra
      </button>

      {open && (
        <div className="fixed inset-0 z-[60]" role="presentation">
          <div className="absolute inset-0 bg-night/40" onClick={() => setOpen(false)} aria-hidden />
          <div role="dialog" aria-modal="true" aria-label={t('siaDock.title')}
            className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-2xl sm:rounded-l-2xl">
            <div className="flex items-center justify-between gap-2 border-b border-neutral-200 px-4 py-3" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
              <div className="min-w-0">
                <h2 className="font-display text-base font-bold">✦ {t('siaDock.title')}</h2>
                {title && <p className="truncate text-xs text-neutral-600">{t('siaDock.context', { page: title })}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Link href={lp('/assistant')} className="rounded-lg px-2 py-1 text-xs font-medium text-neutral-700 underline hover:text-primary-700">{t('siaDock.fullPage')}</Link>
                <button ref={closeBtn} type="button" onClick={() => { setOpen(false); opener.current?.focus(); }} aria-label={t('siaDock.close')}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-xl text-neutral-700 hover:bg-neutral-100">×</button>
              </div>
            </div>
            <div className="min-h-0 flex-1">
              {authed === null ? <p className="p-4 text-sm text-neutral-600">{t('common.loading')}</p>
                : authed ? <AssistantChat compact context={title ? t('siaDock.context', { page: title }) : ''} />
                : (
                  <div className="space-y-3 p-6 text-center">
                    <p className="text-neutral-700">{t('siaDock.loginPrompt')}</p>
                    <Link href="/login" className="inline-block rounded-full bg-primary-500 px-5 py-2 font-semibold text-night hover:bg-primary-400">{t('siaDock.login')}</Link>
                  </div>
                )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
