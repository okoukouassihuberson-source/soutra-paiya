import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { TOURISM_CATEGORIES, categoryEmoji } from '@soutra/shared';
import { exploreVenues, listTrips, type ExploreParams } from '@/lib/tourism';
import { EXPLORER_AMENITIES, EXPLORER_SORTS } from '@/lib/explorer-options';
import { TourismNav } from '@/components/tourism/TourismNav';
import { ExplorerFilters, type FilterValues } from '@/components/tourism/ExplorerFilters';
import { VenueCardView, TripCardView } from '@/components/tourism/Cards';
import { SplitResults } from '@/components/tourism/SplitResults';
import type { MapItem } from '@/components/tourism/ResultsMap';
import { getI18n } from '@/lib/i18n/server';
import { languageAlternates } from '@/lib/i18n/seo';

export const dynamic = 'force-dynamic';

type SP = Record<string, string | string[] | undefined>;
const PAGE_SIZE = 24;
const MAP_LIMIT = 100;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const num = (v: string, min: number, max: number) => {
  if (v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : undefined;
};
const date = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');

function parse(sp: SP) {
  const known = new Set<string>(EXPLORER_AMENITIES.map((a) => a.key));
  const am = ([] as string[]).concat(sp.am ?? []).filter((k) => known.has(k));
  const sortKey = one(sp.sort);
  const v: FilterValues = {
    q: one(sp.q).slice(0, 80), city: one(sp.city).slice(0, 60), commune: one(sp.commune).slice(0, 60), district: one(sp.district).slice(0, 60),
    cat: TOURISM_CATEGORIES.some((c) => c.key === one(sp.cat)) ? one(sp.cat) : '',
    minPrice: one(sp.min_price), maxPrice: one(sp.max_price), minRating: one(sp.min_rating), amenities: am,
    openNow: one(sp.open) === '1', onlinePayment: one(sp.pay) === '1', checkIn: date(one(sp.check_in)), checkOut: date(one(sp.check_out)),
    lat: one(sp.lat), lng: one(sp.lng), radius: one(sp.radius),
    sort: EXPLORER_SORTS.some((s) => s.key === sortKey) ? sortKey : 'rating', view: one(sp.view) === 'map' ? 'map' : one(sp.view) === 'list' ? 'list' : 'split',
  };
  const lat = num(v.lat, -90, 90), lng = num(v.lng, -180, 180);
  const hasDates = !!v.checkIn && !!v.checkOut && v.checkOut > v.checkIn;
  const cat = TOURISM_CATEGORIES.find((c) => c.key === v.cat);
  const params: ExploreParams = {
    q: v.q, city: v.city, commune: v.commune, district: v.district, categories: cat?.venueCategories,
    minPrice: num(v.minPrice, 0, 100_000_000), maxPrice: num(v.maxPrice, 0, 100_000_000), minRating: num(v.minRating, 0, 5),
    amenities: am, openNow: v.openNow, onlinePayment: v.onlinePayment,
    checkIn: hasDates ? v.checkIn : undefined, checkOut: hasDates ? v.checkOut : undefined,
    ...(lat !== undefined && lng !== undefined ? { lat, lng, radiusKm: num(v.radius, 0.5, 500) } : {}),
    sort: v.sort,
  };
  return { v, params, cat, page: Math.max(1, Math.floor(Number(one(sp.page))) || 1), user: lat !== undefined && lng !== undefined ? ([lat, lng] as [number, number]) : undefined };
}

export function generateMetadata({ searchParams }: { searchParams: SP }): Metadata {
  const { t, tdyn, locale } = getI18n();
  const { v, cat } = parse(searchParams);
  const where = v.city ? t('explorer.metaWhereCity', { city: v.city }) : t('explorer.metaWhereDefault');
  const what = cat ? tdyn('cat', cat.key, cat.label) : t('explorer.title');
  const filtered = Object.keys(searchParams).some((k) => k !== 'cat');
  return {
    title: `${what}${where}`,
    description: t('explorer.metaDescription', { what, where }),
    // Les pages filtrées ne sont pas indexées (contenu dupliqué) ; la page de catégorie l'est.
    robots: filtered ? { index: false, follow: true } : undefined,
    alternates: languageAlternates(cat ? `/explorer?cat=${cat.key}` : '/explorer', locale),
  };
}

export default async function ExplorerPage({ searchParams }: { searchParams: SP }) {
  const { t, tn, tdyn, lp, fmtNumber } = getI18n();
  const { v, params, cat, page, user } = parse(searchParams);
  // Catégories sans établissements (activités, voyages) : leur page dédiée.
  if (cat && !cat.venueCategories) redirect(lp(cat.href));
  const mapView = v.view === 'map';
  const splitView = v.view === 'split';

  const showTrips = !cat || cat.key.startsWith('voyages');
  const [res, trips] = await Promise.all([
    cat && !cat.venueCategories
      ? Promise.resolve({ venues: [], total: 0 } as Awaited<ReturnType<typeof exploreVenues>>)
      : exploreVenues({ ...params, limit: mapView ? MAP_LIMIT : PAGE_SIZE, offset: mapView ? 0 : (page - 1) * PAGE_SIZE }),
    showTrips && v.q ? listTrips({ scope: 'national', q: v.q, limit: 6 }) : Promise.resolve([]),
  ]);
  const { venues, total } = res;
  const mapItems: MapItem[] = venues.filter((x) => x.lat != null && x.lng != null).map((x) => ({
    id: x.id, href: `/v/${x.slug}`, title: x.name, image: x.cover_url, emoji: categoryEmoji(x.category as any),
    sub: `${tdyn('venueCat', x.category, x.category)} · ${[x.district, x.city].filter(Boolean).join(', ')}`,
    rating: x.rating_avg, ratingCount: x.rating_count ?? 0, price: x.avg_price_xof, lat: x.lat as number, lng: x.lng as number,
  }));

  // Liens qui conservent tous les filtres (pagination / bascule liste-carte).
  const base = new URLSearchParams();
  Object.entries(searchParams).forEach(([k, val]) => {
    if (k === 'page' || k === 'view') return;
    ([] as string[]).concat(val ?? []).forEach((x) => x !== '' && base.append(k, x));
  });
  const href = (extra: Record<string, string>) => {
    const q = new URLSearchParams(base);
    Object.entries(extra).forEach(([k, x]) => q.set(k, x));
    return lp(`/explorer?${q.toString()}`);
  };
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const grid = (narrow: boolean) => (
    <div className={`grid gap-5 sm:grid-cols-2 ${narrow ? 'xl:grid-cols-2' : 'lg:grid-cols-3 xl:grid-cols-4'}`}>
      {venues.map((x) => (
        <div key={x.id} className="relative [&>a]:block [&>a]:h-full" data-map-id={x.id}>
          <VenueCardView venue={x} />
          {x.distance_km != null && <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/65 px-2.5 py-1 text-xs font-semibold text-white">{t('filters.km', { n: x.distance_km < 10 ? x.distance_km.toFixed(1) : Math.round(x.distance_km) })}</span>}
        </div>
      ))}
    </div>
  );

  return (
    <>
      <TourismNav />
      <main className="mx-auto max-w-7xl px-4 pb-28 pt-8 sm:px-6 lg:px-8">
        <h1 className="font-display text-3xl font-bold text-dark">{(() => {
          const what = cat ? `${cat.emoji} ${tdyn('cat', cat.key, cat.label)}` : t('explorer.title');
          return v.city ? t('explorer.titleIn', { what, city: v.city }) : what;
        })()}</h1>
        <div className="mt-5"><ExplorerFilters v={v} /></div>

        <div className="mt-5 flex gap-2 overflow-x-auto pb-2" role="list" aria-label={t('explorer.categories')}>
          {TOURISM_CATEGORIES.map((c) => (
            <Link key={c.key} role="listitem" href={c.key === cat?.key ? lp('/explorer') : lp(c.href)}
              className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium ${c.key === cat?.key ? 'border-primary-500 bg-primary-500 text-night' : 'border-neutral-200 bg-white text-neutral-700 hover:border-primary-300'}`}>
              {c.emoji} {tdyn('cat', c.key, c.label)}
            </Link>
          ))}
        </div>

        {trips.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-4 font-display text-xl font-bold">{t('explorer.matchingTrips')}</h2>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{trips.map((t) => <TripCardView key={t.id} trip={t} />)}</div>
          </section>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-neutral-600" aria-live="polite">
            {res.error ? t('explorer.unavailable') : tn('explorer.results', total, { n: fmtNumber(total) })}
            {mapView && total > MAP_LIMIT ? t('explorer.mapCap', { max: MAP_LIMIT }) : ''}
          </p>
          <div className="inline-flex overflow-hidden rounded-full border border-neutral-300 text-sm font-medium" role="group" aria-label={t('split.view')}>
            <Link href={href({ view: 'list' })} aria-current={v.view === 'list' ? 'true' : undefined} className={`px-4 py-1.5 ${v.view === 'list' ? 'bg-dark text-white' : 'bg-white'}`}>{t('split.list')}</Link>
            <Link href={href({ view: 'split' })} aria-current={splitView ? 'true' : undefined} className={`hidden px-4 py-1.5 lg:block ${splitView ? 'bg-dark text-white' : 'bg-white'}`}>{t('split.split')}</Link>
            <Link href={href({ view: 'map' })} aria-current={mapView ? 'true' : undefined} className={`px-4 py-1.5 ${mapView ? 'bg-dark text-white' : 'bg-white'}`}>{t('split.map')}</Link>
          </div>
        </div>

        <section className="mt-4">
          {venues.length === 0 ? (
            <p className="rounded-2xl bg-neutral-50 p-8 text-center text-neutral-600">{t('explorer.empty')}</p>
          ) : mapView ? (
            <SplitResults items={mapItems} user={user} mode="map" />
          ) : splitView ? (
            <SplitResults items={mapItems} user={user} mode="split">{grid(true)}</SplitResults>
          ) : grid(false)}
          {!mapView && pages > 1 && (
            <nav className="mt-8 flex items-center justify-center gap-3" aria-label={t('common.pagination')}>
              {page > 1 && <Link className="rounded-full border px-5 py-2 text-sm font-medium" href={href({ page: String(page - 1) })}>{t('common.previous')}</Link>}
              <span className="text-sm text-neutral-600">{t('common.page', { n: page, total: pages })}</span>
              {page < pages && <Link className="rounded-full border px-5 py-2 text-sm font-medium" href={href({ page: String(page + 1) })}>{t('common.next')}</Link>}
            </nav>
          )}
        </section>
      </main>
    </>
  );
}
