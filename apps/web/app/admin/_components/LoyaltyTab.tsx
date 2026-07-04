'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { supabaseBrowser } from '@/lib/supabase';

/* ─────────────────────────────────────────────────── *
 *  TYPES — miroir d'admin_loyalty_stats (migration 0068) *
 * ─────────────────────────────────────────────────── */

interface LevelBreakdown {
  level_code: string;
  label: string;
  count: number;
}

interface DayPoint {
  date: string; // YYYY-MM-DD
  points: number;
}

interface TopUser {
  full_name: string | null;
  points_lifetime: number;
  level_code: string;
}

interface RecentRow {
  id: string;
  user_id: string;
  kind: 'earn' | 'redeem' | 'bonus' | 'adjustment' | 'expire';
  points: number;
  description: string | null;
  created_at: string;
}

interface Stats {
  window_days: number;
  generated_at: string;
  totals: {
    points_distributed_all_time: number;
    points_distributed_period: number;
    points_redeemed_all_time: number;
    active_accounts: number;
    active_users_period: number;
  };
  by_level: LevelBreakdown[];
  by_day: DayPoint[];
  top_users: TopUser[];
  recent_transactions: RecentRow[];
}

interface Reward {
  code: string;
  label: string;
  description: string | null;
  points_cost: number;
  stock: number | null;
  active: boolean;
}

const LEVEL_COLORS: Record<string, string> = {
  bronze: '#B87333',
  silver: '#9CA3AF',
  gold: '#D4AF37',
  platinum: '#6E8898',
  diamond: '#5BCFFA',
};

const KIND_LABEL: Record<RecentRow['kind'], string> = {
  earn: 'Gain',
  redeem: 'Échange',
  bonus: 'Bonus mission',
  adjustment: 'Ajustement',
  expire: 'Expiration',
};

/* ─────────────────────────────────────────────────── *
 *  MAIN COMPONENT                                     *
 * ─────────────────────────────────────────────────── */

export function LoyaltyTab() {
  const sb = supabaseBrowser();
  const [windowDays, setWindowDays] = useState(30);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (days: number) => {
    setLoading(true);
    setError(null);
    const { data, error } = await (sb.rpc as any)('admin_loyalty_stats', {
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
        Chargement des analytics fidélité…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6 text-center">
        <p className="text-sm font-medium text-red-400">Erreur : {error}</p>
        <p className="mt-2 text-xs text-neutral-500">
          La migration 0068 (moteur de fidélité) est-elle appliquée ?
        </p>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="space-y-6">
      {/* Window toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-display text-lg font-bold">Analytics Fidélité</p>
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
          label="Points distribués (total)"
          value={stats.totals.points_distributed_all_time.toLocaleString('fr-FR')}
          sub="depuis le lancement"
          color="amber"
        />
        <KpiCard
          label={`Distribués sur ${stats.window_days}j`}
          value={stats.totals.points_distributed_period.toLocaleString('fr-FR')}
          sub={`${stats.totals.active_users_period} utilisateurs actifs`}
          color="blue"
        />
        <KpiCard
          label="Comptes fidélité"
          value={stats.totals.active_accounts.toLocaleString('fr-FR')}
          sub="au total"
          color="purple"
        />
        <KpiCard
          label="Points échangés (total)"
          value={stats.totals.points_redeemed_all_time.toLocaleString('fr-FR')}
          sub="contre des récompenses"
          color="emerald"
        />
      </div>

      {/* ═══════════ TIMESERIES ═══════════ */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title={`Points distribués par jour (${stats.window_days}j)`}>
          {stats.by_day.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={stats.by_day.map((d) => ({ ...d, date: shortDate(d.date) }))}>
                <defs>
                  <linearGradient id="loyGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#737373' }} />
                <YAxis tick={{ fontSize: 10, fill: '#737373' }} />
                <Tooltip content={<DarkTooltip formatter={(v: number) => `${v.toLocaleString('fr-FR')} pts`} />} />
                <Area
                  type="monotone" dataKey="points" name="Points"
                  stroke="#f59e0b" fill="url(#loyGrad)" strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </ChartCard>

        <ChartCard title="Répartition par niveau">
          {stats.by_level.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={stats.by_level.map((l) => ({ name: l.label, count: l.count, code: l.level_code }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#737373' }} />
                <YAxis tick={{ fontSize: 10, fill: '#737373' }} />
                <Tooltip content={<DarkTooltip />} />
                <Bar dataKey="count" name="Comptes" radius={[6, 6, 0, 0]} fill="#f59e0b" />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart label="Aucune donnée" />}
        </ChartCard>
      </div>

      {/* ═══════════ TOP USERS LEADERBOARD ═══════════ */}
      <div className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50">
        <div className="border-b border-neutral-800/50 px-6 py-4">
          <h3 className="text-sm font-semibold text-neutral-400">Top 10 utilisateurs</h3>
          <p className="mt-0.5 text-xs text-neutral-500">Classement par cumul de points lifetime</p>
        </div>
        {stats.top_users.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-neutral-500">
            Aucun utilisateur fidélité pour l&apos;instant.
          </div>
        ) : (
          <ul className="divide-y divide-neutral-800/50">
            {stats.top_users.map((u, i) => (
              <li key={i} className="flex flex-wrap items-center gap-3 px-6 py-3.5">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                  i === 0 ? 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/40' :
                  i === 1 ? 'bg-neutral-400/20 text-neutral-300 ring-1 ring-neutral-500/40' :
                  i === 2 ? 'bg-orange-500/20 text-orange-400 ring-1 ring-orange-500/40' :
                  'bg-neutral-800 text-neutral-500'
                }`}>
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{u.full_name || '— (sans nom)'}</p>
                  <p className="font-mono text-[11px]" style={{ color: LEVEL_COLORS[u.level_code] ?? '#737373' }}>
                    {u.level_code}
                  </p>
                </div>
                <p className="font-mono text-sm font-bold text-amber-400">
                  {u.points_lifetime.toLocaleString('fr-FR')} pts
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ═══════════ DERNIERS MOUVEMENTS ═══════════ */}
      <div className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50">
        <div className="border-b border-neutral-800/50 px-6 py-4">
          <h3 className="text-sm font-semibold text-neutral-400">
            Derniers mouvements ({stats.recent_transactions.length})
          </h3>
        </div>
        {stats.recent_transactions.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-neutral-500">
            Aucun mouvement enregistré.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-800/50 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Type</th>
                  <th className="px-6 py-3">Description</th>
                  <th className="px-6 py-3 text-right">Points</th>
                </tr>
              </thead>
              <tbody>
                {stats.recent_transactions.map((r) => (
                  <tr key={r.id} className="border-b border-neutral-800/30 transition hover:bg-neutral-800/20">
                    <td className="px-6 py-3 text-xs text-neutral-400">{formatRelativeTime(r.created_at)}</td>
                    <td className="px-6 py-3 text-xs">{KIND_LABEL[r.kind]}</td>
                    <td className="px-6 py-3 text-sm">{r.description || '—'}</td>
                    <td className={`px-6 py-3 text-right font-mono text-sm font-bold ${r.points >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {r.points >= 0 ? '+' : ''}{r.points.toLocaleString('fr-FR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ═══════════ CATALOGUE DE RÉCOMPENSES (administrable) ═══════════ */}
      <RewardsManager />
    </div>
  );
}

/* ─────────────────────────────────────────────────── *
 *  GESTION DU CATALOGUE DE RÉCOMPENSES                *
 * ─────────────────────────────────────────────────── */

function RewardsManager() {
  const sb = supabaseBrowser();
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ code: '', label: '', description: '', points_cost: 100 });

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await (sb as any)
      .from('loyalty_rewards')
      .select('code, label, description, points_cost, stock, active')
      .order('sort_order', { ascending: true });
    setRewards((data as Reward[]) ?? []);
    setLoading(false);
  }, [sb]);

  useEffect(() => { load(); }, [load]);

  const toggleActive = useCallback(async (code: string, active: boolean) => {
    setRewards((rs) => rs.map((r) => (r.code === code ? { ...r, active } : r)));
    await (sb as any).from('loyalty_rewards').update({ active }).eq('code', code);
  }, [sb]);

  const handleCreate = useCallback(async () => {
    if (!form.code || !form.label || form.points_cost <= 0) return;
    setCreating(true);
    const { error } = await (sb as any).from('loyalty_rewards').insert({
      code: form.code,
      label: form.label,
      description: form.description || null,
      points_cost: form.points_cost,
      active: true,
    });
    setCreating(false);
    if (!error) {
      setForm({ code: '', label: '', description: '', points_cost: 100 });
      load();
    }
  }, [sb, form, load]);

  return (
    <div className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50">
      <div className="border-b border-neutral-800/50 px-6 py-4">
        <h3 className="text-sm font-semibold text-neutral-400">Catalogue de récompenses</h3>
        <p className="mt-0.5 text-xs text-neutral-500">Activable/désactivable — visible sur /loyalty et dans l&apos;app</p>
      </div>

      {loading ? (
        <div className="px-6 py-8 text-center text-sm text-neutral-500">Chargement…</div>
      ) : (
        <ul className="divide-y divide-neutral-800/50">
          {rewards.map((r) => (
            <li key={r.code} className="flex flex-wrap items-center gap-3 px-6 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{r.label}</p>
                <p className="text-xs text-neutral-500">{r.points_cost.toLocaleString('fr-FR')} pts{r.stock != null && <> · stock {r.stock}</>}</p>
              </div>
              <button
                onClick={() => toggleActive(r.code, !r.active)}
                className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                  r.active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-neutral-800 text-neutral-500'
                }`}
              >
                {r.active ? 'Actif' : 'Inactif'}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-neutral-800/50 p-6">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">Nouvelle récompense</p>
        <div className="grid gap-2 sm:grid-cols-4">
          <input
            placeholder="code (unique)"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
          />
          <input
            placeholder="Libellé"
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm sm:col-span-2"
          />
          <input
            type="number"
            placeholder="Coût en pts"
            value={form.points_cost}
            onChange={(e) => setForm({ ...form, points_cost: Number(e.target.value) })}
            className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
          />
        </div>
        <input
          placeholder="Description (optionnel)"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="mt-2 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
        />
        <button
          onClick={handleCreate}
          disabled={creating || !form.code || !form.label}
          className="mt-3 rounded-full bg-primary-500 px-4 py-2 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-40"
        >
          {creating ? 'Création…' : 'Ajouter au catalogue'}
        </button>
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
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
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
