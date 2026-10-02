'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase';

interface Row { id: string; kind: string; title: string; body: string | null; route: string | null; meta: Record<string, any> | null; read_at: string | null; created_at: string }
const PAGE = 30;

const ICON: Record<string, string> = {
  booking_new: '🧾', booking_cancelled: '❌', booking_expired: '⌛', payment_confirmed: '✅', payment_received: '💰', balance_due: '💳',
  departure_reminder: '🧳', activity_reminder: '⏰', payment_expiring: '⏳', trip_updated: '✏️', trip_cancelled: '❌', activity_cancelled: '❌',
  slot_changed: '🕒', review_new: '⭐', trip_submitted: '📝', activity_submitted: '📝', trip_published: '🎉', activity_published: '🎉',
  partner_new: '🤝', partner_activated: '🤝', promotion: '🏷️',
};

/** Seuls les chemins web internes sont cliquables (les routes mobiles « /(tabs)… » ne le sont pas). */
const webRoute = (r: string | null) => (r && r.startsWith('/') && !r.startsWith('//') && !r.startsWith('/(') ? r : null);

function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'à l’instant';
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export function NotificationList() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async (before?: string) => {
    const sb = supabaseBrowser() as any;
    let q = sb.from('notifications').select('id, kind, title, body, route, meta, read_at, created_at').order('created_at', { ascending: false }).limit(PAGE + 1);
    if (before) q = q.lt('created_at', before);
    if (onlyUnread) q = q.is('read_at', null);
    const { data, error } = await q;
    if (error) { setErr('Impossible de charger vos notifications.'); setLoading(false); return; }
    const list = (data ?? []) as Row[];
    setMore(list.length > PAGE);
    setRows((prev) => (before ? [...prev, ...list.slice(0, PAGE)] : list.slice(0, PAGE)));
    setLoading(false);
  }, [onlyUnread]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  async function open(n: Row) {
    if (!n.read_at) {
      const now = new Date().toISOString();
      setRows((r) => r.map((x) => (x.id === n.id ? { ...x, read_at: now } : x)));
      await (supabaseBrowser() as any).from('notifications').update({ read_at: now }).eq('id', n.id);
    }
    const route = webRoute(n.route);
    if (route) router.push(route);
  }

  async function readAll() {
    const { error } = await (supabaseBrowser() as any).rpc('mark_all_notifications_read');
    if (error) { setErr('Action impossible.'); return; }
    const now = new Date().toISOString();
    setRows((r) => r.map((x) => ({ ...x, read_at: x.read_at ?? now })));
  }

  const unread = rows.filter((r) => !r.read_at).length;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-bold">Notifications</h1>
        <Link href="/notifications/preferences" className="text-sm font-semibold text-primary-600 underline">Préférences</Link>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={onlyUnread} onChange={(e) => setOnlyUnread(e.target.checked)} /> Non lues seulement</label>
        <button onClick={readAll} disabled={unread === 0} className="font-semibold text-primary-600 underline disabled:opacity-40">Tout marquer comme lu</button>
      </div>
      {err && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{err}</p>}

      {loading ? <p className="mt-8 text-center text-neutral-500">Chargement…</p> : rows.length === 0 ? (
        <p className="mt-6 rounded-2xl bg-neutral-50 p-8 text-center text-neutral-600">{onlyUnread ? 'Aucune notification non lue.' : 'Vous n’avez pas encore de notification.'}</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {rows.map((n) => {
            const clickable = !!webRoute(n.route);
            return (
              <li key={n.id}>
                <button onClick={() => open(n)} aria-label={`${n.read_at ? '' : 'Non lue : '}${n.title}`}
                  className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition ${n.read_at ? 'border-neutral-200 bg-white' : 'border-primary-200 bg-primary-50'} ${clickable ? 'hover:shadow-md' : 'cursor-default'}`}>
                  <span aria-hidden className="text-2xl">{ICON[n.meta?.event as string] ?? '🔔'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <b className="text-sm text-dark">{n.title}</b>
                      <span className="shrink-0 text-xs text-neutral-500">{ago(n.created_at)}</span>
                    </span>
                    {n.body && <span className="mt-0.5 block text-sm text-neutral-700">{n.body}</span>}
                  </span>
                  {!n.read_at && <span aria-hidden className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-primary-500" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {more && <button onClick={() => load(rows[rows.length - 1]?.created_at)} className="mx-auto mt-6 block rounded-full border px-6 py-2 text-sm font-medium">Voir plus</button>}
    </>
  );
}
