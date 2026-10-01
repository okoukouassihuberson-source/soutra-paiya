import { supabaseServer } from './supabase-server';
import type { Destination, Trip, TripItineraryDay, TripPackage, TripScope } from '@soutra/shared';

// Les types DB générés (database.ts) ne connaissent pas encore les tables 0082
// → on passe par `any` comme le fait déjà app/v/[slug]/page.tsx, et on type
// les retours avec les interfaces de @soutra/shared.
const db = () => supabaseServer() as any;

const TRIP_CARD_COLS =
  'id, slug, scope, title, summary, country, country_code, continent, city, cover_url, starts_on, ends_on, duration_days, base_price_xof, seats_total, seats_booked, highlight, is_circuit, status, transport, lodging, meals';

export type TripCard = Pick<Trip,
  'id' | 'slug' | 'scope' | 'title' | 'summary' | 'country' | 'country_code' | 'continent' | 'city' | 'cover_url' |
  'starts_on' | 'ends_on' | 'duration_days' | 'base_price_xof' | 'seats_total' | 'seats_booked' | 'highlight' |
  'is_circuit' | 'status' | 'transport' | 'lodging' | 'meals'>;

export async function listTrips(opts: {
  scope: TripScope; continent?: string; q?: string; limit?: number; offset?: number;
}): Promise<TripCard[]> {
  let q = db().from('trips').select(TRIP_CARD_COLS)
    .eq('scope', opts.scope)
    .in('status', ['published', 'full'])
    .gte('starts_on', new Date().toISOString().slice(0, 10))
    .order('starts_on', { ascending: true })
    .range(opts.offset ?? 0, (opts.offset ?? 0) + (opts.limit ?? 24) - 1);
  if (opts.continent) q = q.eq('continent', opts.continent);
  if (opts.q) q = q.ilike('title', `%${opts.q.replace(/[%,()]/g, ' ')}%`);
  const { data, error } = await q;
  if (error) console.error('[tourism] listTrips', error);
  return (data ?? []) as TripCard[];
}

export async function getTrip(slug: string) {
  const sb = db();
  const { data: trip } = await sb.from('trips').select('*').eq('slug', slug)
    .in('status', ['published', 'full']).maybeSingle();
  if (!trip) return null;
  const [{ data: days }, { data: packages }, { data: dest }] = await Promise.all([
    sb.from('trip_itineraries').select('*').eq('trip_id', trip.id).order('day_number'),
    sb.from('trip_packages').select('*').eq('trip_id', trip.id).eq('is_active', true).order('position'),
    trip.destination_id
      ? sb.from('destinations').select('slug, name').eq('id', trip.destination_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return {
    trip: trip as Trip,
    days: (days ?? []) as TripItineraryDay[],
    packages: (packages ?? []) as TripPackage[],
    destination: dest as { slug: string; name: string } | null,
  };
}

export async function listDestinations(opts: { featured?: boolean; limit?: number } = {}): Promise<Destination[]> {
  let q = db().from('destinations').select('*').eq('is_published', true)
    .order('position', { ascending: true, nullsFirst: false }).order('name').limit(opts.limit ?? 60);
  if (opts.featured) q = q.eq('is_featured', true);
  const { data, error } = await q;
  if (error) console.error('[tourism] listDestinations', error);
  return (data ?? []) as Destination[];
}

export interface VenueCard {
  id: string; slug: string; name: string; category: string; city: string | null;
  district: string | null; cover_url: string | null; avg_price_xof: number | null;
  rating_avg: number | null; rating_count: number | null;
}
const VENUE_CARD_COLS = 'id, slug, name, category, city, district, cover_url, avg_price_xof, rating_avg, rating_count';

export async function searchVenues(opts: {
  q?: string; city?: string; categories?: string[]; limit?: number; offset?: number;
}): Promise<VenueCard[]> {
  let q = db().from('venues').select(VENUE_CARD_COLS).eq('status', 'active')
    .order('rating_avg', { ascending: false, nullsFirst: false })
    .range(opts.offset ?? 0, (opts.offset ?? 0) + (opts.limit ?? 24) - 1);
  if (opts.categories?.length) q = q.in('category', opts.categories);
  if (opts.city) q = q.ilike('city', opts.city.replace(/[%,()]/g, ' '));
  if (opts.q) {
    const t = opts.q.replace(/[%,()]/g, ' ').trim();
    if (t) q = q.or(`name.ilike.%${t}%,district.ilike.%${t}%,description.ilike.%${t}%`);
  }
  const { data, error } = await q;
  if (error) console.error('[tourism] searchVenues', error);
  return (data ?? []) as VenueCard[];
}

export async function getDestination(slug: string) {
  const sb = db();
  const { data: dest } = await sb.from('destinations').select('*').eq('slug', slug).eq('is_published', true).maybeSingle();
  if (!dest) return null;
  const city = (dest.venue_city ?? dest.name) as string;
  const today = new Date().toISOString().slice(0, 10);
  const [venues, trips, events] = await Promise.all([
    searchVenues({ city, limit: 60 }),
    sb.from('trips').select(TRIP_CARD_COLS).eq('destination_id', dest.id)
      .in('status', ['published', 'full']).gte('starts_on', today).order('starts_on').limit(12),
    sb.from('events').select('id, title, slug, cover_url, starts_on:starts_at, city')
      .eq('status', 'published').ilike('city', city).gte('ends_at', new Date().toISOString())
      .order('starts_at').limit(6),
  ]);
  return {
    destination: dest as Destination,
    venues,
    trips: (trips.data ?? []) as TripCard[],
    events: (events.data ?? []) as { id: string; title: string; slug: string; cover_url: string | null; starts_on: string; city: string }[],
  };
}
