import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { formatTripDates, seatsLeft } from '@soutra/shared';
import { getTrip } from '@/lib/tourism';
import { TourismNav } from '@/components/tourism/TourismNav';
import { BookingForm } from './_components/BookingForm';
import { TripDetails } from './_components/TripDetails';
import { RecentTracker } from '@/components/tourism/RecentlyViewed';
import { TripGallery } from '@/components/tourism/TripGallery';
import { TripStickyBar } from '@/components/tourism/TripStickyBar';
import { OffersBlock } from '@/components/tourism/Offers';
import { listOffersForTarget } from '@/lib/offers';
import { getI18n } from '@/lib/i18n/server';
import { languageAlternates, openGraphLocale } from '@/lib/i18n/seo';

export const revalidate = 120;

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const i = getI18n();
  const r = await getTrip(params.slug);
  if (!r) return { title: i.t('trip.notFound'), robots: { index: false } };
  const { trip } = r;
  const name = i.field(trip, 'title') ?? trip.title;
  const title = trip.scope === 'national' ? i.t('trip.metaTitleNational', { title: name }) : i.t('trip.metaTitleInternational', { title: name, country: trip.country });
  const description = i.field(trip, 'summary') ?? i.t('trip.metaDescription', { title: name, days: trip.duration_days, price: i.fmtXOF(trip.base_price_xof) });
  const alt = languageAlternates(`/voyages/${trip.slug}`, i.locale);
  return {
    title, description, alternates: alt,
    openGraph: { title, description, type: 'website', url: alt.canonical, siteName: 'Soutra-Playce', locale: openGraphLocale(i.locale),
      images: trip.cover_url ? [{ url: trip.cover_url, width: 1200, height: 630, alt: name }] : [] },
    twitter: { card: 'summary_large_image', title, description, images: trip.cover_url ? [trip.cover_url] : [] },
  };
}

export default async function TripPage({ params }: { params: { slug: string } }) {
  const i = getI18n();
  const { t, lp, field } = i;
  const r = await getTrip(params.slug);
  if (!r) notFound();
  const { trip, days, packages, destination } = r;
  const offers = await listOffersForTarget('trip', trip.id);
  const national = trip.scope === 'national';
  const left = seatsLeft(trip);
  const gallery = [...new Set([trip.cover_url, ...(trip.gallery_urls ?? [])].filter((u): u is string => !!u))];
  const pct = trip.seats_total > 0 ? Math.min(100, Math.round((trip.seats_booked / trip.seats_total) * 100)) : 0;
  const title = field(trip, 'title') ?? trip.title;
  const summary = field(trip, 'summary');
  const description = field(trip, 'description');

  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'TouristTrip', name: title,
    description: summary ?? description ?? undefined,
    image: trip.cover_url ?? undefined,
    touristType: 'Groupe',
    itinerary: days.map((d) => ({ '@type': 'TouristAttraction', name: d.title })),
    offers: { '@type': 'Offer', price: trip.base_price_xof, priceCurrency: 'XOF',
      availability: left > 0 ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut', validFrom: trip.starts_on },
  };

  return (
    <>
      <TourismNav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <RecentTracker kind="trip" slug={trip.slug} title={title} image={trip.cover_url} price={trip.base_price_xof} />
      <main className="pb-28">
        <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
          <TripGallery images={gallery} title={title} />
          <div className="mt-5">
            {trip.highlight && <span className="rounded-full bg-primary-500 px-3 py-1 text-xs font-bold text-night">{t(`highlight.${trip.highlight}` as 'highlight.a_la_une')}</span>}
            <h1 className="mt-2 font-display text-3xl font-bold text-dark sm:text-4xl">{title}</h1>
            <p className="text-neutral-600">{[trip.city, national ? t('common.country') : trip.country].filter(Boolean).join(' · ')} · {t('trip.duration', { n: trip.duration_days })}</p>
          </div>
        </div>

        <div className="mx-auto mt-6 grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[1fr_380px] lg:px-8">
          <div className="min-w-0 space-y-8">
            {description && <p className="whitespace-pre-line text-neutral-700">{description}</p>}

            <TripDetails i={i} trip={trip} days={days} left={left} />

            <OffersBlock offers={offers} />
            {destination && <Link href={lp(`/destinations/${destination.slug}`)} className="inline-block font-semibold text-primary-700 underline">{t('trip.explore', { name: field(destination as any, 'name') ?? destination.name })}</Link>}
          </div>

          <aside id="booking" className="scroll-mt-20 lg:sticky lg:top-20 lg:self-start">
            <p className="mb-3 text-2xl font-bold text-primary-700"><span className="text-sm font-normal text-neutral-600">{t('common.from')} </span>{i.fmtXOF(trip.base_price_xof)}<span className="text-sm font-normal text-neutral-600">{t('trip.perPerson')}</span></p>
            <div className="mb-3 rounded-2xl border border-neutral-200 bg-white p-4 text-sm">
              <p className="font-semibold text-dark">{t('tripx.departure', { date: formatTripDates(trip.starts_on, trip.ends_on, i.intl) })}</p>
              <div className="mt-3" role="img" aria-label={`${t('tripx.spotsTitle')} : ${t('tripx.filled', { pct })}`}>
                <div className="h-2 overflow-hidden rounded-full bg-neutral-200"><div className={`h-full rounded-full ${left <= 5 ? 'bg-danger' : 'bg-primary-500'}`} style={{ width: `${pct}%` }} /></div>
              </div>
              <p className={`mt-2 flex justify-between text-xs font-semibold ${left > 0 && left <= 5 ? 'text-red-700' : 'text-neutral-600'}`}>
                <span>{left === 0 ? t('booking.full') : left <= 5 ? t('tripx.almostFull') : t('tripx.filled', { pct })}</span>
                {left > 0 && <span>{i.tn('tripx.spotsLeft', left)}</span>}
              </p>
            </div>
            <BookingForm tripId={trip.id} basePrice={trip.base_price_xof} packages={packages} seatsLeft={left} cta={national ? t('trip.bookSeat') : t('trip.bookTrip')} />
            <div className="mt-3 flex gap-2 text-sm">
              {trip.contact_whatsapp && <a className="flex-1 rounded-xl border py-2 text-center font-medium" href={`https://wa.me/${trip.contact_whatsapp.replace(/\D/g, '')}`}>{t('common.whatsapp')}</a>}
              {trip.contact_phone && <a className="flex-1 rounded-xl border py-2 text-center font-medium" href={`tel:${trip.contact_phone}`}>{t('common.call')}</a>}
            </div>
          </aside>
        </div>
      </main>
      {left > 0 && <TripStickyBar price={trip.base_price_xof} cta={t('tripx.reserve')} />}
    </>
  );
}
