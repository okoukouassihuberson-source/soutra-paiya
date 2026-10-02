import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { TOURISM_CATEGORIES } from '@soutra/shared';
import { getDestination } from '@/lib/tourism';
import { TourismNav } from '@/components/tourism/TourismNav';
import { VenueCardView, TripCardView, ActivityCardView } from '@/components/tourism/Cards';
import { getI18n } from '@/lib/i18n/server';
import { languageAlternates, openGraphLocale } from '@/lib/i18n/seo';

export const revalidate = 300;

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const i = getI18n();
  const r = await getDestination(params.slug);
  if (!r) return { title: i.t('dest.notFound'), robots: { index: false } };
  const d = r.destination;
  const name = i.field(d, 'name') ?? d.name;
  const title = i.t('dest.pageTitle', { name });
  const description = i.field(d, 'tagline') ?? i.field(d, 'description')?.slice(0, 160) ?? i.t('dest.pageDescription', { name });
  const alt = languageAlternates(`/destinations/${d.slug}`, i.locale);
  return {
    title, description, alternates: alt,
    openGraph: { title, description, type: 'website', url: alt.canonical, siteName: 'Soutra-Playce', locale: openGraphLocale(i.locale),
      images: d.cover_url ? [{ url: d.cover_url, width: 1200, height: 630, alt: name }] : [] },
    twitter: { card: 'summary_large_image', title, description, images: d.cover_url ? [d.cover_url] : [] },
  };
}

// Sections de la destination : chaque section filtre les venues déjà chargées.
const SECTIONS = ['hotels', 'residences', 'villas', 'restaurants', 'maquis', 'bars', 'plages', 'sites'] as const;

export default async function DestinationPage({ params }: { params: { slug: string } }) {
  const i = getI18n();
  const { t, lp, field } = i;
  const r = await getDestination(params.slug);
  if (!r) notFound();
  const { destination: d, venues, trips, events, activities } = r;
  const name = field(d, 'name') ?? d.name;
  const tagline = field(d, 'tagline');
  const description = field(d, 'description');
  const history = field(d, 'history');

  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'TouristDestination', name,
    description: description ?? tagline ?? undefined, image: d.cover_url ?? undefined,
    ...(d.latitude != null && d.longitude != null ? { geo: { '@type': 'GeoCoordinates', latitude: d.latitude, longitude: d.longitude } } : {}),
  };

  return (
    <>
      <TourismNav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <main className="pb-28">
        <div className="relative h-72 bg-neutral-200 sm:h-96">
          {d.cover_url && /* eslint-disable-next-line @next/next/no-img-element */ <img src={d.cover_url} alt={name} className="h-full w-full object-cover" />}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 mx-auto max-w-7xl px-4 pb-6 text-white sm:px-6 lg:px-8">
            <h1 className="font-display text-4xl font-bold">{name}</h1>
            {tagline && <p className="text-lg text-white/85">{tagline}</p>}
          </div>
        </div>

        <div className="mx-auto max-w-7xl space-y-10 px-4 pt-8 sm:px-6 lg:px-8">
          {description && <p className="max-w-3xl whitespace-pre-line text-neutral-700">{description}</p>}
          {history && <section><h2 className="mb-2 font-display text-xl font-bold">{t('dest.history')}</h2><p className="max-w-3xl whitespace-pre-line text-neutral-700">{history}</p></section>}

          {d.gallery_urls.length > 0 && (
            <section><h2 className="mb-3 font-display text-xl font-bold">{t('common.photos')}</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {d.gallery_urls.slice(0, 8).map((u) => /* eslint-disable-next-line @next/next/no-img-element */ <img key={u} src={u} alt={name} loading="lazy" className="aspect-square rounded-xl object-cover" />)}
              </div>
            </section>
          )}

          {trips.length > 0 && <section><h2 className="mb-3 font-display text-xl font-bold">{t('dest.trips')}</h2><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{trips.map((tr) => <TripCardView key={tr.id} trip={tr} />)}</div></section>}

          {activities.length > 0 && (
            <section>
              <div className="mb-3 flex items-end justify-between">
                <h2 className="font-display text-xl font-bold">{t('dest.activities')}</h2>
                <Link className="text-sm font-semibold text-primary-600" href={lp(`/activites?city=${encodeURIComponent(d.venue_city ?? d.name)}`)}>{t('common.seeAll')}</Link>
              </div>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{activities.map((x) => <ActivityCardView key={x.id} activity={x} />)}</div>
            </section>
          )}

          {SECTIONS.map((key) => {
            const cats = TOURISM_CATEGORIES.find((c) => c.key === key)?.venueCategories ?? [];
            const items = venues.filter((v) => cats.includes(v.category)).slice(0, 8);
            if (items.length === 0) return null;
            return (
              <section key={key}>
                <div className="mb-3 flex items-end justify-between">
                  <h2 className="font-display text-xl font-bold">{t(`destSection.${key}`)}</h2>
                  <Link className="text-sm font-semibold text-primary-600" href={lp(`/explorer?cat=${key}&city=${encodeURIComponent(d.venue_city ?? d.name)}`)}>{t('common.seeAll')}</Link>
                </div>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{items.map((v) => <VenueCardView key={v.id} venue={v} />)}</div>
              </section>
            );
          })}

          {events.length > 0 && (
            <section><h2 className="mb-3 font-display text-xl font-bold">{t('dest.events')}</h2>
              <ul className="grid gap-3 sm:grid-cols-2">{events.map((e) => (
                <li key={e.id} className="rounded-xl border p-4"><b>{e.title}</b><br /><span className="text-sm text-neutral-600">{new Date(e.starts_on).toLocaleDateString(i.intl, { dateStyle: 'long' })}</span></li>
              ))}</ul>
            </section>
          )}

          {d.latitude != null && d.longitude != null && (
            <section><h2 className="mb-3 font-display text-xl font-bold">{t('dest.map')}</h2>
              <iframe title={t('dest.mapTitle', { name })} loading="lazy" className="h-72 w-full rounded-2xl border"
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${d.longitude - 0.08}%2C${d.latitude - 0.05}%2C${d.longitude + 0.08}%2C${d.latitude + 0.05}&layer=mapnik&marker=${d.latitude}%2C${d.longitude}`} />
            </section>
          )}
        </div>
      </main>
    </>
  );
}
