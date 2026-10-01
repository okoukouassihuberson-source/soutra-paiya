import type { Metadata } from 'next';
import { TOURISM_CATEGORIES } from '@soutra/shared';
import { searchVenues, listTrips } from '@/lib/tourism';
import { TourismNav } from '@/components/tourism/TourismNav';
import { SearchBar } from '@/components/tourism/SearchBar';
import { VenueCardView, TripCardView } from '@/components/tourism/Cards';

export const revalidate = 120;

type SP = { q?: string; city?: string; cat?: string; page?: string };
const PAGE_SIZE = 24;

export function generateMetadata({ searchParams }: { searchParams: SP }): Metadata {
  const cat = TOURISM_CATEGORIES.find((c) => c.key === searchParams.cat);
  const where = searchParams.city ? ` à ${searchParams.city}` : " en Côte d'Ivoire";
  const what = cat?.label ?? 'Explorer';
  return {
    title: `${what}${where}`,
    description: `${what}${where} : découvrez, comparez et réservez sur Soutra-Playce.`,
    // Les pages de résultats filtrées ne sont pas indexées (évite le contenu dupliqué).
    robots: searchParams.q || searchParams.page ? { index: false, follow: true } : undefined,
    alternates: { canonical: cat ? `/explorer?cat=${cat.key}` : '/explorer' },
  };
}

export default async function ExplorerPage({ searchParams }: { searchParams: SP }) {
  const cat = TOURISM_CATEGORIES.find((c) => c.key === searchParams.cat);
  const page = Math.max(1, Number(searchParams.page) || 1);
  const q = searchParams.q?.slice(0, 80);
  const city = searchParams.city?.slice(0, 60);

  const showTrips = !cat || cat.key.startsWith('voyages');
  const [venues, trips] = await Promise.all([
    cat && !cat.venueCategories ? Promise.resolve([]) : searchVenues({ q, city, categories: cat?.venueCategories, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    showTrips && q ? listTrips({ scope: 'national', q, limit: 6 }) : Promise.resolve([]),
  ]);

  const qs = (p: number) => new URLSearchParams({ ...(q && { q }), ...(city && { city }), ...(cat && { cat: cat.key }), page: String(p) }).toString();

  return (
    <>
      <TourismNav />
      <main className="mx-auto max-w-7xl px-4 pb-28 pt-8 sm:px-6 lg:px-8">
        <h1 className="font-display text-3xl font-bold text-dark">{cat ? `${cat.emoji} ${cat.label}` : 'Explorer'}{city ? ` à ${city}` : ''}</h1>
        <div className="mt-5"><SearchBar q={q} city={city} cat={cat?.key} /></div>

        <div className="mt-5 flex gap-2 overflow-x-auto pb-2" role="list" aria-label="Catégories">
          {TOURISM_CATEGORIES.map((c) => (
            <a key={c.key} role="listitem" href={c.href}
               className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium ${c.key === cat?.key ? 'border-primary-500 bg-primary-500 text-white' : 'border-neutral-200 bg-white text-neutral-700 hover:border-primary-300'}`}>
              {c.emoji} {c.label}
            </a>
          ))}
        </div>

        {trips.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-4 font-display text-xl font-bold">Voyages correspondants</h2>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{trips.map((t) => <TripCardView key={t.id} trip={t} />)}</div>
          </section>
        )}

        <section className="mt-8" aria-live="polite">
          {venues.length === 0 ? (
            <p className="rounded-2xl bg-neutral-50 p-8 text-center text-neutral-600">Aucun résultat pour le moment. Essayez une autre ville ou catégorie.</p>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{venues.map((v) => <VenueCardView key={v.id} venue={v} />)}</div>
          )}
          <div className="mt-8 flex justify-center gap-3">
            {page > 1 && <a className="rounded-full border px-5 py-2 text-sm font-medium" href={`/explorer?${qs(page - 1)}`}>← Précédent</a>}
            {venues.length === PAGE_SIZE && <a className="rounded-full border px-5 py-2 text-sm font-medium" href={`/explorer?${qs(page + 1)}`}>Suivant →</a>}
          </div>
        </section>
      </main>
    </>
  );
}
