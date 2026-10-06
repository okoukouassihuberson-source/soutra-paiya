'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { formatXOF } from '@soutra/shared';
import { supabaseBrowser } from '@/lib/supabase';
import type { DayPoint, TopPoint } from './StatsCharts';

const Loader = () => <div className="h-[240px] animate-pulse rounded-xl bg-neutral-100" aria-hidden />;
const RevenueChart = dynamic(() => import('./StatsCharts').then((m) => m.RevenueChart), { ssr: false, loading: Loader });
const BookingsChart = dynamic(() => import('./StatsCharts').then((m) => m.BookingsChart), { ssr: false, loading: Loader });
const TopChart = dynamic(() => import('./StatsCharts').then((m) => m.TopChart), { ssr: false, loading: Loader });
const StatusPie = dynamic(() => import('./StatsCharts').then((m) => m.StatusPie), { ssr: false, loading: Loader });

interface Analytics {
  days: number; from: string;
  series: DayPoint[];
  totals: { bookings: number; bookings_prev: number; revenue_xof: number; revenue_prev_xof: number; seats: number; seats_prev: number };
  top: { kind: 'trip' | 'activity'; id: string; title: string; revenue_xof: number; bookings: number }[];
  fill: { id: string; title: string; starts_on: string; seats_total: number; seats_booked: number }[];
  status: { status: string; count: number }[];
}

const PERIODS = [7, 30, 90] as const;
const BOOKING_LABEL: Record<string, string> = { pending: 'En attente', paid: 'Payé', confirmed: 'Acompte versé', cancelled: 'Annulé', used: 'Embarqué' };

function delta(cur: number, prev: number): { text: string; tone: string } {
  if (prev === 0) return cur > 0 ? { text: 'Nouveau', tone: 'text-emerald-700' } : { text: '—', tone: 'text-neutral-700' };
  const pct = Math.round(((cur - prev) / prev) * 100);
  return { text: `${pct > 0 ? '▲' : pct < 0 ? '▼' : '='} ${Math.abs(pct)} %`, tone: pct > 0 ? 'text-emerald-700' : pct < 0 ? 'text-red-700' : 'text-neutral-700' };
}

/** Onglet « Statistiques » : encaissements et réservations par jour, meilleurs produits, remplissage, statuts. */
export function OrganizerStats() {
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<Analytics | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');

  useEffect(() => {
    let alive = true;
    setState('loading');
    (supabaseBrowser() as any).rpc('get_organizer_analytics', { p_days: days }).then(({ data: d, error }: any) => {
      if (!alive) return;
      if (error || !d) { console.error('[organizer stats]', error); setState('error'); return; }
      setData(d as Analytics); setState('ok');
    });
    return () => { alive = false; };
  }, [days]);

  const summary = useMemo(() => {
    if (!data) return { revenue: '', bookings: '' };
    const best = data.series.reduce((a, b) => (b.revenue_xof > a.revenue_xof ? b : a), data.series[0]);
    const bestB = data.series.reduce((a, b) => (b.bookings > a.bookings ? b : a), data.series[0]);
    return {
      revenue: `Encaissements sur ${data.days} jours : ${formatXOF(data.totals.revenue_xof)}. Meilleur jour : ${best?.day ?? '—'} (${formatXOF(best?.revenue_xof ?? 0)}).`,
      bookings: `Réservations sur ${data.days} jours : ${data.totals.bookings}. Meilleur jour : ${bestB?.day ?? '—'} (${bestB?.bookings ?? 0}).`,
    };
  }, [data]);

  function exportCsv() {
    if (!data) return;
    const rows = ['date;reservations;encaisse_xof', ...data.series.map((s) => `${s.day};${s.bookings};${s.revenue_xof}`)];
    const url = URL.createObjectURL(new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `statistiques-${data.from}-${data.days}j.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const empty = data && data.totals.bookings === 0 && data.totals.revenue_xof === 0 && data.totals.bookings_prev === 0;
  const card = 'rounded-2xl border border-neutral-200 bg-white p-4';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Période" className="inline-flex overflow-hidden rounded-full border border-neutral-300 text-sm font-semibold">
          {PERIODS.map((p) => (
            <button key={p} type="button" aria-pressed={days === p} onClick={() => setDays(p)} className={`px-4 py-1.5 ${days === p ? 'bg-primary-500 text-night' : 'text-neutral-800 hover:bg-neutral-100'}`}>{p} jours</button>
          ))}
        </div>
        {data && !empty && <button type="button" onClick={exportCsv} className="rounded-full border border-neutral-300 px-4 py-1.5 text-sm font-semibold text-neutral-900 hover:border-primary-500">⬇ Exporter en CSV</button>}
      </div>

      {state === 'loading' && !data && <p className="p-10 text-center text-neutral-700" role="status">Chargement des statistiques…</p>}
      {state === 'error' && <p role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700">Statistiques indisponibles pour le moment. Réessayez dans quelques instants.</p>}

      {data && state !== 'error' && (
        <div className={state === 'loading' ? 'opacity-60 transition-opacity' : ''} aria-busy={state === 'loading'}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {([
              ['Encaissé', formatXOF(data.totals.revenue_xof), delta(data.totals.revenue_xof, data.totals.revenue_prev_xof)],
              ['Réservations', String(data.totals.bookings), delta(data.totals.bookings, data.totals.bookings_prev)],
              ['Places vendues', String(data.totals.seats), delta(data.totals.seats, data.totals.seats_prev)],
            ] as const).map(([label, value, d]) => (
              <div key={label} className={card}>
                <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-700">{label}</p>
                <p className="mt-1 font-display text-xl font-bold">{value}</p>
                <p className={`mt-0.5 text-xs font-semibold ${d.tone}`}>{d.text} <span className="font-normal text-neutral-700">vs {data.days} j précédents</span></p>
              </div>
            ))}
          </div>

          {empty ? (
            <p className={`${card} mt-6 p-10 text-center text-sm text-neutral-700`}>Aucune réservation ni paiement sur cette période. Les graphiques apparaîtront dès la première vente.</p>
          ) : (
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <section className={card} aria-labelledby="st-rev">
                <h3 id="st-rev" className="mb-2 font-display text-base font-bold">Encaissements par jour</h3>
                <div role="img" aria-label={summary.revenue}><RevenueChart data={data.series} /></div>
              </section>
              <section className={card} aria-labelledby="st-bk">
                <h3 id="st-bk" className="mb-2 font-display text-base font-bold">Réservations par jour</h3>
                <div role="img" aria-label={summary.bookings}><BookingsChart data={data.series} /></div>
              </section>
              <section className={card} aria-labelledby="st-top">
                <h3 id="st-top" className="mb-1 font-display text-base font-bold">Meilleurs voyages et activités</h3>
                <p className="mb-2 text-xs text-neutral-700"><span className="text-primary-700">■</span> Voyage · <span className="text-emerald-700">■</span> Activité · encaissé sur la période</p>
                {data.top.length === 0 ? <p className="py-8 text-center text-sm text-neutral-700">Aucun encaissement sur la période.</p> : (
                  <>
                    <div role="img" aria-label={`Classement par encaissé : ${data.top.map((x) => `${x.title} ${formatXOF(x.revenue_xof)}`).join(', ')}`}>
                      <TopChart data={data.top.map((x): TopPoint => ({ name: x.title, revenue_xof: x.revenue_xof, bookings: x.bookings, kind: x.kind }))} />
                    </div>
                    <details className="mt-2 text-xs text-neutral-700">
                      <summary className="cursor-pointer font-semibold text-neutral-800">Voir les chiffres</summary>
                      <table className="mt-2 w-full text-left">
                        <thead><tr className="text-neutral-700"><th className="p-1">Nom</th><th className="p-1">Type</th><th className="p-1">Réserv.</th><th className="p-1">Encaissé</th></tr></thead>
                        <tbody>{data.top.map((x) => <tr key={x.kind + x.id} className="border-t border-neutral-200"><td className="p-1">{x.title}</td><td className="p-1">{x.kind === 'trip' ? 'Voyage' : 'Activité'}</td><td className="p-1">{x.bookings}</td><td className="p-1">{formatXOF(x.revenue_xof)}</td></tr>)}</tbody>
                      </table>
                    </details>
                  </>
                )}
              </section>
              <section className={card} aria-labelledby="st-status">
                <h3 id="st-status" className="mb-2 font-display text-base font-bold">Statut des réservations</h3>
                {data.status.length === 0 ? <p className="py-8 text-center text-sm text-neutral-700">Aucune réservation.</p> : (
                  <div role="img" aria-label={`Répartition : ${data.status.map((s) => `${BOOKING_LABEL[s.status] ?? s.status} ${s.count}`).join(', ')}`}>
                    <StatusPie data={data.status.map((s) => ({ name: BOOKING_LABEL[s.status] ?? s.status, value: Number(s.count) }))} />
                  </div>
                )}
              </section>
            </div>
          )}

          <section className={`${card} mt-4`} aria-labelledby="st-fill">
            <h3 id="st-fill" className="mb-3 font-display text-base font-bold">Remplissage des prochains voyages</h3>
            {data.fill.length === 0 ? <p className="py-4 text-center text-sm text-neutral-700">Aucun voyage publié à venir.</p> : (
              <ul className="space-y-3">
                {data.fill.map((f) => {
                  const pct = f.seats_total > 0 ? Math.min(100, Math.round((f.seats_booked / f.seats_total) * 100)) : 0;
                  return (
                    <li key={f.id}>
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate font-semibold">{f.title}</span>
                        <span className="shrink-0 text-xs text-neutral-700">{new Date(f.starts_on).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' })} · {f.seats_booked}/{f.seats_total} ({pct} %)</span>
                      </div>
                      <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Remplissage ${f.title}`} className="mt-1 h-2 overflow-hidden rounded-full bg-neutral-100">
                        <div className={`h-full rounded-full ${pct >= 90 ? 'bg-emerald-500' : pct >= 50 ? 'bg-primary-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          <p className="mt-3 text-xs text-neutral-700">Encaissements = paiements reçus (date du paiement, fuseau Abidjan). Les vues de fiches ne sont pas encore mesurées.</p>
        </div>
      )}
    </div>
  );
}
