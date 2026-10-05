import type { Metadata } from 'next';
import Link from 'next/link';
import { formatTripDates, seatsLeft } from '@soutra/shared';
import { listTripsBySlugs } from '@/lib/tourism';
import { getI18n } from '@/lib/i18n/server';
import { TourismNav } from '@/components/tourism/TourismNav';
import { CompareSync, CopyLink } from '@/components/tourism/CompareUi';

export const dynamic = 'force-dynamic';

type SP = Record<string, string | string[] | undefined>;
const parse = (sp: SP) => {
  const raw = Array.isArray(sp.s) ? sp.s[0] : sp.s;
  return [...new Set((raw ?? '').split(',').map((x) => x.trim()).filter((x) => /^[a-z0-9-]{1,120}$/i.test(x)))].slice(0, 3);
};

export function generateMetadata(): Metadata {
  const { t } = getI18n();
  return { title: t('cmp.metaTitle'), description: t('cmp.metaDescription'), robots: { index: false, follow: true } };
}

export default async function ComparePage({ searchParams }: { searchParams: SP }) {
  const i = getI18n();
  const { t, lp, field, list, fmtXOF } = i;
  const slugs = parse(searchParams);
  const trips = await listTripsBySlugs(slugs);
  const left = trips.map((x) => seatsLeft(x));
  const minPrice = Math.min(...trips.map((x) => x.base_price_xof));
  const minDays = Math.min(...trips.map((x) => x.duration_days));
  const maxLeft = Math.max(...left);
  const multi = trips.length >= 2;
  const without = (slug: string) => lp(`/voyages/comparer?s=${trips.filter((x) => x.slug !== slug).map((x) => x.slug).join(',')}`);

  const rows: { label: string; cell: (k: number) => React.ReactNode }[] = [
    { label: t('cmp.rowPrice'), cell: (k) => (
      <>
        <b className="text-lg text-primary-700">{fmtXOF(trips[k].base_price_xof)}</b>
        {multi && trips[k].base_price_xof === minPrice && <Badge>{t('cmp.bestPrice')}</Badge>}
      </>) },
    { label: t('cmp.rowDates'), cell: (k) => formatTripDates(trips[k].starts_on, trips[k].ends_on, i.intl) },
    { label: t('cmp.rowDuration'), cell: (k) => (
      <>{t('trip.duration', { n: trips[k].duration_days })}{multi && trips[k].duration_days === minDays && trips.some((x) => x.duration_days !== minDays) && <Badge>{t('cmp.shortest')}</Badge>}</>) },
    { label: t('cmp.rowDestination'), cell: (k) => [trips[k].city, trips[k].scope === 'national' ? t('common.country') : trips[k].country].filter(Boolean).join(' · ') },
    { label: t('cmp.rowDeparture'), cell: (k) => trips[k].departure_point ? (trips[k].departure_time ? t('trip.departureAt', { place: trips[k].departure_point as string, time: (trips[k].departure_time as string).slice(0, 5) }) : trips[k].departure_point) : null },
    { label: t('cmp.rowTransport'), cell: (k) => field(trips[k], 'transport') },
    { label: t('cmp.rowLodging'), cell: (k) => field(trips[k], 'lodging') },
    { label: t('cmp.rowMeals'), cell: (k) => field(trips[k], 'meals') },
    { label: t('cmp.rowSeats'), cell: (k) => (
      <><span className={left[k] > 0 && left[k] <= 5 ? 'font-semibold text-red-700' : ''}>{left[k] === 0 ? t('booking.full') : t('trip.seatsValue', { left: left[k], total: trips[k].seats_total })}</span>
        {multi && left[k] === maxLeft && maxLeft > 0 && trips.some((_, j) => left[j] !== maxLeft) && <Badge>{t('cmp.mostSeats')}</Badge>}</>) },
    { label: t('cmp.rowIncluded'), cell: (k) => { const l = list(trips[k], 'inclusions'); return l.length ? <ul className="space-y-1">{l.map((x) => <li key={x}>✅ {x}</li>)}</ul> : null; } },
    { label: t('cmp.rowNotIncluded'), cell: (k) => { const l = list(trips[k], 'exclusions'); return l.length ? <ul className="space-y-1">{l.map((x) => <li key={x}>➖ {x}</li>)}</ul> : null; } },
  ];

  return (
    <>
      <TourismNav />
      <CompareSync slugs={slugs} />
      <main className="mx-auto max-w-7xl px-4 pb-28 pt-8 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-bold text-dark">{t('cmp.title')}</h1>
            <p className="mt-2 max-w-2xl text-neutral-600">{t('cmp.intro')}</p>
          </div>
          {trips.length > 0 && <CopyLink />}
        </div>

        {trips.length === 0 ? (
          <div className="mt-8 rounded-2xl bg-neutral-50 p-8 text-center">
            <p className="text-neutral-700">{t('cmp.empty')}</p>
            <Link href={lp('/voyages/nationaux')} className="mt-4 inline-block rounded-full bg-primary-500 px-5 py-2.5 font-bold text-night hover:bg-primary-400">{t('cmp.browse')}</Link>
          </div>
        ) : (
          <>
            {!multi && <p role="status" className="mt-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{t('cmp.needMore')} <Link className="font-semibold underline" href={lp('/voyages/nationaux')}>{t('cmp.browse')}</Link></p>}
            <div className="mt-6 overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm" aria-label={t('cmp.tableLabel')}>
                <thead>
                  <tr>
                    <td className="sticky left-0 z-10 w-32 bg-white p-3 sm:w-44" />
                    {trips.map((tr) => {
                      const title = field(tr, 'title') ?? tr.title;
                      return (
                        <th key={tr.id} scope="col" className="min-w-[200px] border-l border-neutral-200 p-3 align-top font-normal">
                          <Link href={lp(`/voyages/${tr.slug}`)} className="group block">
                            <span className="block aspect-[4/3] overflow-hidden rounded-xl bg-neutral-100">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              {tr.cover_url ? <img src={tr.cover_url} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /> : <span aria-hidden className="flex h-full items-center justify-center text-4xl">🌴</span>}
                            </span>
                            <span className="mt-2 block font-display text-base font-bold leading-snug text-dark group-hover:text-primary-700">{title}</span>
                          </Link>
                          <span className="mt-2 flex items-center gap-3 text-xs">
                            <Link href={lp(`/voyages/${tr.slug}`)} className="font-semibold text-primary-700 underline">{t('cmp.view')}</Link>
                            <Link href={without(tr.slug)} className="text-neutral-700 underline">{t('cmp.remove')}</Link>
                          </span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.label} className="border-t border-neutral-200">
                      <th scope="row" className="sticky left-0 z-10 bg-white p-3 align-top text-xs font-semibold uppercase tracking-wide text-neutral-600">{r.label}</th>
                      {trips.map((tr, k) => <td key={tr.id} className="border-l border-neutral-200 p-3 align-top text-dark">{r.cell(k) ?? <span className="text-neutral-500" aria-label={t('cmp.unknown')}>{t('cmp.unknown')}</span>}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </>
  );
}

const Badge = ({ children }: { children: React.ReactNode }) => (
  <span className="ml-2 inline-block whitespace-nowrap rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">{children}</span>
);
