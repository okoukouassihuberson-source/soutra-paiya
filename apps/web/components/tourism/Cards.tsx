import Link from 'next/link';
import { categoryEmoji, seatsLeft, activityCategoryEmoji, formatTripDates, type Destination, type TripHighlight } from '@soutra/shared';
import { getI18n } from '@/lib/i18n/server';
import type { TripCard, VenueCard } from '@/lib/tourism';
import type { ActivityCard } from '@/lib/activities';

function Cover({ src, alt }: { src: string | null; alt: string }) {
  return src
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={src} alt={alt} loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
    : <div aria-hidden className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary-100 to-secondary-100 text-4xl">🌴</div>;
}

export function TripCardView({ trip }: { trip: TripCard }) {
  const i = getI18n();
  const left = seatsLeft(trip);
  const title = i.field(trip, 'title') ?? trip.title;
  return (
    <Link href={i.lp(`/voyages/${trip.slug}`)} className="group overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl">
      <div className="relative aspect-[4/3] overflow-hidden bg-neutral-100">
        <Cover src={trip.cover_url} alt={title} />
        {trip.highlight && (
          <span className="absolute left-3 top-3 rounded-full bg-primary-500 px-3 py-1 text-xs font-bold text-white">{i.t(`highlight.${trip.highlight}` as 'highlight.a_la_une')}</span>
        )}
        <span className="absolute bottom-3 right-3 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white">{i.t('common.days', { n: trip.duration_days })}</span>
      </div>
      <div className="space-y-2 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{[trip.city, trip.scope === 'national' ? i.t('common.country') : trip.country].filter(Boolean).join(' · ')}</p>
        <h3 className="font-display text-lg font-bold leading-snug text-dark">{title}</h3>
        <p className="text-sm text-neutral-600">{formatTripDates(trip.starts_on, trip.ends_on, i.intl)}</p>
        <div className="flex items-end justify-between pt-1">
          <p className="text-lg font-bold text-primary-600"><span className="text-xs font-normal text-neutral-500">{i.t('common.from')} </span>{i.fmtXOF(trip.base_price_xof)}</p>
          <p className={`text-xs font-semibold ${left <= 5 ? 'text-danger' : 'text-neutral-500'}`}>
            {left === 0 ? i.t('cards.full') : i.tn('cards.seatsLeft', left)}
          </p>
        </div>
      </div>
    </Link>
  );
}

export function VenueCardView({ venue }: { venue: VenueCard }) {
  const i = getI18n();
  return (
    <Link href={`/v/${venue.slug}`} className="group overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl">
      <div className="relative aspect-[4/3] overflow-hidden bg-neutral-100">
        <Cover src={venue.cover_url} alt={venue.name} />
        <span className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold">{categoryEmoji(venue.category as any)} {i.tdyn('venueCat', venue.category, venue.category)}</span>
      </div>
      <div className="space-y-1 p-4">
        <h3 className="font-display text-base font-bold text-dark">{venue.name}</h3>
        <p className="text-sm text-neutral-600">{[venue.district, venue.city].filter(Boolean).join(', ')}</p>
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-amber-600">{(venue.rating_count ?? 0) > 0 ? `★ ${Number(venue.rating_avg).toFixed(1)} (${venue.rating_count})` : i.t('common.new')}</span>
          {venue.avg_price_xof ? <span className="text-neutral-700">~ {i.fmtXOF(venue.avg_price_xof)}</span> : null}
        </div>
      </div>
    </Link>
  );
}

export function DestinationCardView({ destination }: { destination: Destination }) {
  const i = getI18n();
  const name = i.field(destination, 'name') ?? destination.name;
  const tagline = i.field(destination, 'tagline');
  return (
    <Link href={i.lp(`/destinations/${destination.slug}`)} className="group relative block aspect-[3/4] overflow-hidden rounded-2xl bg-neutral-200 shadow-sm">
      <Cover src={destination.cover_url} alt={name} />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-4 text-white">
        <h3 className="font-display text-xl font-bold">{name}</h3>
        {tagline && <p className="text-sm text-white/80">{tagline}</p>}
      </div>
    </Link>
  );
}

export function ActivityCardView({ activity }: { activity: ActivityCard }) {
  const i = getI18n();
  const title = i.field(activity, 'title') ?? activity.title;
  return (
    <Link href={i.lp(`/activites/${activity.slug}`)} className="group overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl">
      <div className="relative aspect-[4/3] overflow-hidden bg-neutral-100">
        <Cover src={activity.cover_url} alt={title} />
        <span className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold">{activityCategoryEmoji(activity.category)} {i.tdyn('actCat', activity.category, activity.category)}</span>
        {activity.highlight && <span className="absolute right-3 top-3 rounded-full bg-primary-500 px-3 py-1 text-xs font-bold text-white">{i.tdyn('highlight', activity.highlight as TripHighlight, '')}</span>}
        <span className="absolute bottom-3 right-3 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white">{i.fmtDuration(activity.duration_minutes)}</span>
      </div>
      <div className="space-y-1 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{activity.city ?? i.t('cards.countryFallback')}</p>
        <h3 className="font-display text-base font-bold leading-snug text-dark">{title}</h3>
        {activity.next_slot_at && <p className="text-xs text-neutral-600">{i.t('cards.nextDeparture', { date: new Date(activity.next_slot_at).toLocaleString(i.intl, { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Abidjan' }) })}</p>}
        <div className="flex items-end justify-between pt-1">
          <p className="text-lg font-bold text-primary-600"><span className="text-xs font-normal text-neutral-500">{i.t('common.from')} </span>{i.fmtXOF(activity.price_xof)}</p>
          <span className="text-sm font-semibold text-amber-600">{activity.rating_count > 0 ? `★ ${Number(activity.rating_avg).toFixed(1)} (${activity.rating_count})` : i.t('common.new')}</span>
        </div>
      </div>
    </Link>
  );
}
