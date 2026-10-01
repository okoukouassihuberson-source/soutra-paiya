import Link from 'next/link';
import { HIGHLIGHT_LABELS, formatTripDates, formatXOF, seatsLeft, categoryLabel, categoryEmoji, type Destination } from '@soutra/shared';
import type { TripCard, VenueCard } from '@/lib/tourism';

function Cover({ src, alt }: { src: string | null; alt: string }) {
  return src
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={src} alt={alt} loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
    : <div aria-hidden className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary-100 to-secondary-100 text-4xl">🌴</div>;
}

export function TripCardView({ trip }: { trip: TripCard }) {
  const left = seatsLeft(trip);
  return (
    <Link href={`/voyages/${trip.slug}`} className="group overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl">
      <div className="relative aspect-[4/3] overflow-hidden bg-neutral-100">
        <Cover src={trip.cover_url} alt={trip.title} />
        {trip.highlight && (
          <span className="absolute left-3 top-3 rounded-full bg-primary-500 px-3 py-1 text-xs font-bold text-white">{HIGHLIGHT_LABELS[trip.highlight]}</span>
        )}
        <span className="absolute bottom-3 right-3 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white">{trip.duration_days} j</span>
      </div>
      <div className="space-y-2 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{[trip.city, trip.country].filter(Boolean).join(' · ')}</p>
        <h3 className="font-display text-lg font-bold leading-snug text-dark">{trip.title}</h3>
        <p className="text-sm text-neutral-600">{formatTripDates(trip.starts_on, trip.ends_on)}</p>
        <div className="flex items-end justify-between pt-1">
          <p className="text-lg font-bold text-primary-600"><span className="text-xs font-normal text-neutral-500">dès </span>{formatXOF(trip.base_price_xof)}</p>
          <p className={`text-xs font-semibold ${left <= 5 ? 'text-danger' : 'text-neutral-500'}`}>
            {left === 0 ? 'Complet' : `${left} place${left > 1 ? 's' : ''} restante${left > 1 ? 's' : ''}`}
          </p>
        </div>
      </div>
    </Link>
  );
}

export function VenueCardView({ venue }: { venue: VenueCard }) {
  return (
    <Link href={`/v/${venue.slug}`} className="group overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl">
      <div className="relative aspect-[4/3] overflow-hidden bg-neutral-100">
        <Cover src={venue.cover_url} alt={venue.name} />
        <span className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold">{categoryEmoji(venue.category as any)} {categoryLabel(venue.category as any)}</span>
      </div>
      <div className="space-y-1 p-4">
        <h3 className="font-display text-base font-bold text-dark">{venue.name}</h3>
        <p className="text-sm text-neutral-600">{[venue.district, venue.city].filter(Boolean).join(', ')}</p>
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-amber-600">{(venue.rating_count ?? 0) > 0 ? `★ ${Number(venue.rating_avg).toFixed(1)} (${venue.rating_count})` : 'Nouveau'}</span>
          {venue.avg_price_xof ? <span className="text-neutral-700">~ {formatXOF(venue.avg_price_xof)}</span> : null}
        </div>
      </div>
    </Link>
  );
}

export function DestinationCardView({ destination }: { destination: Destination }) {
  return (
    <Link href={`/destinations/${destination.slug}`} className="group relative block aspect-[3/4] overflow-hidden rounded-2xl bg-neutral-200 shadow-sm">
      <Cover src={destination.cover_url} alt={destination.name} />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-4 text-white">
        <h3 className="font-display text-xl font-bold">{destination.name}</h3>
        {destination.tagline && <p className="text-sm text-white/80">{destination.tagline}</p>}
      </div>
    </Link>
  );
}
