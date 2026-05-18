'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { formatXOF, type Database } from '@soutra/shared';
import { supabaseBrowser, isSupabaseConfigured } from '@/lib/supabase';
import { useRealtime, combineStatus, type RealtimeStatus } from '@/lib/useRealtime';
import { useToasts, ToastStack } from '@/components/Toast';

type Reservation = Database['public']['Tables']['reservations']['Row'];
type Venue = Database['public']['Tables']['venues']['Row'];
type AppNotification = Database['public']['Tables']['notifications']['Row'];
type Transaction = Database['public']['Tables']['transactions']['Row'];

type ResaRow = Reservation & { clientName?: string };
type Phase = 'loading' | 'unconfigured' | 'signed_out' | 'no_venue' | 'error' | 'ready';

const RESA_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'En attente', cls: 'bg-warning/20 text-yellow-700' },
  confirmed: { label: 'Payé', cls: 'bg-secondary-50 text-secondary-700' },
  arrived: { label: 'Arrivé', cls: 'bg-accent-500/10 text-accent-500' },
  no_show: { label: 'No-show', cls: 'bg-red-50 text-danger' },
  cancelled: { label: 'Annulé', cls: 'bg-neutral-100 text-neutral-500' },
  refunded: { label: 'Remboursé', cls: 'bg-neutral-100 text-neutral-500' },
};

const TX_LABEL: Record<string, string> = {
  topup: 'Recharge',
  withdraw: 'Retrait',
  payment: 'Paiement',
  transfer: 'Transfert',
  refund: 'Remboursement',
  split: 'Split',
  escrow_hold: 'Séquestre',
  escrow_release: 'Libération séquestre',
  fee: 'Commission',
};

const PAID_STATUSES = new Set(['confirmed', 'arrived']);

const STATUS_PILL: Record<RealtimeStatus, { dot: string; label: string; text: string }> = {
  idle: { dot: 'bg-neutral-300', label: 'Hors ligne', text: 'text-neutral-500' },
  subscribing: { dot: 'bg-warning', label: 'Connexion temps réel…', text: 'text-yellow-700' },
  live: { dot: 'bg-success', label: 'Temps réel actif', text: 'text-secondary-700' },
  error: { dot: 'bg-danger', label: 'Temps réel dégradé', text: 'text-danger' },
};

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const n = new Date();
  return (
    d.getFullYear() === n.getFullYear() &&
    d.getMonth() === n.getMonth() &&
    d.getDate() === n.getDate()
  );
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Récupère les noms des clients (profiles) pour une liste d'UUID. */
async function fetchNames(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const { data } = await supabaseBrowser()
    .from('profiles')
    .select('id, full_name, phone')
    .in('id', ids)
    .returns<{ id: string; full_name: string | null; phone: string | null }[]>();
  for (const p of data ?? []) {
    map.set(p.id, p.full_name || p.phone || 'Client');
  }
  return map;
}

export default function ProDashboardPage() {
  const { toasts, push, dismiss } = useToasts();

  const [phase, setPhase] = useState<Phase>('loading');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [realtimeNote, setRealtimeNote] = useState<string | null>(null);

  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [venueId, setVenueId] = useState<string>('');
  const [reservations, setReservations] = useState<ResaRow[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  const [notifOpen, setNotifOpen] = useState(false);

  const flash = useCallback((id: string) => {
    setFlashIds((prev) => new Set(prev).add(id));
    setTimeout(() => {
      setFlashIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 1600);
  }, []);

  // --- Bootstrap : config -> session -> venues -> notifications -------------
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setPhase('unconfigured');
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const supabase = supabaseBrowser();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (cancelled) return;
        if (!session) {
          setPhase('signed_out');
          return;
        }
        const uid = session.user.id;
        setOwnerId(uid);

        const { data: venueData, error: venueErr } = await supabase
          .from('venues')
          .select('*')
          .eq('owner_id', uid)
          .order('created_at', { ascending: true })
          .returns<Venue[]>();
        if (cancelled) return;
        if (venueErr) {
          setErrorMsg(venueErr.message);
          setPhase('error');
          return;
        }
        const list = venueData ?? [];
        setVenues(list);

        // Notifications — table issue de la migration 0002 (tolérant si absente).
        const { data: notifData } = await supabase
          .from('notifications')
          .select('*')
          .eq('user_id', uid)
          .order('created_at', { ascending: false })
          .limit(50)
          .returns<AppNotification[]>();
        if (!cancelled && notifData) setNotifications(notifData);

        if (list.length === 0) {
          setPhase('no_venue');
          return;
        }
        setVenueId(list[0].id);
        setPhase('ready');
      } catch (err) {
        if (cancelled) return;
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setPhase('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // --- Charge les réservations du venue sélectionné ------------------------
  useEffect(() => {
    if (!venueId) return;
    let cancelled = false;

    (async () => {
      try {
        const supabase = supabaseBrowser();
        const { data, error } = await supabase
          .from('reservations')
          .select('*')
          .eq('venue_id', venueId)
          .order('created_at', { ascending: false })
          .limit(100)
          .returns<Reservation[]>();
        if (cancelled) return;
        if (error) {
          setErrorMsg(error.message);
          setPhase('error');
          return;
        }
        const rows = data ?? [];
        const names = await fetchNames([...new Set(rows.map((r) => r.user_id))]);
        if (cancelled) return;
        setReservations(
          rows.map((r) => ({ ...r, clientName: names.get(r.user_id) ?? 'Client' })),
        );
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : String(err));
          setPhase('error');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [venueId]);

  // --- Realtime : reservations (table + KPIs) ------------------------------
  const resaStatus = useRealtime<Reservation>({
    table: 'reservations',
    filter: venueId ? `venue_id=eq.${venueId}` : undefined,
    enabled: phase === 'ready' && !!venueId,
    onInsert: (row) => {
      setReservations((prev) =>
        prev.some((r) => r.id === row.id) ? prev : [{ ...row }, ...prev],
      );
      flash(row.id);
      void (async () => {
        try {
          const names = await fetchNames([row.user_id]);
          const name = names.get(row.user_id) ?? 'Client';
          setReservations((prev) =>
            prev.map((r) => (r.id === row.id ? { ...r, clientName: name } : r)),
          );
        } catch {
          /* nom non critique */
        }
      })();
    },
    onUpdate: (row) => {
      setReservations((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...row } : r)));
      flash(row.id);
    },
    onDelete: (old) => {
      if (old.id) setReservations((prev) => prev.filter((r) => r.id !== old.id));
    },
    onError: setRealtimeNote,
  });

  // --- Realtime : notifications (source unique des toasts) -----------------
  const notifStatus = useRealtime<AppNotification>({
    table: 'notifications',
    filter: ownerId ? `user_id=eq.${ownerId}` : undefined,
    enabled: !!ownerId,
    onInsert: (n) => {
      setNotifications((prev) => [n, ...prev].slice(0, 50));
      push({
        variant: n.type === 'payment' ? 'success' : 'info',
        title: n.title,
        body: n.body ?? undefined,
      });
    },
    onUpdate: (n) => {
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? n : x)));
    },
    onError: setRealtimeNote,
  });

  // --- Realtime : transactions (paiements du compte Pro) -------------------
  const txStatus = useRealtime<Transaction>({
    table: 'transactions',
    filter: ownerId ? `user_id=eq.${ownerId}` : undefined,
    enabled: !!ownerId,
    onInsert: (tx) => {
      push({
        variant: tx.status === 'success' ? 'success' : 'info',
        title: `Transaction — ${TX_LABEL[tx.type] ?? tx.type}`,
        body: formatXOF(tx.amount_xof),
      });
    },
    onError: setRealtimeNote,
  });

  const liveStatus = combineStatus(resaStatus, notifStatus, txStatus);

  useEffect(() => {
    if (liveStatus === 'live') setRealtimeNote(null);
  }, [liveStatus]);

  const venue = useMemo(
    () => venues.find((v) => v.id === venueId) ?? null,
    [venues, venueId],
  );

  const kpis = useMemo(() => {
    const today = reservations.filter((r) => isToday(r.date_time));
    const count = today.length;
    const revenue = today
      .filter((r) => PAID_STATUSES.has(r.status))
      .reduce((sum, r) => sum + (r.deposit_xof ?? 0), 0);
    const noShow = today.filter((r) => r.status === 'no_show').length;
    const noShowPct = count ? Math.round((noShow / count) * 100) : 0;
    return { count, revenue, noShowPct };
  }, [reservations]);

  const unread = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications],
  );

  async function markAllRead() {
    if (!ownerId || unread === 0) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      // Le type Database manuel ("minimal") n'expose pas de payload d'update
      // typé : cast localisé en attendant la régénération via `pnpm db:types`.
      // L'UI est déjà mise à jour de façon optimiste ci-dessus.
      await supabaseBrowser()
        .from('notifications')
        .update({ read: true } as never)
        .eq('user_id', ownerId)
        .eq('read', false);
    } catch {
      /* mise à jour déjà optimiste côté UI */
    }
  }

  async function signOut() {
    try {
      await supabaseBrowser().auth.signOut();
    } catch {
      /* ignore */
    }
    setOwnerId(null);
    setVenues([]);
    setVenueId('');
    setReservations([]);
    setNotifications([]);
    setPhase('signed_out');
  }

  let content: React.ReactNode;

  if (phase === 'ready') {
    const pill = STATUS_PILL[liveStatus];
    content = (
      <div className="min-h-screen bg-light">
        <header className="bg-white shadow-sm">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
            <Link href="/" className="text-xl font-bold">
              <span>Soutra</span>
              <span className="text-primary-500">-Paiya Pro</span>
            </Link>
            <div className="flex items-center gap-3">
              <span
                className={`hidden items-center gap-1.5 text-xs font-medium sm:flex ${pill.text}`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${pill.dot} ${liveStatus === 'live' ? 'animate-pulse' : ''}`}
                />
                {pill.label}
              </span>

              {venues.length > 1 ? (
                <select
                  value={venueId}
                  onChange={(e) => setVenueId(e.target.value)}
                  className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
                >
                  {venues.map((v) => (
                    <option key={v.id} value={v.id}>
                      🏪 {v.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="rounded-md border border-neutral-200 px-3 py-2 text-sm">
                  🏪 {venue?.name}
                </span>
              )}

              {/* Cloche notifications */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setNotifOpen((o) => !o)}
                  aria-label="Notifications"
                  className="relative rounded-md border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
                >
                  🔔
                  {unread > 0 && (
                    <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
                      {unread > 9 ? '9+' : unread}
                    </span>
                  )}
                </button>
                {notifOpen && (
                  <div className="absolute right-0 z-40 mt-2 w-80 rounded-lg border border-neutral-200 bg-white shadow-xl">
                    <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-2">
                      <span className="text-sm font-semibold">Notifications</span>
                      <button
                        type="button"
                        onClick={markAllRead}
                        className="text-xs text-primary-500 hover:underline disabled:opacity-40"
                        disabled={unread === 0}
                      >
                        Tout marquer lu
                      </button>
                    </div>
                    <div className="max-h-80 overflow-auto">
                      {notifications.length === 0 ? (
                        <div className="px-4 py-6 text-center text-sm text-neutral-400">
                          Aucune notification
                        </div>
                      ) : (
                        notifications.slice(0, 20).map((n) => (
                          <div
                            key={n.id}
                            className={`border-b border-neutral-50 px-4 py-2.5 text-sm ${n.read ? '' : 'bg-primary-50'}`}
                          >
                            <div className="font-medium">{n.title}</div>
                            {n.body && (
                              <div className="text-xs text-neutral-500">{n.body}</div>
                            )}
                            <div className="mt-0.5 text-[10px] text-neutral-400">
                              {formatDateTime(n.created_at)}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={signOut}
                className="rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-50"
              >
                Déconnexion
              </button>
            </div>
          </div>
        </header>

        <div className="mx-auto flex max-w-7xl gap-6 px-6 py-8">
          <aside className="hidden w-56 shrink-0 md:block">
            <nav className="space-y-1">
              {[
                { label: "Vue d'ensemble", icon: '📊', active: true },
                { label: 'Réservations', icon: '📅' },
                { label: 'Événements', icon: '🎫' },
                { label: 'Menu', icon: '🍽️' },
                { label: 'Finances', icon: '💰' },
                { label: 'Paramètres', icon: '⚙️' },
              ].map((item) => (
                <span
                  key={item.label}
                  className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm ${
                    item.active
                      ? 'bg-primary-500 text-white'
                      : 'text-neutral-700 hover:bg-neutral-100'
                  }`}
                >
                  <span>{item.icon}</span>
                  {item.label}
                </span>
              ))}
            </nav>
          </aside>

          <main className="min-w-0 flex-1">
            <div className="mb-6">
              <h1 className="font-display text-2xl font-bold">{venue?.name}</h1>
              <p className="text-neutral-500">
                Tableau de bord en temps réel — données live Supabase.
              </p>
            </div>

            {realtimeNote && liveStatus === 'error' && (
              <div className="mb-4 rounded-md bg-warning/15 p-3 text-sm text-yellow-800">
                ⚠️ {realtimeNote}
              </div>
            )}

            <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
              <Kpi label="Réservations (jour)" value={String(kpis.count)} />
              <Kpi label="Encaissements (jour)" value={formatXOF(kpis.revenue)} />
              <Kpi
                label="No-show (jour)"
                value={`${kpis.noShowPct}%`}
                tone={kpis.noShowPct > 20 ? 'danger' : 'normal'}
              />
              <Kpi
                label="Note"
                value={`★ ${venue?.rating_avg ?? 0}`}
                hint={`${venue?.rating_count ?? 0} avis`}
              />
            </div>

            <section className="card">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold">
                  Réservations ({reservations.length})
                </h2>
                <span className={`flex items-center gap-1.5 text-xs ${pill.text}`}>
                  <span
                    className={`h-2 w-2 rounded-full ${pill.dot} ${liveStatus === 'live' ? 'animate-pulse' : ''}`}
                  />
                  {pill.label}
                </span>
              </div>

              {reservations.length === 0 ? (
                <p className="py-8 text-center text-sm text-neutral-400">
                  Aucune réservation pour le moment. Les nouvelles apparaîtront ici
                  instantanément.
                </p>
              ) : (
                <div className="max-h-[460px] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white text-left text-neutral-500">
                      <tr>
                        <th className="pb-2">Date</th>
                        <th>Client</th>
                        <th>Pers.</th>
                        <th>Acompte</th>
                        <th>Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reservations.map((r) => {
                        const st = RESA_STATUS[r.status] ?? {
                          label: r.status,
                          cls: 'bg-neutral-100 text-neutral-500',
                        };
                        return (
                          <tr
                            key={r.id}
                            className={`border-t border-neutral-100 ${
                              flashIds.has(r.id) ? 'row-flash' : ''
                            }`}
                          >
                            <td className="py-3 font-mono text-xs">
                              {formatDateTime(r.date_time)}
                            </td>
                            <td className="font-medium">{r.clientName ?? 'Client'}</td>
                            <td>{r.party_size}</td>
                            <td className="font-mono">{formatXOF(r.deposit_xof ?? 0)}</td>
                            <td>
                              <span
                                className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}
                              >
                                {st.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </main>
        </div>
      </div>
    );
  } else {
    content = <GateScreen phase={phase} errorMsg={errorMsg} />;
  }

  return (
    <>
      {content}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone = 'normal',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'normal' | 'danger';
}) {
  return (
    <div className="card">
      <div className="text-xs text-neutral-500">{label}</div>
      <div
        className={`mt-1 font-display text-2xl font-bold ${
          tone === 'danger' ? 'text-danger' : ''
        }`}
      >
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-neutral-400">{hint}</div>}
    </div>
  );
}

function GateScreen({
  phase,
  errorMsg,
}: {
  phase: Phase;
  errorMsg: string | null;
}) {
  const MESSAGES: Record<string, { title: string; body: React.ReactNode }> = {
    loading: { title: 'Chargement…', body: 'Connexion au dashboard en cours.' },
    unconfigured: {
      title: 'Supabase non configuré',
      body: (
        <>
          Renseigne <code>NEXT_PUBLIC_SUPABASE_URL</code> et{' '}
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> dans{' '}
          <code>apps/web/.env.local</code> (local) ou les variables
          d&apos;environnement du projet (Vercel).
        </>
      ),
    },
    signed_out: {
      title: 'Connexion requise',
      body: 'Connecte-toi avec ton compte établissement pour accéder au dashboard.',
    },
    no_venue: {
      title: 'Aucun établissement',
      body: "Ce compte n'a pas encore d'établissement rattaché (table venues).",
    },
    error: { title: 'Erreur', body: errorMsg ?? 'Une erreur est survenue.' },
  };
  const m = MESSAGES[phase] ?? MESSAGES.error;

  return (
    <main className="flex min-h-screen items-center justify-center bg-light px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 text-center shadow-lg">
        <Link href="/" className="font-display text-2xl font-bold">
          <span>Soutra</span>
          <span className="text-primary-500">-Paiya Pro</span>
        </Link>
        <h1 className="mt-6 text-lg font-semibold">{m.title}</h1>
        <p className="mt-2 text-sm text-neutral-600">{m.body}</p>
        {phase === 'signed_out' && (
          <Link href="/login" className="btn-primary mt-6 inline-flex">
            Se connecter
          </Link>
        )}
        {phase === 'error' && (
          <Link href="/login" className="btn-secondary mt-6 inline-flex">
            Retour à la connexion
          </Link>
        )}
      </div>
    </main>
  );
}
