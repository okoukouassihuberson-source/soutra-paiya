'use client';

/**
 * Composants enveloppe Recharts pour /admin.
 *
 * Ce fichier centralise TOUS les charts utilisés dans admin/page.tsx.
 * Il est dynamic-importé par page.tsx (ssr: false), ce qui sort recharts
 * (~80 kB minified) du chunk principal /admin et le charge seulement
 * quand l'utilisateur affiche un onglet contenant des graphes.
 *
 * Avant cette extraction : /admin First Load JS = 130 kB (recharts inclus)
 * Après : /admin First Load JS ≈ 50-60 kB (recharts en chunk async)
 *
 * Chaque chart est une fonction React qui prend ses données en props.
 * Les couleurs et seuils visuels restent inline pour éviter une couche
 * d'abstraction inutile.
 */

import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { formatXOF } from '@soutra/shared';

const PIE_COLORS = ['#f97316', '#3b82f6', '#10b981', '#a855f7', '#ef4444', '#6b7280'];

// ----------------------------------------------------------------------------
// Tooltip custom partagé — extrait pour éviter de le passer en prop partout.
// ----------------------------------------------------------------------------
function CustomTooltip({ active, payload, label, formatter }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 shadow-2xl">
      {label && <p className="mb-1 text-xs text-neutral-500">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-sm font-medium" style={{ color: p.color }}>
          {p.name}: {formatter ? formatter(p.value) : p.value.toLocaleString('fr-FR')}
        </p>
      ))}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Hauteur partagée (le ResponsiveContainer gère la largeur).
// ----------------------------------------------------------------------------
type Props<T> = { data: T[]; height?: number };

// ============================================================================
// CHARTS DE L'ONGLET OVERVIEW
// ============================================================================

export function RevenueAreaChart({ data, height = 240 }: Props<{ day: string; revenue: number }>) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f97316" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#f97316" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
        <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#737373' }} />
        <YAxis tick={{ fontSize: 10, fill: '#737373' }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
        <Tooltip content={<CustomTooltip formatter={(v: number) => formatXOF(v)} />} />
        <Area type="monotone" dataKey="revenue" stroke="#f97316" fill="url(#revGrad)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function GenericPie({
  data,
  height = 240,
  innerRadius = 55,
  outerRadius = 90,
}: Props<{ name: string; value: number }> & { innerRadius?: number; outerRadius?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={innerRadius}
          outerRadius={outerRadius}
          paddingAngle={3}
          dataKey="value"
        >
          {data.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ============================================================================
// CHARTS DE L'ONGLET ANALYTICS
// ============================================================================

export function RevenueFeeAreaChart({ data, height = 280 }: Props<{ day: string; revenue: number; fees: number }>) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="revGrad2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f97316" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#f97316" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="feeGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a855f7" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#a855f7" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
        <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#737373' }} />
        <YAxis tick={{ fontSize: 10, fill: '#737373' }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
        <Tooltip content={<CustomTooltip formatter={(v: number) => formatXOF(v)} />} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
        <Area type="monotone" dataKey="revenue" name="Revenus" stroke="#f97316" fill="url(#revGrad2)" strokeWidth={2} />
        <Area type="monotone" dataKey="fees" name="Frais" stroke="#a855f7" fill="url(#feeGrad)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function UserGrowthBar({ data, height = 280 }: Props<{ day: string; nouveaux: number }>) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
        <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#737373' }} />
        <YAxis tick={{ fontSize: 10, fill: '#737373' }} />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="nouveaux" name="Nouveaux" fill="#3b82f6" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ResaPerDayArea({ data, height = 280 }: Props<{ day: string; reservations: number }>) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="resaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
        <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#737373' }} />
        <YAxis tick={{ fontSize: 10, fill: '#737373' }} />
        <Tooltip content={<CustomTooltip />} />
        <Area type="monotone" dataKey="reservations" stroke="#10b981" fill="url(#resaGrad)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function VenueCategoryBar({ data, height = 280 }: Props<{ name: string; count: number }>) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" stroke="#262626" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 10, fill: '#737373' }} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#737373' }} width={100} />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="count" name="Venues" fill="#f97316" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function RevenueByProviderBar({ data, height = 280 }: Props<{ name: string; value: number }>) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#737373' }} />
        <YAxis tick={{ fontSize: 10, fill: '#737373' }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
        <Tooltip content={<CustomTooltip formatter={(v: number) => formatXOF(v)} />} />
        <Bar dataKey="value" name="Revenus" fill="#10b981" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ============================================================================
// CHARTS DE L'ONGLET USERS
// ============================================================================

export function UsersByCityBar({ data, height = 280 }: Props<{ name: string; count: number }>) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" stroke="#262626" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 10, fill: '#737373' }} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#737373' }} width={120} />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="count" name="Utilisateurs" fill="#3b82f6" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
