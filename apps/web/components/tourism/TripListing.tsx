import Link from 'next/link';
import { CONTINENTS, type TripScope } from '@soutra/shared';
import { getI18n } from '@/lib/i18n/server';
import { listTrips, tripPins } from '@/lib/tourism';
import { SplitResults } from './SplitResults';
import type { MapItem } from './ResultsMap';
import { TourismNav } from './TourismNav';
import { TripCardView } from './Cards';

export async function TripListing({ scope, continent }: { scope: TripScope; continent?: string }) {
  const i = getI18n();
  const { t, lp } = i;
  const national = scope === 'national';
  const trips = await listTrips({ scope, continent });
  const pins = await tripPins(trips);
  // Plusieurs voyages vers la même destination : léger décalage déterministe pour que les pastilles restent cliquables.
  const seen = new Map<string, number>();
  const mapItems: MapItem[] = trips.flatMap((tr) => {
    const p = tr.destination_id ? pins.get(tr.destination_id) : undefined;
    if (!p || !tr.destination_id) return [];
    const n = seen.get(tr.destination_id) ?? 0; seen.set(tr.destination_id, n + 1);
    const a = n * 2.4, r = n === 0 ? 0 : 0.012 * Math.ceil(n / 6);
    return [{
      id: tr.id, href: i.lp(`/voyages/${tr.slug}`), title: i.field(tr, 'title') ?? tr.title, image: tr.cover_url, emoji: '🧳',
      sub: [tr.city, national ? t('common.country') : tr.country].filter(Boolean).join(' · '),
      rating: null, ratingCount: 0, price: tr.base_price_xof, lat: p.lat + r * Math.sin(a), lng: p.lng + r * Math.cos(a),
    }];
  });
  const grid = (narrow: boolean) => (
    <div className={`grid gap-5 sm:grid-cols-2 ${narrow ? '' : 'lg:grid-cols-3'}`}>
      {trips.map((tr) => <div key={tr.id} className="[&>a]:block [&>a]:h-full" data-map-id={tr.id}><TripCardView trip={tr} /></div>)}
    </div>
  );
  return (
    <>
      <TourismNav />
      <main className="mx-auto max-w-7xl px-4 pb-28 pt-8 sm:px-6 lg:px-8">
        <div role="group" aria-label={t('nav.trips')} className="mb-4 inline-flex rounded-full border border-neutral-200 bg-white p-1 text-sm font-semibold">
          <Link href={lp('/voyages/nationaux')} aria-current={national ? 'page' : undefined} className={`rounded-full px-4 py-2 ${national ? 'bg-night text-white' : 'text-neutral-600 hover:text-night'}`}>{t('nav.tripsNational')}</Link>
          <Link href={lp('/voyages/internationaux')} aria-current={!national ? 'page' : undefined} className={`rounded-full px-4 py-2 ${!national ? 'bg-night text-white' : 'text-neutral-600 hover:text-night'}`}>{t('nav.tripsInternational')}</Link>
        </div>
        <h1 className="font-display text-3xl font-bold text-dark">
          {national ? t('trips.nationalTitle') : t('trips.internationalTitle')}
        </h1>
        <p className="mt-2 max-w-2xl text-neutral-600">
          {national ? t('trips.nationalIntro') : t('trips.internationalIntro')}
        </p>
        {!national && (
          <div className="mt-5 flex gap-2 overflow-x-auto pb-2">
            <Link href={lp('/voyages/internationaux')} className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm ${!continent ? 'border-primary-500 bg-primary-500 text-night' : 'border-neutral-200'}`}>{t('trips.allContinents')}</Link>
            {CONTINENTS.map((c) => (
              <Link key={c.value} href={lp(`/voyages/internationaux?continent=${c.value}`)} className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm ${continent === c.value ? 'border-primary-500 bg-primary-500 text-night' : 'border-neutral-200'}`}>{t(`continent.${c.value}` as 'continent.afrique')}</Link>
            ))}
          </div>
        )}
        {trips.length === 0 ? (
          <p className="mt-8 rounded-2xl bg-neutral-50 p-8 text-center text-neutral-600">{t('trips.empty')}</p>
        ) : mapItems.length > 0 ? (
          <div className="mt-8"><SplitResults items={mapItems} mode="split">{grid(true)}</SplitResults></div>
        ) : (
          <div className="mt-8">{grid(false)}</div>
        )}
      </main>
    </>
  );
}
