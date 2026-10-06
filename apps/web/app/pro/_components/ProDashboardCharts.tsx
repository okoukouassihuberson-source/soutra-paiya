'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import type { DayBucket, WeekdayBucket } from './ProCharts';

const Loader = () => <div className="h-[230px] animate-pulse rounded-xl bg-neutral-100" aria-hidden />;
const DaysChart = dynamic(() => import('./ProCharts').then((m) => m.DaysChart), { ssr: false, loading: Loader });
const WeekdayChart = dynamic(() => import('./ProCharts').then((m) => m.WeekdayChart), { ssr: false, loading: Loader });

interface Res { date_time: string; status: string; party_size: number }

type Range = 'past7' | 'past30' | 'next14';
const RANGES: { id: Range; label: string; full: string; days: number; dir: -1 | 1 }[] = [
  { id: 'past7', label: '7 j', full: '7 derniers jours', days: 7, dir: -1 },
  { id: 'past30', label: '30 j', full: '30 derniers jours', days: 30, dir: -1 },
  { id: 'next14', label: 'À venir', full: '14 prochains jours', days: 14, dir: 1 },
];
const HONORED = ['confirmed', 'arrived'];
const LOST = ['no_show', 'cancelled', 'refunded'];
const WEEK = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Tableau de bord Pro : réservations par jour (par issue) et jours forts de la semaine, calculés sur les réservations déjà chargées. */
export function ProDashboardCharts({ reservations }: { reservations: Res[] }) {
  const [range, setRange] = useState<Range>('past30');
  const cfg = RANGES.find((r) => r.id === range)!;

  const { days, weekdays, total, covers } = useMemo(() => {
    const today = new Date();
    const buckets: DayBucket[] = [];
    for (let i = 0; i < cfg.days; i++) {
      const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + (cfg.dir === 1 ? i : -(cfg.days - 1 - i))));
      buckets.push({ day: iso(d), label: `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`, honored: 0, pending: 0, lost: 0 });
    }
    const index = new Map(buckets.map((b, k) => [b.day, k]));
    const wk = WEEK.map((name) => ({ name, count: 0 } as WeekdayBucket));
    let total = 0, covers = 0;
    for (const r of reservations) {
      const day = (r.date_time ?? '').slice(0, 10);
      const k = index.get(day);
      if (k === undefined) continue;
      const b = buckets[k];
      if (HONORED.includes(r.status)) b.honored++; else if (r.status === 'pending') b.pending++; else if (LOST.includes(r.status)) b.lost++; else continue;
      total++; covers += r.party_size || 0;
      const dow = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
      if (!LOST.includes(r.status)) wk[dow].count++;
    }
    return { days: buckets, weekdays: wk, total, covers };
  }, [reservations, cfg]);

  const bestDay = [...weekdays].sort((a, b) => b.count - a.count)[0];
  const summary = `${total} réservation(s) sur la période, ${covers} couvert(s).`;

  return (
    <section aria-labelledby="pro-charts" className="mb-8 rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="pro-charts" className="font-display text-lg font-bold text-dark">Activité</h2>
          <p className="text-xs text-neutral-600">{summary}</p>
        </div>
        <div role="group" aria-label="Période" className="inline-flex overflow-hidden rounded-full border border-neutral-300 text-xs font-semibold">
          {RANGES.map((r) => (
            <button key={r.id} type="button" aria-pressed={range === r.id} aria-label={r.full} title={r.full} onClick={() => setRange(r.id)}
              className={`min-h-[36px] px-4 py-1.5 ${range === r.id ? 'bg-primary-500 text-night' : 'text-neutral-700 hover:bg-neutral-100'}`}>{r.label}</button>
          ))}
        </div>
      </div>

      {total === 0 ? (
        <p className="py-10 text-center text-sm text-neutral-600">Aucune réservation sur cette période.</p>
      ) : (
        <div className="mt-5 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-neutral-800">Réservations par jour</h3>
            <div role="img" aria-label={`Réservations par jour. ${summary}`}><DaysChart data={days} /></div>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-neutral-800">Vos jours forts{bestDay?.count > 0 ? <span className="ml-2 rounded-full bg-primary-500/15 px-2 py-0.5 text-xs font-bold text-primary-700">{bestDay.name}</span> : null}</h3>
            <div role="img" aria-label={`Réservations par jour de la semaine : ${weekdays.map((w) => `${w.name} ${w.count}`).join(', ')}`}><WeekdayChart data={weekdays} /></div>
          </div>
        </div>
      )}
    </section>
  );
}
