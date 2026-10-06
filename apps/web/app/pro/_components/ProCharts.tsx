'use client';

/** Graphiques Recharts du tableau de bord Pro (chargés à la demande, voir ProDashboardCharts.tsx). */
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export interface DayBucket { day: string; label: string; honored: number; pending: number; lost: number }
export interface WeekdayBucket { name: string; count: number }

const AXIS = { fontSize: 11, fill: 'rgb(var(--n-600))' } as const;
const GRID = 'rgb(var(--n-200))';

function Tip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-semibold text-dark">{label}</p>
      {payload.map((p: any, i: number) => <p key={i} style={{ color: p.color }} className="font-semibold">{p.name} : {p.value}</p>)}
    </div>
  );
}

export function DaysChart({ data }: { data: DayBucket[] }) {
  return (
    <ResponsiveContainer width="100%" height={230}>
      <BarChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={AXIS} minTickGap={18} />
        <YAxis tick={AXIS} width={28} allowDecimals={false} domain={[0, 'auto']} />
        <Tooltip content={<Tip />} cursor={{ fill: 'rgba(148,163,184,.18)' }} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="honored" name="Honorées" stackId="a" fill="#10b981" isAnimationActive={false} />
        <Bar dataKey="pending" name="En attente" stackId="a" fill="#f59e0b" isAnimationActive={false} />
        <Bar dataKey="lost" name="Perdues" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function WeekdayChart({ data }: { data: WeekdayBucket[] }) {
  const max = Math.max(...data.map((d) => d.count));
  return (
    <ResponsiveContainer width="100%" height={230}>
      <BarChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="name" tick={AXIS} />
        <YAxis tick={AXIS} width={28} allowDecimals={false} domain={[0, 'auto']} />
        <Tooltip content={<Tip />} cursor={{ fill: 'rgba(148,163,184,.18)' }} />
        <Bar dataKey="count" name="Réservations" radius={[4, 4, 0, 0]} isAnimationActive={false}
          shape={(p: any) => <rect x={p.x} y={p.y} width={p.width} height={p.height} rx={4} fill={p.payload.count === max && max > 0 ? '#FF6B1A' : '#94a3b8'} />} />
      </BarChart>
    </ResponsiveContainer>
  );
}
