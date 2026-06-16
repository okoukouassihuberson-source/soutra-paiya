'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { supabaseBrowser } from '@/lib/supabase';
import { formatXOF } from '@soutra/shared';

/* ─────────────────────────────────────────────────── *
 *  TYPES — miroir d'admin_cashback_stats (migration 0053) *
 * ─────────────────────────────────────────────────── */

type PlanCode = 'free' | 'standard' | 'pro' | 'premium' | 'soutra_premium';

interface PlanBreakdown {
  plan_code: PlanCode;
  display_name: string;
  paid_out_xof: number;
  count: number;
  unique_users: number;
  cashback_bps: number | null;
  is_recommended: boolean;
  is_prestige: boolean;
}

interface DayPoint {
  day: string; // YYYY-MM-DD
  cashback_xof: number;
  count: number;
}

interface TopUser {
  user_id: string;
  full_name: string | null;
  phone: string | null;
  total_xof: number;
  count: number;
  last_cashback_at: string;
}

interface RecentRow {
  tx_id: string;
  user_id: string;
  full_name: string | null;
  phone: string | null;
  amount_xof: number;
  plan_code: string | null;
  source_amount_xof: string | null;
  cashback_bps: string | null;
  created_at: string;
}

interface Stats {
  window_days: number;
  generated_at: string;
  totals: {
    all_time: {
      total_all_time_xof: number;
      count_all_time: number;
      unique_users_all_time: number;
    };
    period: {
      paid_out_xof: number;
      count: number;
      unique_users: number;
      avg_per_tx_xof: number;
      avg_per_user_xof: number;
    };
  };
  by_plan: PlanBreakdown[];
  by_day: DayPoint[];
  top_users: TopUser[];
  recent_cashbacks: RecentRow[];
}

const PLAN_COLORS: Record<PlanCode, string> = {
  free: '#6b7280',
  standard: '#f97316',
  pro: '#3b82f6',
  premium: '#a855f7',
  soutra_premium: '#f59e0b',
};

/* ─────────────────────────────────────────────────── *
 *  MAIN COMPONENT                                     *
 * ─────────────────────────────────────────────────── */

export function CashbackTab() {
  const sb = supabaseBrowser();
  const [windowDays, setWindowDays] = useState(30);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (days: number) => {
    setLoading(true);
    setError(null);
    const { data, error } = await (sb.rpc as any)('admin_cashback_stats', {
      p_window_days: days,
    });
    if (error) {
      setError(error.message || 'Erreur de chargement');
      setStats(null);
    } else {
      setStats(data as Stats);
    }
    setLoading(false);
  }, [sb]);

  useEffect(() => { load(windowDays); }, [load, windowDays]);

  if (loading && !stats) {
    return (
      <div className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-12 text-center text-neutral-500">
        Chargement des analytics cashback…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6 text-center">
        <p className="text-sm font-medium text-red-400">Erreur : {error}</p>
        <p className="mt-2 text-xs text-neutral-500">
          La migration 0053 (admin_cashback_stats étendue) est-elle appliquée ?
        </p>
      </div>
    );
  }

  if (!stats) return null;

  const periodAvgRate = stats.totals.period.count > 0
    ? Math.round((stats.totals.period.paid_out_xof / stats.totals.period.count))
    : 0;

  return (
    <div className="space-y-6">
      {/* Window toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-display text-lg font-bold">Analytics Cashback</p>
          <p className="text-xs text-neutral-500">
            Fenêtre : {stats.window_days} jours · généré {formatRelativeTime(stats.generated_at)}
          </p>
        </div>
        <div className="flex gap-2">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setWindowDays(d)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                windowDays === d
                  ? 'border-primary-500 bg-primary-500/15 text-primary-400'
                  : 'border-neutral-800 bg-neutral-900/50 text-neutral-400 hover:border-neutral-700'
              }`}
            >
              {d} jours
            </button>
          ))}
        </div>
      </div>

      {/* ═══════════ KPIs ═══════════ */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KpiCard
          label="Cashback tout temps"
          value={formatXOF(stats.totals.all_time.total_all_time_xof)}
          sub={`${stats.totals.all_time.count_all_time.toLocaleString('fr-FR')} transactions`}
          color="emerald"
        />
        <KpiCard
          label={`Sur ${stats.window_days} jours`}
          value={formatXOF(stats.totals.period.paid_out_xof)}
          sub={`${stats.totals.period.count} transactions`}
          color="blue"
        />
        <KpiCard
          label="Utilisateurs uniques"
          value={stats.totals.period.unique_users}
          sub={`${stats.totals.all_time.unique_users_all_time} all-time`}
          color="purple"
        />
        <KpiCard
          label="Cashback moyen"
          value={formatXOF(periodAvgRate)}
          sub={`par transaction · ${formatXOF(stats.totals.period.avg_per_user_xof)} / user`}
          color="amber"
        />
      </div>

      {/* ═══════════ TIMESERIES ═══════════ */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title={`Cashback distribué par jour (${stats.window_days}j)`}>
          {stats.by_day.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={stats.by_day.map((d) => ({ ...d, day: shortDate(d.day) }))}>
                <defs>
                  <linearGradient id="cbGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#737373' }} />
                <YAxis
                  tick={{ fontSize: 10, fill: '#737373' }}
                  tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                />
                <Tooltip content={<DarkTooltip formatter={(v: number) => formatXOF(v)} />} />
                <Area
                  type="monotone" dataKey="cashback_xof" name="Cashback"
                  stroke="#10b981" fill="url(#cbGrad)" strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </ChartCard>

        <ChartCard title="Cashback distribué par plan">
          {stats.by_plan.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={stats.by_plan.map((p) => ({
                name: p.display_name,
                cashback: p.paid_out_xof,
                code: p.plan_code,
              }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#737373' }} />
                <YAxis
                  tick={{ fontSize: 10, fill: '#737373' }}
                  tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                />
                <Tooltip content={<DarkTooltip formatter={(v: number) => formatXOF(v)} />} />
                <Bar dataKey="cashback" name="Cashback" radius={[6, 6, 0, 0]}>
                  {stats.by_plan.map((p) => (
                    <Cell key={p.plan_code} fill={PLAN_COLORS[p.plan_code] ?? '#6b7280'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart label="Aucun cashback sur la fenêtre" />}
        </ChartCard>
      </div>

      {/* ═══════════ TABLEAU PAR PLAN ═══════════ */}
      <div className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50">
        <div className="border-b border-neutral-800/50 px-6 py-4">
          <h3 className="text-sm font-semibold text-neutral-400">Performance par plan</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-800/50 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                <th className="px-6 py-3">Plan</th>
                <th className="px-6 py-3">Taux</th>
                <th className="px-6 py-3">Cashback total</th>
                <th className="px-6 py-3">Transactions</th>
                <th className="px-6 py-3">Users uniques</th>
                <th className="px-6 py-3">Moy / tx</th>
              </tr>
            </thead>
            <tbody>
              {stats.by_plan.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-neutral-500">
                  Aucun cashback distribué sur la fenêtre.
                </td></tr>
              ) : stats.by_plan.map((p) => {
                const avg = p.count > 0 ? Math.round(p.paid_out_xof / p.count) : 0;
                return (
                  <tr key={p.plan_code} className="border-b border-neutral-800/30 transition hover:bg-neutral-800/20">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ background: PLAN_COLORS[p.plan_code] ?? '#6b7280' }}
                        />
                        <span className="font-medium">{p.display_name}</span>
                        {p.is_recommended && (
                          <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-bold text-blue-400">RECO</span>
                        )}
                        {p.is_prestige && (
                          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-400">PRESTIGE</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-3 font-mono text-xs text-emerald-400">
                      {p.cashback_bps != null ? `${(p.cashback_bps / 100).toFixed(p.cashback_bps % 100 === 0 ? 0 : 1)}%` : '—'}
                    </td>
                    <td className="px-6 py-3 font-mono font-bold">{formatXOF(p.paid_out_xof)}</td>
                    <td className="px-6 py-3 font-mono">{p.count}</td>
                    <td className="px-6 py-3 font-mono">{p.unique_users}</td>
                    <td className="px-6 py-3 font-mono text-xs text-neutral-400">{formatXOF(avg)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══════════ TOP USERS LEADERBOARD ═══════════ */}
      <div className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50">
        <div className="border-b border-neutral-800/50 px-6 py-4">
          <h3 className="text-sm font-semibold text-neutral-400">
            Top 10 utilisateurs ({stats.window_days}j)
          </h3>
          <p className="mt-0.5 text-xs text-neutral-500">
            Classement des utilisateurs ayant reçu le plus de cashback sur la fenêtre
          </p>
        </div>
        {stats.top_users.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-neutral-500">
            Aucun cashback distribué sur la fenêtre.
          </div>
        ) : (
          <ul className="divide-y divide-neutral-800/50">
            {stats.top_users.map((u, i) => (
              <li key={u.user_id} className="flex flex-wrap items-center gap-3 px-6 py-3.5">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                  i === 0 ? 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/40' :
                  i === 1 ? 'bg-neutral-400/20 text-neutral-300 ring-1 ring-neutral-500/40' :
                  i === 2 ? 'bg-orange-500/20 text-orange-400 ring-1 ring-orange-500/40' :
                  'bg-neutral-800 text-neutral-500'
                }`}>
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {u.full_name || '— (sans nom)'}
                  </p>
                  <p className="font-mono text-[11px] text-neutral-500">
                    {u.phone || '—'} · dernier {formatRelativeTime(u.last_cashback_at)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm font-bold text-emerald-400">{formatXOF(u.total_xof)}</p>
                  <p className="text-[11px] text-neutral-500">{u.count} tx</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ═══════════ DERNIÈRES TX CASHBACK ═══════════ */}
      <div className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50">
        <div className="border-b border-neutral-800/50 px-6 py-4">
          <h3 className="text-sm font-semibold text-neutral-400">
            Dernières transactions cashback ({stats.recent_cashbacks.length})
          </h3>
        </div>
        {stats.recent_cashbacks.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-neutral-500">
            Aucune transaction cashback enregistrée.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-800/50 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Utilisateur</th>
                  <th className="px-6 py-3">Plan</th>
                  <th className="px-6 py-3">Taux</th>
                  <th className="px-6 py-3 text-right">Montant source</th>
                  <th className="px-6 py-3 text-right">Cashback</th>
                </tr>
              </thead>
              <tbody>
                {stats.recent_cashbacks.map((r) => {
                  const planCode = r.plan_code as PlanCode | null;
                  const bps = r.cashback_bps ? Number(r.cashback_bps) : null;
                  const src = r.source_amount_xof ? Number(r.source_amount_xof) : null;
                  return (
                    <tr key={r.tx_id} className="border-b border-neutral-800/30 transition hover:bg-neutral-800/20">
                      <td className="px-6 py-3 text-xs text-neutral-400">
                        {formatRelativeTime(r.created_at)}
                      </td>
                      <td className="px-6 py-3">
                        <p className="text-sm font-medium">{r.full_name || '—'}</p>
                        <p className="font-mono text-[10px] text-neutral-500">{r.phone || '—'}</p>
                      </td>
                      <td className="px-6 py-3">
                        {planCode ? (
                          <span className="inline-flex items-center gap-1.5 text-xs">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ background: PLAN_COLORS[planCode] ?? '#6b7280' }}
                            />
                            {planCode}
                          </span>
                        ) : <span className="text-neutral-600">—</span>}
                      </td>
                      <td className="px-6 py-3 font-mono text-xs text-emerald-400">
                        {bps != null ? `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%` : '—'}
                      </td>
                      <td className="px-6 py-3 text-right font-mono text-xs text-neutral-400">
                        {src != null ? formatXOF(src) : '—'}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <span className="font-mono text-sm font-bold text-emerald-400">
                          +{formatXOF(r.amount_xof)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────── *
 *  SUB-COMPONENTS                                     *
 * ─────────────────────────────────────────────────── */

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-6">
      <h3 className="mb-4 text-sm font-semibold text-neutral-400">{title}</h3>
      {children}
    </div>
  );
}

function EmptyChart({ label = 'Aucune donnée' }: { label?: string }) {
  return (
    <div className="flex h-[260px] items-center justify-center text-sm text-neutral-600">
      {label}
    </div>
  );
}

function DarkTooltip({ active, payload, label, formatter }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 shadow-2xl">
      {label && <p className="mb-1 text-xs text-neutral-500">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-sm font-medium" style={{ color: p.color || p.payload?.fill }}>
          {p.name}: {formatter ? formatter(p.value) : p.value.toLocaleString('fr-FR')}
        </p>
      ))}
    </div>
  );
}

function KpiCard({
  label, value, sub, color,
}: {
  label: string;
  value: number | string;
  sub: string;
  color: 'blue' | 'emerald' | 'amber' | 'red' | 'purple';
}) {
  const map = {
    blue:    { bg: 'bg-blue-500/10',    text: 'text-blue-400',    ring: 'ring-blue-500/20' },
    emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', ring: 'ring-emerald-500/20' },
    amber:   { bg: 'bg-amber-500/10',   text: 'text-amber-400',   ring: 'ring-amber-500/20' },
    red:     { bg: 'bg-red-500/10',     text: 'text-red-400',     ring: 'ring-red-500/20' },
    purple:  { bg: 'bg-purple-500/10',  text: 'text-purple-400',  ring: 'ring-purple-500/20' },
  } as const;
  const c = map[color];

  return (
    <div className="group rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-4 transition-all hover:border-neutral-700/50 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-medium text-neutral-500 sm:text-xs">{label}</p>
          <p className="mt-1 truncate font-display text-lg font-bold tracking-tight sm:mt-1.5 sm:text-2xl">
            {value}
          </p>
          <p className={`mt-1 truncate text-[11px] ${c.text} sm:text-xs`}>{sub}</p>
        </div>
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl sm:h-10 sm:w-10 ${c.bg} ${c.text} ring-1 ${c.ring}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="1" x2="12" y2="23" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────── *
 *  UTILS                                              *
 * ─────────────────────────────────────────────────── */

function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const day = Math.round(h / 24);
  if (day < 7) return `il y a ${day} j`;
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}
