'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n/client';

/**
 * Cloche + compteur de non-lues. Invisible pour un visiteur non connecté.
 * Rafraîchie au chargement, au retour sur l'onglet et toutes les 60 s.
 */
export function NotificationBell() {
  const { t, lp } = useI18n();
  const [count, setCount] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    const sb = supabaseBrowser() as any;
    const { data: s } = await sb.auth.getSession();
    if (!s.session) { setCount(null); return; }
    const { data, error } = await sb.rpc('unread_notifications_count');
    if (!error && typeof data === 'number') setCount(data);
  }, []);

  useEffect(() => {
    refresh();
    const onFocus = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);
    const t = window.setInterval(refresh, 60_000);
    return () => { document.removeEventListener('visibilitychange', onFocus); window.removeEventListener('focus', onFocus); window.clearInterval(t); };
  }, [refresh]);

  if (count === null) return null;
  return (
    <Link href={lp('/notifications')} aria-label={count > 0 ? t('nav.notificationsUnread', { n: count }) : t('nav.notifications')}
      className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-xl hover:bg-neutral-100">
      <span aria-hidden>🔔</span>
      {count > 0 && (
        <span className="absolute right-0 top-0 min-w-[18px] rounded-full bg-primary-500 px-1 text-center text-[11px] font-bold leading-[18px] text-white">{count > 99 ? '99+' : count}</span>
      )}
    </Link>
  );
}
