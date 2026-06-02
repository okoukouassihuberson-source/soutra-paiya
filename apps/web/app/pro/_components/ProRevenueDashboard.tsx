'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase';
import { formatXOF } from '@soutra/shared';

// ============================================================================
// Pro Revenue Dashboard — bloc à intégrer dans l'onglet Finances de /pro.
//
// Côté gérant : il voit ses revenus bruts (montant des flux), la commission
// retenue par Soutra-Playce, son revenu net, les frais qu'on lui facture +
// la timeline jour par jour et le détail des derniers events.
// ============================================================================

interface SummaryPro {
  gross_xof: number;
  commission_xof: number;
  net_xof: number;
  billable_xof: number;
  event_count: number;
  reservation_events: number;
  ticket_events: number;
  payment_events: number;
  previous_commission_xof: number;
  delta_pct: number | null;
  commission_rate_pct: number;
}

interface ByKind {
  kind: string;
  total_xof: number;
  event_count: number;
}

interface TimelineRow {
  day: string;
  gross_xof: number;
  commission_xof: number;
  net_xof: number;
  event_count: number;
}

interface EventRow {
  id: string;
  ts: string;
  kind: string;
  amount_xof: number;
  reservation_id: string | null;
  ticket_id: string | null;
  transaction_id: string | null;
  rule_name: string | null;
  metadata: Record<string, unknown>;
}

const KIND_META: Record<string, { label: string; emoji: string; tone: string }> = {
  reservation_commission_pct:   { label: 'Commission réservation',  emoji: '🍽️', tone: 'text-blue-600' },
  reservation_commission_fixed: { label: 'Commission résa (fixe)',  emoji: '🍽️', tone: 'text-blue-600' },
  service_fee_pct:              { label: 'Frais de service',        emoji: '💼', tone: 'text-purple-600' },
  service_fee_fixed:            { label: 'Frais de service (fixe)', emoji: '💼', tone: 'text-purple-600' },
  payment_commission:           { label: 'Commission paiement',     emoji: '💳', tone: 'text-emerald-600' },
  subscription_commission:      { label: 'Commission abonnement',   emoji: '📅', tone: 'text-amber-600' },
  ticket_commission:            { label: 'Commission billetterie',  emoji: '🎟️', tone: 'text-fuchsia-600' },
  marketplace_commission:       { label: 'Commission marketplace',  emoji: '🛍️', tone: 'text-rose-600' },
  affiliation_commission:       { label: 'Commission affiliation',  emoji: '🤝', tone: 'text-cyan-600' },
  user_cashback:                { label: 'Cashback utilisateur',    emoji: '🎁', tone: 'text-green-600' },
  loyalty_bonus:                { label: 'Bonus fidélité',          emoji: '⭐', tone: 'text-yellow-600' },
  featured_listing:             { label: 'Mise en avant',           emoji: '⬆️', tone: 'text-indigo-600' },
  advertising:                  { label: 'Publicité',               emoji: '📣', tone: 'text-indigo-600' },
  account_verification:         { label: 'Vérification compte',     emoji: '✅', tone: 'text-teal-600' },
  venue_certification:          { label: 'Certification venue',     emoji: '🏅', tone: 'text-teal-600' },
  event_publication:            { label: 'Publication événement',   emoji: '📅', tone: 'text-pink-600' },
  promo_publication:            { label: 'Publication promo',       emoji: '🏷️', tone: 'text-pink-600' },
};

const PERIODS: { id: string; label: string; days: number }[] = [
  { id: '7d', label: '7 jours', days: 7 },
  { id: '30d', label: '30 jours', days: 30 },
  { id: '90d', label: '90 jours', days: 90 },
];

export function ProRevenueDashboard({ venueId }: { venueId: string }) {
  const sb = supabaseBrowser();
  const [period, setPeriod] = useState('30d');
  const [summary, setSummary] = useState<SummaryPro | null>(null);
  const [byKind, setByKind] = useState<ByKind[]>([]);
  const [timeline, setTimeline] = useState<TimelineRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEvents, setShowEvents] = useState(false);

  const load = useCallback(async () => {
    if (!venueId) return;
    setLoading(true);
    const days = PERIODS.find((p) => p.id === period)?.days ?? 30;
    const from = new Date(Date.now() - days * 86400000).toISOString();
    const to = new Date().toISOString();
    try {
      const [s, k, t, ev] = await Promise.all([
        (sb.rpc as any)('get_pro_revenue_summary', { p_venue_id: venueId, p_from: from, p_to: to }),
        (sb.rpc as any)('get_pro_revenue_by_kind', { p_venue_id: venueId, p_from: from, p_to: to }),
        (sb.rpc as any)('get_pro_revenue_timeline', { p_venue_id: venueId, p_days: days }),
        (sb.rpc as any)('list_pro_revenue_events', { p_venue_id: venueId, p_limit: 50 }),
      ]);
      if (s.error) { console.error('[pro summary]', s.error); setSummary(null); }
      else setSummary(s.data as SummaryPro);
      if (k.error) { console.error('[pro by kind]', k.error); setByKind([]); }
      else setByKind((k.data as ByKind[]) ?? []);
      if (t.error) { console.error('[pro timeline]', t.error); setTimeline([]); }
      else setTimeline((t.data as TimelineRow[]) ?? []);
      if (ev.error) { console.error('[pro events]', ev.error); setEvents([]); }
      else setEvents((ev.data as EventRow[]) ?? []);
    } finally {
      setLoading(false);
    }
  }, [sb, venueId, period]);

  useEffect(() => { void load(); }, [load]);

  const maxNet = useMemo(() => Math.max(1, ...timeline.map((r) => r.gross_xof)), [timeline]);

  if (!venueId) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 text-sm text-neutral-500">
        Sélectionne un établissement pour voir tes revenus.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Period filter */}
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Revenus Soutra-Playce</p>
        <div className="ml-auto flex gap-2">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                period === p.id
                  ? 'border-primary-500 bg-primary-500 text-white'
                  : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs principales */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <ProKpi label="Revenus bruts" value={summary ? formatXOF(summary.gross_xof) : '—'} sub="Total des flux" emoji="📈" tone="blue" loading={loading} />
        <ProKpi
          label="Commission Soutra"
          value={summary ? formatXOF(summary.commission_xof) : '—'}
          sub={summary ? `${summary.commission_rate_pct}% du brut` : ''}
          emoji="🏷️"
          tone="amber"
          loading={loading}
        />
        <ProKpi
          label="Revenus nets"
          value={summary ? formatXOF(summary.net_xof) : '—'}
          sub="Brut – commission"
          emoji="💰"
          tone="emerald"
          loading={loading}
        />
        <ProKpi
          label="Frais facturés"
          value={summary ? formatXOF(summary.billable_xof) : '—'}
          sub="Mise en avant, pub…"
          emoji="🧾"
          tone="purple"
          loading={loading}
        />
      </div>

      {/* Variation vs. période préc */}
      {summary?.delta_pct != null && (
        <div className={`rounded-xl border px-4 py-2 text-xs ${
          summary.delta_pct >= 0
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
            : 'border-red-200 bg-red-50 text-red-800'
        }`}>
          {summary.delta_pct >= 0 ? '📈' : '📉'}{' '}
          <strong>{summary.delta_pct > 0 ? '+' : ''}{summary.delta_pct}%</strong>{' '}
          de commission par rapport à la période précédente
          ({formatXOF(summary.previous_commission_xof)} → {formatXOF(summary.commission_xof)})
        </div>
      )}

      {/* Timeline brut vs net */}
      {timeline.length > 0 && (
        <div className="rounded-2xl border border-neutral-200 bg-white p-6">
          <h3 className="mb-4 font-display text-base font-bold text-dark">Évolution brut vs net</h3>
          <div className="flex h-40 items-end gap-1">
            {timeline.map((r, i) => {
              const grossH = Math.max(4, (r.gross_xof / maxNet) * 100);
              const netH = Math.max(2, (r.net_xof / maxNet) * 100);
              return (
                <div key={i} className="group relative flex flex-1 flex-col items-center justify-end gap-1">
                  <div className="absolute -top-7 z-10 hidden whitespace-nowrap rounded-md bg-neutral-900 px-2 py-1 text-[10px] text-white group-hover:block">
                    {formatXOF(r.net_xof)} net / {formatXOF(r.gross_xof)} brut
                  </div>
                  {/* Barre brute (en arrière-plan, plus claire) */}
                  <div className="relative w-full">
                    <div
                      className="absolute bottom-0 w-full rounded-t-sm bg-blue-200"
                      style={{ height: `${grossH * 1.6}px` }}
                    />
                    <div
                      className="relative w-full rounded-t-sm bg-emerald-500"
                      style={{ height: `${netH * 1.6}px` }}
                    />
                  </div>
                  {timeline.length <= 14 && (
                    <span className="text-[8px] text-neutral-400">{r.day.slice(5)}</span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-center gap-4 text-[10px] text-neutral-500">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-200" /> Brut</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Net (après commission)</span>
          </div>
        </div>
      )}

      {/* Ventilation par source */}
      {byKind.length > 0 && (
        <div className="rounded-2xl border border-neutral-200 bg-white p-6">
          <h3 className="mb-4 font-display text-base font-bold text-dark">Détail par source</h3>
          <ul className="space-y-2">
            {byKind.map((b) => {
              const meta = KIND_META[b.kind] ?? { label: b.kind, emoji: '💼', tone: 'text-neutral-600' };
              const max = Math.max(1, ...byKind.map((x) => x.total_xof));
              const pct = (b.total_xof / max) * 100;
              return (
                <li key={b.kind}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-neutral-800">{meta.emoji} {meta.label}</span>
                    <span className={`ml-2 font-mono font-bold ${meta.tone}`}>
                      {formatXOF(b.total_xof)} <span className="text-neutral-400">({b.event_count})</span>
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-neutral-100">
                    <div className="h-full bg-gradient-to-r from-primary-500 to-emerald-500" style={{ width: `${Math.max(2, pct)}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Empty state si rien à afficher */}
      {!loading && (!summary || (summary.event_count === 0)) && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          <p className="font-semibold">Aucun revenu enregistré sur cette période.</p>
          <p className="mt-1 text-xs text-amber-700">
            Les revenus apparaîtront ici dès que tu auras de nouvelles réservations honorées,
            billets vendus ou paiements reçus. Si l'historique est ancien, demande à l'admin de
            lancer le backfill depuis le Super Dashboard.
          </p>
        </div>
      )}

      {/* Détail des events (collapse) */}
      {events.length > 0 && (
        <div className="rounded-2xl border border-neutral-200 bg-white">
          <button
            onClick={() => setShowEvents((v) => !v)}
            className="flex w-full items-center justify-between border-b border-neutral-100 px-6 py-4 text-left"
          >
            <h3 className="font-display text-base font-bold text-dark">
              📋 Détail des {events.length} dernières lignes de commission
            </h3>
            <span className="text-xs text-neutral-500">{showEvents ? 'Masquer' : 'Afficher'}</span>
          </button>
          {showEvents && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-neutral-100 text-left font-semibold uppercase tracking-wider text-neutral-400">
                    <th className="px-6 py-3">Date</th>
                    <th className="px-6 py-3">Type</th>
                    <th className="px-6 py-3">Montant</th>
                    <th className="px-6 py-3">Règle</th>
                    <th className="px-6 py-3">Lien</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => {
                    const meta = KIND_META[e.kind] ?? { label: e.kind, emoji: '💼', tone: 'text-neutral-600' };
                    const link =
                      e.reservation_id ? `Resa ${e.reservation_id.slice(0, 6)}…`
                        : e.ticket_id ? `Ticket ${e.ticket_id.slice(0, 6)}…`
                        : e.transaction_id ? `Tx ${e.transaction_id.slice(0, 6)}…`
                        : '—';
                    return (
                      <tr key={e.id} className="border-b border-neutral-50 hover:bg-neutral-50/50">
                        <td className="px-6 py-2 font-mono text-neutral-500">
                          {new Date(e.ts).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-6 py-2"><span className={meta.tone}>{meta.emoji} {meta.label}</span></td>
                        <td className="px-6 py-2 font-mono font-semibold text-neutral-800">{formatXOF(e.amount_xof)}</td>
                        <td className="px-6 py-2 text-neutral-500">{e.rule_name || '—'}</td>
                        <td className="px-6 py-2 text-neutral-500">{link}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProKpi({ label, value, sub, emoji, tone, loading }: {
  label: string; value: string; sub: string; emoji: string;
  tone: 'blue' | 'emerald' | 'amber' | 'purple'; loading: boolean;
}) {
  const map = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
  } as const;
  return (
    <div className={`rounded-2xl border ${map[tone]} p-4`}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wide opacity-70">{label}</p>
        <span className="text-lg">{emoji}</span>
      </div>
      <p className="mt-1 font-display text-xl font-bold sm:text-2xl">
        {loading ? '…' : value}
      </p>
      {sub && <p className="text-[10px] opacity-60">{sub}</p>}
    </div>
  );
}
