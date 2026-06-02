'use client';

/**
 * Panel "Analytics" du tableau de bord propriétaire (PR Analytics).
 *
 * Charge get_venue_analytics(venue_id, days) :
 *   - KPI : vues, clics, réservations, taux de conversion
 *   - by_kind : breakdown par type d'événement
 *   - daily : série journalière vues / clics / réservations
 *
 * Rendu sans Recharts pour éviter d'alourdir le bundle /pro :
 *   - KPI cards
 *   - mini chart custom (barres verticales en flex + height proportionnelle)
 *   - liste par kind avec progress bars
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase';
import { formatXOF } from '@soutra/shared';

interface Kpi {
  views: number;
  clicks: number;
  reservations: number;
  conversion_rate: number;
  period_days: number;
  period_from: string;
  period_to: string;
}

interface ByKind {
  kind: string;
  count: number;
}

interface Daily {
  day: string;
  views: number;
  clicks: number;
  reservations: number;
}

interface Analytics {
  kpi: Kpi;
  by_kind: ByKind[];
  daily: Daily[];
}

const KIND_LABEL: Record<string, string> = {
  view: 'Vues fiche',
  click_call: 'Clics appel',
  click_whatsapp: 'Clics WhatsApp',
  click_directions: 'Clics itinéraire',
  click_website: 'Clics site web',
  click_share: 'Partages',
  reservation_start: 'Réservations démarrées',
  reservation_complete: 'Réservations confirmées',
  menu_view: 'Vues menu',
  gallery_open: 'Ouvertures galerie',
};

const PERIODS: { value: number; label: string }[] = [
  { value: 7, label: '7 j' },
  { value: 30, label: '30 j' },
  { value: 90, label: '90 j' },
];

export function VenueAnalytics({ venueId, venueName }: { venueId: string | null; venueName?: string }) {
  const sb = supabaseBrowser();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (vId: string, d: number) => {
    setLoading(true);
    setError(null);
    try {
      const { data: res, error } = await (sb.rpc as any)('get_venue_analytics', {
        p_venue_id: vId,
        p_days: d,
      });
      if (error) {
        const msg = error.message ?? '';
        if (msg.includes('FORBIDDEN')) setError("Tu n'es pas propriétaire de cet établissement.");
        else if (msg.includes('VENUE_NOT_FOUND')) setError('Établissement introuvable.');
        else setError(msg || 'Erreur de chargement');
        setData(null);
        return;
      }
      setData(res as Analytics);
    } finally {
      setLoading(false);
    }
  }, [sb]);

  useEffect(() => {
    if (venueId) load(venueId, days);
  }, [venueId, days, load]);

  if (!venueId) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">
        Crée d'abord ton établissement pour voir les analytics.
      </div>
    );
  }

  const maxDaily = useMemo(() => {
    if (!data?.daily?.length) return 0;
    return data.daily.reduce((m, d) => Math.max(m, d.views, d.clicks, d.reservations), 0);
  }, [data?.daily]);

  return (
    <div>
      {/* Header + period selector */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-lg font-bold text-dark">Analytics {venueName ? `· ${venueName}` : ''}</h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            {data?.kpi?.period_from && data?.kpi?.period_to
              ? `Du ${data.kpi.period_from} au ${data.kpi.period_to}`
              : 'Sélectionne une période pour afficher les données.'}
          </p>
        </div>
        <div className="flex gap-1.5">
          {PERIODS.map((p) => {
            const active = p.value === days;
            return (
              <button
                key={p.value}
                onClick={() => setDays(p.value)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  active
                    ? 'bg-primary-500 text-white shadow-sm'
                    : 'border border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300'
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-danger">
          {error}
        </div>
      ) : loading || !data ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-12 text-center text-sm text-neutral-500">
          {loading ? 'Chargement des analytics…' : 'Aucune donnée.'}
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <KpiCard label="Vues de fiche" value={data.kpi.views.toLocaleString('fr-FR')} sub="Consultations totales" emoji="👁️" tone="blue" />
            <KpiCard label="Interactions" value={data.kpi.clicks.toLocaleString('fr-FR')} sub="Appels, itinéraires, partages…" emoji="👆" tone="amber" />
            <KpiCard label="Conversion" value={`${data.kpi.conversion_rate}%`} sub="Clics / Vues" emoji="📈" tone="emerald" />
            <KpiCard label="Réservations" value={data.kpi.reservations.toLocaleString('fr-FR')} sub="Confirmées sur la période" emoji="📅" tone="purple" />
          </div>

          {/* Daily bar chart */}
          <div className="mb-6 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-dark">Évolution journalière</h3>
              <div className="flex items-center gap-3 text-[11px]">
                <LegendDot color="#3b82f6" label="Vues" />
                <LegendDot color="#f59e0b" label="Clics" />
                <LegendDot color="#a855f7" label="Réservations" />
              </div>
            </div>
            {data.daily.length === 0 || maxDaily === 0 ? (
              <p className="py-10 text-center text-xs text-neutral-400">Aucune activité sur la période.</p>
            ) : (
              <div className="flex h-[160px] items-end gap-[3px] overflow-x-auto pb-1">
                {data.daily.map((d) => {
                  const hView = (d.views / maxDaily) * 140;
                  const hClick = (d.clicks / maxDaily) * 140;
                  const hRes = (d.reservations / maxDaily) * 140;
                  const dateLabel = d.day.slice(5).replace('-', '/');
                  return (
                    <div key={d.day} className="flex min-w-[14px] flex-col items-center" title={`${d.day}\nVues ${d.views} · Clics ${d.clicks} · Réservations ${d.reservations}`}>
                      <div className="flex h-[140px] items-end gap-[2px]">
                        <div className="w-[4px] rounded-t bg-blue-500" style={{ height: `${Math.max(hView, d.views > 0 ? 2 : 0)}px` }} />
                        <div className="w-[4px] rounded-t bg-amber-500" style={{ height: `${Math.max(hClick, d.clicks > 0 ? 2 : 0)}px` }} />
                        <div className="w-[4px] rounded-t bg-purple-500" style={{ height: `${Math.max(hRes, d.reservations > 0 ? 2 : 0)}px` }} />
                      </div>
                      <span className="mt-1 text-[9px] font-medium text-neutral-400">{dateLabel}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Breakdown by kind */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
            <h3 className="mb-4 text-sm font-semibold text-dark">Répartition des interactions</h3>
            {data.by_kind.length === 0 ? (
              <p className="text-center text-xs text-neutral-400">Aucune interaction enregistrée.</p>
            ) : (
              <div className="space-y-3">
                {data.by_kind.map((b) => {
                  const max = data.by_kind[0]?.count || 1;
                  const pct = max > 0 ? (b.count / max) * 100 : 0;
                  return (
                    <div key={b.kind}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-semibold text-dark">{KIND_LABEL[b.kind] ?? b.kind}</span>
                        <span className="font-mono font-bold text-neutral-600">{b.count.toLocaleString('fr-FR')}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
                        <div
                          className="h-full rounded-full bg-primary-500"
                          style={{ width: `${Math.max(pct, 2)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function KpiCard({ label, value, sub, emoji, tone }: {
  label: string;
  value: string;
  sub: string;
  emoji: string;
  tone: 'blue' | 'amber' | 'emerald' | 'purple';
}) {
  const toneClass = {
    blue:    'bg-blue-50 text-blue-700',
    amber:   'bg-amber-50 text-amber-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    purple:  'bg-purple-50 text-purple-700',
  }[tone];
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 transition-shadow hover:shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-medium uppercase tracking-wide text-neutral-500">{label}</p>
          <p className="mt-1 truncate font-display text-2xl font-bold text-dark">{value}</p>
        </div>
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base ${toneClass}`}>{emoji}</div>
      </div>
      <p className="mt-2 truncate text-[11px] text-neutral-500">{sub}</p>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1 text-neutral-500">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
