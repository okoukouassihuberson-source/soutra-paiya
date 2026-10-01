import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { TOURISM_CATEGORIES } from '@soutra/shared';
import { getDestination } from '@/lib/tourism';
import { TourismNav } from '@/components/tourism/TourismNav';
import { VenueCardView, TripCardView } from '@/components/tourism/Cards';

export const revalidate = 300;

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const r = await getDestination(params.slug);
  if (!r) return { title: 'Destination introuvable', robots: { index: false } };
  const d = r.destination;
  const title = `${d.name} : hôtels, restaurants, activités et voyages`;
  const description = d.tagline ?? d.description?.slice(0, 160) ?? `Explorez ${d.name} avec Soutra-Playce.`;
  return {
    title, description, alternates: { canonical: `/destinations/${d.slug}` },
    openGraph: { title, description, type: 'website', url: `/destinations/${d.slug}`, siteName: 'Soutra-Playce', locale: 'fr_CI',
      images: d.cover_url ? [{ url: d.cover_url, width: 1200, height: 630, alt: d.name }] : [] },
    twitter: { card: 'summary_large_image', title, description, images: d.cover_url ? [d.cover_url] : [] },
  };
}

// Sections de la destination : chaque section filtre les venues déjà chargées.
const SECTIONS: { key: string; title: string }[] = [
  { key: 'hotels', title: '🏨 Hôtels' }, { key: 'residences', title: '🏠 Résidences' }, { key: 'villas', title: '🏡 Villas' },
  { key: 'restaurants', title: '🍽️ Restaurants' }, { key: 'maquis', title: '🍢 Maquis' }, { key: 'bars', title: '🍸 Bars & Lounges' },
  { key: 'plages', title: '🏖️ Plages' }, { key: 'sites', title: '🌴 Sites touristiques' }, { key: 'activites', title: '🎯 Activités' },
];

export default async function DestinationPage({ params }: { params: { slug: string } }) {
  const r = await getDestination(params.slug);
  if (!r) notFound();
  const { destination: d, venues, trips, events } = r;

  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'TouristDestination', name: d.name,
    description: d.description ?? d.tagline ?? undefined, image: d.cover_url ?? undefined,
    ...(d.latitude != null && d.longitude != null ? { geo: { '@type': 'GeoCoordinates', latitude: d.latitude, longitude: d.longitude } } : {}),
  };

  return (
    <>
      <TourismNav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <main className="pb-28">
        <div className="relative h-72 bg-neutral-200 sm:h-96">
          {d.cover_url && /* eslint-disable-next-line @next/next/no-img-element */ <img src={d.cover_url} alt={d.name} className="h-full w-full object-cover" />}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 mx-auto max-w-7xl px-4 pb-6 text-white sm:px-6 lg:px-8">
            <h1 className="font-display text-4xl font-bold">{d.name}</h1>
            {d.tagline && <p className="text-lg text-white/85">{d.tagline}</p>}
          </div>
        </div>

        <div className="mx-auto max-w-7xl space-y-10 px-4 pt-8 sm:px-6 lg:px-8">
          {d.description && <p className="max-w-3xl whitespace-pre-line text-neutral-700">{d.description}</p>}
          {d.history && <section><h2 className="mb-2 font-display text-xl font-bold">Histoire</h2><p className="max-w-3xl whitespace-pre-line text-neutral-700">{d.history}</p></section>}

          {d.gallery_urls.length > 0 && (
            <section><h2 className="mb-3 font-display text-xl font-bold">Photos</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {d.gallery_urls.slice(0, 8).map((u) => /* eslint-disable-next-line @next/next/no-img-element */ <img key={u} src={u} alt={`${d.name}`} loading="lazy" className="aspect-square rounded-xl object-cover" />)}
              </div>
            </section>
          )}

          {trips.length > 0 && <section><h2 className="mb-3 font-display text-xl font-bold">🚌 Voyages disponibles</h2><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{trips.map((t) => <TripCardView key={t.id} trip={t} />)}</div></section>}

          {SECTIONS.map((s) => {
            const cats = TOURISM_CATEGORIES.find((c) => c.key === s.key)?.venueCategories ?? [];
            const items = venues.filter((v) => cats.includes(v.category)).slice(0, 8);
            if (items.length === 0) return null;
            return (
              <section key={s.key}>
                <div className="mb-3 flex items-end justify-between">
                  <h2 className="font-display text-xl font-bold">{s.title}</h2>
                  <Link className="text-sm font-semibold text-primary-600" href={`/explorer?cat=${s.key}&city=${encodeURIComponent(d.venue_city ?? d.name)}`}>Tout voir →</Link>
                </div>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{items.map((v) => <VenueCardView key={v.id} venue={v} />)}</div>
              </section>
            );
          })}

          {events.length > 0 && (
            <section><h2 className="mb-3 font-display text-xl font-bold">🎉 Événements</h2>
              <ul className="grid gap-3 sm:grid-cols-2">{events.map((e) => (
                <li key={e.id} className="rounded-xl border p-4"><b>{e.title}</b><br /><span className="text-sm text-neutral-600">{new Date(e.starts_on).toLocaleDateString('fr-FR', { dateStyle: 'long' })}</span></li>
              ))}</ul>
            </section>
          )}

          {d.latitude != null && d.longitude != null && (
            <section><h2 className="mb-3 font-display text-xl font-bold">🗺️ Carte</h2>
              <iframe title={`Carte de ${d.name}`} loading="lazy" className="h-72 w-full rounded-2xl border"
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${d.longitude - 0.08}%2C${d.latitude - 0.05}%2C${d.longitude + 0.08}%2C${d.latitude + 0.05}&layer=mapnik&marker=${d.latitude}%2C${d.longitude}`} />
            </section>
          )}
        </div>
      </main>
    </>
  );
}
