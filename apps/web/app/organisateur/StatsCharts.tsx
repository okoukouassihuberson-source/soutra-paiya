'use client';

/** Graphiques Recharts de l'onglet « Statistiques » (chargés à la demande, voir OrganizerStats.tsx). */
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { formatXOF } from '@soutra/shared';

export interface DayPoint { day: string; bookings: number; revenue_xof: number }
export interface TopPoint { name: string; revenue_xof: number; bookings: number; kind: 'trip' | 'activity' }

const COLORS = ['#FF6B1A', '#3b82f6', '#10b981', '#a855f7', '#ef4444', '#94a3b8'];
const AXIS = { fontSize: 11, fill: '#a3a3a3' } as const;
const dayLabel = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

function Tip({ active, payload, label, money }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs shadow-2xl">
      {label && <p className="mb-1 text-neutral-400">{/^\d{4}-\d{2}-\d{2}$/.test(String(label)) ? `${String(label).slice(8, 10)}/${String(label).slice(5, 7)}/${String(label).slice(0, 4)}` : label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} className="font-semibold" style={{ color: p.color || p.payload?.fill }}>
          {p.name}: {money ? formatXOF(p.value) : Number(p.value).toLocaleString('fr-FR')}
        </p>
      ))}
    </div>
  );
}

export function RevenueChart({ data }: { data: DayPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
        <defs>
          <linearGradient id="orgRev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FF6B1A" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#FF6B1A" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
        <XAxis dataKey="day" tickFormatter={dayLabel} tick={AXIS} minTickGap={24} />
        <YAxis tick={AXIS} width={44} domain={[0, "auto"]} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
        <Tooltip content={<Tip money />} />
        <Area type="monotone" dataKey="revenue_xof" name="Encaissé" stroke="#FF6B1A" fill="url(#orgRev)" strokeWidth={2} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function BookingsChart({ data }: { data: DayPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" vertical={false} />
        <XAxis dataKey="day" tickFormatter={dayLabel} tick={AXIS} minTickGap={24} />
        <YAxis tick={AXIS} width={32} allowDecimals={false} domain={[0, "auto"]} />
        <Tooltip content={<Tip />} cursor={{ fill: 'rgba(255,255,255,.06)' }} />
        <Bar dataKey="bookings" name="Réservations" fill="#3b82f6" radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TopChart({ data }: { data: TopPoint[] }) {
  const rows = data.map((d) => ({ ...d, label: d.name.length > 22 ? `${d.name.slice(0, 21)}…` : d.name }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, rows.length * 38 + 24)}>
      <BarChart data={rows} layout="vertical" margin={{ left: 0, right: 16, top: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" horizontal={false} />
        <XAxis type="number" tick={AXIS} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
        <YAxis type="category" dataKey="label" tick={AXIS} width={130} />
        <Tooltip content={<Tip money />} cursor={{ fill: 'rgba(255,255,255,.06)' }} />
        <Bar dataKey="revenue_xof" name="Encaissé" radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {rows.map((r, i) => <Cell key={i} fill={r.kind === 'trip' ? '#FF6B1A' : '#10b981'} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function StatusPie({ data }: { data: { name: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={82} paddingAngle={3} isAnimationActive={false}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip content={<Tip />} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
