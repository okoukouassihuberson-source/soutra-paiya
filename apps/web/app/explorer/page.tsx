import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { TOURISM_CATEGORIES } from '@soutra/shared';
import { exploreVenues, listTrips, type ExploreParams } from '@/lib/tourism';
import { EXPLORER_AMENITIES, EXPLORER_SORTS } from '@/lib/explorer-options';
import { TourismNav } from '@/components/tourism/TourismNav';
import { ExplorerFilters, type FilterValues } from '@/components/tourism/ExplorerFilters';
import { VenueCardView, TripCardView } from '@/components/tourism/Cards';
import { VenuesMapLazy } from '@/components/tourism/VenuesMapLazy';

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
    sort: EXPLORER_SORTS.some((s) => s.key === sortKey) ? sortKey : 'rating', view: one(sp.view) === 'map' ? 'map' : 'list',
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
  const { v, cat } = parse(searchParams);
  const where = v.city ? ` à ${v.city}` : " en Côte d'Ivoire";
  const what = cat?.label ?? 'Explorer';
  const filtered = Object.keys(searchParams).some((k) => k !== 'cat');
  return {
    title: `${what}${where}`,
    description: `${what}${where} : découvrez, comparez et réservez sur Soutra-Playce.`,
    // Les pages filtrées ne sont pas indexées (contenu dupliqué) ; la page de catégorie l'est.
    robots: filtered ? { index: false, follow: true } : undefined,
    alternates: { canonical: cat ? `/explorer?cat=${cat.key}` : '/explorer' },
  };
}

export default async function ExplorerPage({ searchParams }: { searchParams: SP }) {
  const { v, params, cat, page, user } = parse(searchParams);
  // Catégories sans établissements (activités, voyages) : leur page dédiée.
  if (cat && !cat.venueCategories) redirect(cat.href);
  const mapView = v.view === 'map';

  const showTrips = !cat || cat.key.startsWith('voyages');
  const [res, trips] = await Promise.all([
    cat && !cat.venueCategories
      ? Promise.resolve({ venues: [], total: 0 } as Awaited<ReturnType<typeof exploreVenues>>)
      : exploreVenues({ ...params, limit: mapView ? MAP_LIMIT : PAGE_SIZE, offset: mapView ? 0 : (page - 1) * PAGE_SIZE }),
    showTrips && v.q ? listTrips({ scope: 'national', q: v.q, limit: 6 }) : Promise.resolve([]),
  ]);
  const { venues, total } = res;
  const mapped = venues.filter((x) => x.lat != null && x.lng != null) as (typeof venues[number] & { lat: number; lng: number })[];

  // Liens qui conservent tous les filtres (pagination / bascule liste-carte).
  const base = new URLSearchParams();
  Object.entries(searchParams).forEach(([k, val]) => {
    if (k === 'page' || k === 'view') return;
    ([] as string[]).concat(val ?? []).forEach((x) => x !== '' && base.append(k, x));
  });
  const href = (extra: Record<string, string>) => {
    const q = new URLSearchParams(base);
    Object.entries(extra).forEach(([k, x]) => q.set(k, x));
    return `/explorer?${q.toString()}`;
  };
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <TourismNav />
      <main className="mx-auto max-w-7xl px-4 pb-28 pt-8 sm:px-6 lg:px-8">
        <h1 className="font-display text-3xl font-bold text-dark">{cat ? `${cat.emoji} ${cat.label}` : 'Explorer'}{v.city ? ` à ${v.city}` : ''}</h1>
        <div className="mt-5"><ExplorerFilters v={v} /></div>

        <div className="mt-5 flex gap-2 overflow-x-auto pb-2" role="list" aria-label="Catégories">
          {TOURISM_CATEGORIES.map((c) => (
            <Link key={c.key} role="listitem" href={c.key === cat?.key ? '/explorer' : c.href}
              className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium ${c.key === cat?.key ? 'border-primary-500 bg-primary-500 text-white' : 'border-neutral-200 bg-white text-neutral-700 hover:border-primary-300'}`}>
              {c.emoji} {c.label}
            </Link>
          ))}
        </div>

        {trips.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-4 font-display text-xl font-bold">Voyages correspondants</h2>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{trips.map((t) => <TripCardView key={t.id} trip={t} />)}</div>
          </section>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-neutral-600" aria-live="polite">
            {res.error ? 'Recherche indisponible pour le moment.' : `${total} résultat${total > 1 ? 's' : ''}`}
            {mapView && total > MAP_LIMIT ? ` (${MAP_LIMIT} affichés sur la carte — affinez vos filtres)` : ''}
          </p>
          <div className="inline-flex overflow-hidden rounded-full border border-neutral-300 text-sm font-medium" role="group" aria-label="Affichage">
            <Link href={href({ view: 'list' })} className={`px-4 py-1.5 ${!mapView ? 'bg-dark text-white' : 'bg-white'}`}>☰ Liste</Link>
            <Link href={href({ view: 'map' })} className={`px-4 py-1.5 ${mapView ? 'bg-dark text-white' : 'bg-white'}`}>🗺️ Carte</Link>
          </div>
        </div>

        <section className="mt-4">
          {venues.length === 0 ? (
            <p className="rounded-2xl bg-neutral-50 p-8 text-center text-neutral-600">Aucun résultat. Essayez d’élargir vos filtres, une autre ville ou une autre catégorie.</p>
          ) : mapView ? (
            mapped.length === 0
              ? <p className="rounded-2xl bg-neutral-50 p-8 text-center text-neutral-600">Ces établissements n’ont pas encore de position GPS.</p>
              : <VenuesMapLazy venues={mapped} user={user} />
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {venues.map((x) => (
                <div key={x.id} className="relative">
                  <VenueCardView venue={x} />
                  {x.distance_km != null && <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/65 px-2.5 py-1 text-xs font-semibold text-white">{x.distance_km < 10 ? x.distance_km.toFixed(1) : Math.round(x.distance_km)} km</span>}
                </div>
              ))}
            </div>
          )}
          {!mapView && pages > 1 && (
            <nav className="mt-8 flex items-center justify-center gap-3" aria-label="Pagination">
              {page > 1 && <Link className="rounded-full border px-5 py-2 text-sm font-medium" href={href({ page: String(page - 1) })}>← Précédent</Link>}
              <span className="text-sm text-neutral-600">Page {page} / {pages}</span>
              {page < pages && <Link className="rounded-full border px-5 py-2 text-sm font-medium" href={href({ page: String(page + 1) })}>Suivant →</Link>}
            </nav>
          )}
        </section>
      </main>
    </>
  );
}
