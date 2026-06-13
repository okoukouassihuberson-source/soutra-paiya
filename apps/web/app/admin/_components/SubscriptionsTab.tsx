'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line,
} from 'recharts';
import { supabaseBrowser } from '@/lib/supabase';
import { formatXOF } from '@soutra/shared';

/* ─────────────────────────────────────────────────── *
 *  TYPES (miroir du JSON renvoyé par                  *
 *  admin_subscription_stats côté SQL — migration 0048) *
 * ─────────────────────────────────────────────────── */

type PlanCode = 'free' | 'standard' | 'pro' | 'premium' | 'soutra_premium';

interface PlanMetrics {
  code: PlanCode;
  display_name: string;
  price_monthly_xof: number;
  cashback_bps: number;
  is_recommended: boolean;
  is_prestige: boolean;
  display_order: number;
  active_subs: number;
  mrr_xof: number;
  clicks_30d: number;
  successes_30d: number;
}

interface DayPoint {
  day: string; // YYYY-MM-DD
  views: number;
  clicks: number;
  successes: number;
  new_subs: number;
  new_paid_subs: number;
}

interface EventRow {
  id: number;
  user_id: string | null;
  session_id: string | null;
  kind: string;
  plan_code: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

interface Stats {
  window_days: number;
  generated_at: string;
  totals: {
    active_subscribers: number;
    paid_subscribers: number;
    mrr_xof: number;
    arr_xof: number;
  };
  funnel: {
    views: number;
    clicks: number;
    attempts: number;
    successes: number;
    abandons: number;
    cancels: number;
    view_to_click_rate: number;
    click_to_attempt_rate: number;
    attempt_to_success_rate: number;
    overall_conversion_rate: number;
    abandon_rate: number;
  };
  churn: {
    churned_count: number;
    denominator: number;
    churn_rate: number;
  };
  per_plan: PlanMetrics[];
  by_day: DayPoint[];
  recent_events: EventRow[];
}

const PLAN_COLORS: Record<PlanCode, string> = {
  free: '#6b7280',
  standard: '#f97316',
  pro: '#3b82f6',
  premium: '#a855f7',
  soutra_premium: '#f59e0b',
};

const EVENT_LABELS: Record<string, { label: string; color: string }> = {
  plan_view:         { label: 'Vue',          color: 'text-neutral-400' },
  plan_click:        { label: 'Clic',         color: 'text-blue-400' },
  subscribe_attempt: { label: 'Tentative',    color: 'text-amber-400' },
  subscribe_success: { label: 'Souscription', color: 'text-emerald-400' },
  subscribe_abandon: { label: 'Abandon',      color: 'text-red-400' },
  cancel:            { label: 'Résiliation',  color: 'text-red-400' },
  plan_change:       { label: 'Changement',   color: 'text-purple-400' },
};

/* ─────────────────────────────────────────────────── *
 *  MAIN COMPONENT                                     *
 * ─────────────────────────────────────────────────── */

export function SubscriptionsTab() {
  const sb = supabaseBrowser();
  const [windowDays, setWindowDays] = useState(30);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (days: number) => {
    setLoading(true);
    setError(null);
    const { data, error } = await (sb.rpc as any)('admin_subscription_stats', {
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
        Chargement des analytics…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6 text-center">
        <p className="text-sm font-medium text-red-400">Erreur : {error}</p>
        <p className="mt-2 text-xs text-neutral-500">
          La migration 0048 (admin_subscription_stats) est-elle appliquée ?
        </p>
      </div>
    );
  }

  if (!stats) return null;

  const topPlan = [...stats.per_plan]
    .filter((p) => p.code !== 'free')
    .sort((a, b) => b.active_subs - a.active_subs)[0];

  return (
    <div className="space-y-6">
      {/* Window toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-display text-lg font-bold">Analytics Abonnements</p>
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
          label="Abonnés actifs"
          value={stats.totals.active_subscribers}
          sub={`${stats.totals.paid_subscribers} payants`}
          color="blue"
          icon="users"
        />
        <KpiCard
          label="MRR"
          value={formatXOF(stats.totals.mrr_xof)}
          sub={`ARR ${formatXOF(stats.totals.arr_xof)}`}
          color="emerald"
          icon="currency"
        />
        <KpiCard
          label="Conversion globale"
          value={`${stats.funnel.overall_conversion_rate}%`}
          sub={`${stats.funnel.successes}/${stats.funnel.views} vues → abo`}
          color={stats.funnel.overall_conversion_rate >= 2 ? 'emerald' : 'amber'}
          icon="trend"
        />
        <KpiCard
          label="Churn"
          value={`${stats.churn.churn_rate}%`}
          sub={`${stats.churn.churned_count} résiliations`}
          color={stats.churn.churn_rate <= 5 ? 'emerald' : 'red'}
          icon="alert"
        />
      </div>

      {/* ═══════════ FUNNEL ═══════════ */}
      <ChartCard title="Funnel de conversion">
        <Funnel funnel={stats.funnel} />
      </ChartCard>

      {/* ═══════════ TIMESERIES ═══════════ */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Vues / Clics / Souscriptions par jour">
          {stats.by_day.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={stats.by_day.map((d) => ({ ...d, day: shortDate(d.day) }))}>
                <defs>
                  <linearGradient id="viewsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6b7280" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#6b7280" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="clicksGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="succGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#737373' }} />
                <YAxis tick={{ fontSize: 10, fill: '#737373' }} />
                <Tooltip content={<DarkTooltip />} />
                <Area type="monotone" dataKey="views" name="Vues" stroke="#6b7280" fill="url(#viewsGrad)" strokeWidth={1.5} />
                <Area type="monotone" dataKey="clicks" name="Clics" stroke="#3b82f6" fill="url(#clicksGrad)" strokeWidth={1.5} />
                <Area type="monotone" dataKey="successes" name="Souscriptions" stroke="#10b981" fill="url(#succGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </ChartCard>

        <ChartCard title="Nouveaux abonnés par jour">
          {stats.by_day.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={stats.by_day.map((d) => ({ ...d, day: shortDate(d.day) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#737373' }} />
                <YAxis tick={{ fontSize: 10, fill: '#737373' }} />
                <Tooltip content={<DarkTooltip />} />
                <Line type="monotone" dataKey="new_subs" name="Tous" stroke="#6b7280" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="new_paid_subs" name="Payants" stroke="#f97316" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </ChartCard>
      </div>

      {/* ═══════════ BREAKDOWN PAR PLAN ═══════════ */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Répartition des abonnés (payants)">
          {stats.per_plan.filter((p) => p.active_subs > 0 && p.code !== 'free').length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={stats.per_plan.filter((p) => p.active_subs > 0 && p.code !== 'free').map((p) => ({
                    name: p.display_name,
                    value: p.active_subs,
                    code: p.code,
                  }))}
                  innerRadius={60}
                  outerRadius={95}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {stats.per_plan.filter((p) => p.active_subs > 0 && p.code !== 'free').map((p) => (
                    <Cell key={p.code} fill={PLAN_COLORS[p.code]} />
                  ))}
                </Pie>
                <Tooltip content={<DarkTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyChart label="Aucun abonné payant" />}
        </ChartCard>

        <ChartCard title="MRR par plan">
          {stats.per_plan.filter((p) => p.mrr_xof > 0).length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={stats.per_plan.filter((p) => p.mrr_xof > 0).map((p) => ({
                name: p.display_name,
                mrr: p.mrr_xof,
                code: p.code,
              }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#737373' }} />
                <YAxis tick={{ fontSize: 10, fill: '#737373' }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip content={<DarkTooltip formatter={(v: number) => formatXOF(v)} />} />
                <Bar dataKey="mrr" name="MRR" radius={[6, 6, 0, 0]}>
                  {stats.per_plan.filter((p) => p.mrr_xof > 0).map((p) => (
                    <Cell key={p.code} fill={PLAN_COLORS[p.code]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart label="Aucun revenu" />}
        </ChartCard>
      </div>

      {/* ═══════════ TABLE PER PLAN ═══════════ */}
      <div className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50">
        <div className="border-b border-neutral-800/50 px-6 py-4">
          <h3 className="text-sm font-semibold text-neutral-400">Performance par plan</h3>
          {topPlan && (
            <p className="mt-1 text-xs text-neutral-500">
              Plan le plus choisi :{' '}
              <strong className="text-white">{topPlan.display_name}</strong>{' '}
              ({topPlan.active_subs} abonnés)
            </p>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-800/50 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                <th className="px-6 py-3">Plan</th>
                <th className="px-6 py-3">Abonnés</th>
                <th className="px-6 py-3">MRR</th>
                <th className="px-6 py-3">Cashback</th>
                <th className="px-6 py-3">Clics ({stats.window_days}j)</th>
                <th className="px-6 py-3">Souscriptions ({stats.window_days}j)</th>
                <th className="px-6 py-3">Conv. clic→abo</th>
              </tr>
            </thead>
            <tbody>
              {stats.per_plan.map((p) => {
                const conv = p.clicks_30d > 0
                  ? Math.round((p.successes_30d / p.clicks_30d) * 1000) / 10
                  : 0;
                return (
                  <tr key={p.code} className="border-b border-neutral-800/30 transition hover:bg-neutral-800/20">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ background: PLAN_COLORS[p.code] }}
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
                    <td className="px-6 py-3 font-mono font-medium">{p.active_subs}</td>
                    <td className="px-6 py-3 font-mono">{formatXOF(p.mrr_xof)}</td>
                    <td className="px-6 py-3 text-emerald-400">{(p.cashback_bps / 100).toFixed(p.cashback_bps % 100 === 0 ? 0 : 1)}%</td>
                    <td className="px-6 py-3 text-neutral-300">{p.clicks_30d}</td>
                    <td className="px-6 py-3 text-emerald-400">{p.successes_30d}</td>
                    <td className="px-6 py-3 font-mono text-xs">{conv}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══════════ EVENTS RÉCENTS ═══════════ */}
      <div className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50">
        <div className="border-b border-neutral-800/50 px-6 py-4">
          <h3 className="text-sm font-semibold text-neutral-400">Derniers événements ({stats.recent_events.length})</h3>
        </div>
        {stats.recent_events.length === 0 ? (
          <div className="p-12 text-center text-sm text-neutral-500">
            Aucun événement enregistré pour l&apos;instant.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-800/50 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Type</th>
                  <th className="px-6 py-3">Plan</th>
                  <th className="px-6 py-3">User</th>
                  <th className="px-6 py-3">Session</th>
                </tr>
              </thead>
              <tbody>
                {stats.recent_events.slice(0, 30).map((e) => {
                  const meta = EVENT_LABELS[e.kind] ?? { label: e.kind, color: 'text-neutral-400' };
                  return (
                    <tr key={e.id} className="border-b border-neutral-800/30 transition hover:bg-neutral-800/20">
                      <td className="px-6 py-3 text-xs text-neutral-400">{formatRelativeTime(e.created_at)}</td>
                      <td className={`px-6 py-3 font-medium ${meta.color}`}>{meta.label}</td>
                      <td className="px-6 py-3 text-xs">
                        {e.plan_code ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full" style={{ background: PLAN_COLORS[e.plan_code as PlanCode] ?? '#6b7280' }} />
                            {e.plan_code}
                          </span>
                        ) : <span className="text-neutral-600">—</span>}
                      </td>
                      <td className="px-6 py-3 text-xs text-neutral-500 font-mono">
                        {e.user_id ? `${e.user_id.slice(0, 8)}…` : <span className="text-neutral-700">anon</span>}
                      </td>
                      <td className="px-6 py-3 text-xs text-neutral-500 font-mono">
                        {e.session_id ? `${e.session_id.slice(0, 12)}…` : <span className="text-neutral-700">—</span>}
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

function Funnel({ funnel }: { funnel: Stats['funnel'] }) {
  const steps: { key: string; label: string; value: number; color: string }[] = [
    { key: 'views',     label: 'Vues',          value: funnel.views,     color: 'bg-neutral-700' },
    { key: 'clicks',    label: 'Clics',         value: funnel.clicks,    color: 'bg-blue-500' },
    { key: 'attempts',  label: 'Tentatives',    value: funnel.attempts,  color: 'bg-amber-500' },
    { key: 'successes', label: 'Souscriptions', value: funnel.successes, color: 'bg-emerald-500' },
  ];
  const max = Math.max(...steps.map((s) => s.value), 1);

  return (
    <div className="space-y-3 p-2">
      {steps.map((step, i) => {
        const pct = (step.value / max) * 100;
        const nextStep = steps[i + 1];
        const conv = nextStep && step.value > 0
          ? Math.round((nextStep.value / step.value) * 1000) / 10
          : null;
        return (
          <div key={step.key}>
            <div className="mb-1 flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-neutral-300">{step.label}</span>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-bold text-white">{step.value.toLocaleString('fr-FR')}</span>
                {conv !== null && (
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    conv >= 50 ? 'bg-emerald-500/15 text-emerald-400'
                    : conv >= 20 ? 'bg-amber-500/15 text-amber-400'
                    : 'bg-red-500/15 text-red-400'
                  }`}>
                    →{conv}%
                  </span>
                )}
              </div>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-neutral-800/50">
              <div
                className={`h-full rounded-full ${step.color} transition-all duration-700`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-neutral-800/50 pt-4 text-xs">
        <div className="text-center">
          <p className="text-neutral-500">Taux abandon</p>
          <p className="mt-1 font-display text-lg font-bold text-red-400">{funnel.abandon_rate}%</p>
        </div>
        <div className="text-center">
          <p className="text-neutral-500">Résiliations</p>
          <p className="mt-1 font-display text-lg font-bold text-amber-400">{funnel.cancels}</p>
        </div>
        <div className="text-center">
          <p className="text-neutral-500">Conv. globale</p>
          <p className="mt-1 font-display text-lg font-bold text-emerald-400">{funnel.overall_conversion_rate}%</p>
        </div>
      </div>
    </div>
  );
}

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

const ICONS: Record<string, React.ReactElement> = {
  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  currency: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  trend: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  ),
  alert: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
};

function KpiCard({
  label, value, sub, color, icon,
}: {
  label: string;
  value: number | string;
  sub: string;
  color: 'blue' | 'emerald' | 'amber' | 'red' | 'purple';
  icon: keyof typeof ICONS;
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
          <span className="h-5 w-5 sm:h-5 sm:w-5">{ICONS[icon]}</span>
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
