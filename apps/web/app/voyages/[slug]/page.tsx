import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { formatTripDates, formatXOF, seatsLeft, HIGHLIGHT_LABELS } from '@soutra/shared';
import { getTrip } from '@/lib/tourism';
import { TourismNav } from '@/components/tourism/TourismNav';
import { BookingForm } from './_components/BookingForm';

export const revalidate = 120;

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const r = await getTrip(params.slug);
  if (!r) return { title: 'Voyage introuvable', robots: { index: false } };
  const { trip } = r;
  const title = `${trip.title} — voyage groupé ${trip.scope === 'national' ? 'en Côte d’Ivoire' : trip.country}`;
  const description = trip.summary ?? `${trip.title} : ${trip.duration_days} jours dès ${formatXOF(trip.base_price_xof)}. Réservez votre place sur Soutra-Playce.`;
  return {
    title, description,
    alternates: { canonical: `/voyages/${trip.slug}` },
    openGraph: { title, description, type: 'website', url: `/voyages/${trip.slug}`, siteName: 'Soutra-Playce', locale: 'fr_CI',
      images: trip.cover_url ? [{ url: trip.cover_url, width: 1200, height: 630, alt: trip.title }] : [] },
    twitter: { card: 'summary_large_image', title, description, images: trip.cover_url ? [trip.cover_url] : [] },
  };
}

const Row = ({ k, v }: { k: string; v?: string | null }) => v ? (
  <div className="flex gap-3 border-b border-neutral-100 py-2 text-sm"><dt className="w-32 shrink-0 font-semibold text-neutral-500">{k}</dt><dd className="text-dark">{v}</dd></div>
) : null;

export default async function TripPage({ params }: { params: { slug: string } }) {
  const r = await getTrip(params.slug);
  if (!r) notFound();
  const { trip, days, packages, destination } = r;
  const national = trip.scope === 'national';
  const left = seatsLeft(trip);

  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'TouristTrip', name: trip.title,
    description: trip.summary ?? trip.description ?? undefined,
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
      <main className="pb-28">
        <div className="relative h-64 bg-neutral-200 sm:h-96">
          {trip.cover_url && /* eslint-disable-next-line @next/next/no-img-element */ <img src={trip.cover_url} alt={trip.title} className="h-full w-full object-cover" />}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 mx-auto max-w-7xl px-4 pb-6 text-white sm:px-6 lg:px-8">
            {trip.highlight && <span className="rounded-full bg-primary-500 px-3 py-1 text-xs font-bold">{HIGHLIGHT_LABELS[trip.highlight]}</span>}
            <h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl">{trip.title}</h1>
            <p className="text-white/85">{[trip.city, trip.country].filter(Boolean).join(' · ')} · {trip.duration_days} jours</p>
          </div>
        </div>

        <div className="mx-auto mt-8 grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[1fr_380px] lg:px-8">
          <div className="space-y-8">
            {trip.description && <p className="whitespace-pre-line text-neutral-700">{trip.description}</p>}

            <section aria-labelledby="infos"><h2 id="infos" className="mb-2 font-display text-xl font-bold">Informations</h2>
              <dl>
                <Row k="Dates" v={formatTripDates(trip.starts_on, trip.ends_on)} />
                <Row k="Départ" v={[trip.departure_point, trip.departure_time?.slice(0, 5)].filter(Boolean).join(' à ')} />
                <Row k="Retour" v={trip.return_time?.slice(0, 5)} />
                <Row k="Transport" v={trip.transport} /><Row k="Vol" v={trip.flight_info} />
                <Row k="Hébergement" v={trip.lodging} /><Row k="Hôtel" v={trip.hotel_info} />
                <Row k="Transfert" v={trip.transfer_info} /><Row k="Repas" v={trip.meals} />
                <Row k="Assurance" v={trip.insurance_info} /><Row k="Visa" v={trip.visa_info} />
                <Row k="Places" v={`${left} restante(s) sur ${trip.seats_total}`} />
              </dl>
            </section>

            {(trip.inclusions.length > 0 || trip.activities.length > 0) && (
              <section className="grid gap-6 sm:grid-cols-2">
                {trip.inclusions.length > 0 && <div><h2 className="mb-2 font-display text-xl font-bold">Inclus</h2><ul className="space-y-1 text-sm">{trip.inclusions.map((i) => <li key={i}>✅ {i}</li>)}</ul></div>}
                {trip.activities.length > 0 && <div><h2 className="mb-2 font-display text-xl font-bold">Activités</h2><ul className="space-y-1 text-sm">{trip.activities.map((i) => <li key={i}>🎯 {i}</li>)}</ul></div>}
                {trip.exclusions.length > 0 && <div><h2 className="mb-2 font-display text-xl font-bold">Non inclus</h2><ul className="space-y-1 text-sm">{trip.exclusions.map((i) => <li key={i}>➖ {i}</li>)}</ul></div>}
              </section>
            )}

            {days.length > 0 && (
              <section><h2 className="mb-3 font-display text-xl font-bold">Programme jour par jour</h2>
                <ol className="space-y-4 border-l-2 border-primary-200 pl-5">
                  {days.map((d) => (
                    <li key={d.id}>
                      <p className="text-xs font-bold uppercase text-primary-600">Jour {d.day_number}</p>
                      <h3 className="font-semibold">{d.title}</h3>
                      {d.stops.length > 0 && <p className="text-sm text-neutral-500">{d.stops.join(' → ')}</p>}
                      {d.description && <p className="mt-1 text-sm text-neutral-700">{d.description}</p>}
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {trip.conditions && <section><h2 className="mb-2 font-display text-xl font-bold">Conditions</h2><p className="whitespace-pre-line text-sm text-neutral-700">{trip.conditions}</p></section>}
            {destination && <Link href={`/destinations/${destination.slug}`} className="inline-block font-semibold text-primary-600 underline">Explorer {destination.name} →</Link>}
          </div>

          <aside className="lg:sticky lg:top-20 lg:self-start">
            <p className="mb-3 text-2xl font-bold text-primary-600"><span className="text-sm font-normal text-neutral-500">dès </span>{formatXOF(trip.base_price_xof)}<span className="text-sm font-normal text-neutral-500"> / pers.</span></p>
            <BookingForm tripId={trip.id} basePrice={trip.base_price_xof} packages={packages} seatsLeft={left} cta={national ? 'Réserver ma place' : 'Réserver le voyage'} />
            <div className="mt-3 flex gap-2 text-sm">
              {trip.contact_whatsapp && <a className="flex-1 rounded-xl border py-2 text-center font-medium" href={`https://wa.me/${trip.contact_whatsapp.replace(/\D/g, '')}`}>WhatsApp</a>}
              {trip.contact_phone && <a className="flex-1 rounded-xl border py-2 text-center font-medium" href={`tel:${trip.contact_phone}`}>Appeler</a>}
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}
