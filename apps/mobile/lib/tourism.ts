// ============================================================================
// SOUTRA PLAYCE V2 — accès aux données touristiques (voyages, activités, offres, réservations).
// Lecture : tables publiées (RLS) et RPC publiques. Écriture : uniquement via les RPC serveur, qui
// recalculent prix, remises et places (le mobile n'est jamais source de vérité sur un montant).
// ============================================================================
import type { Activity, ActivitySlot, Destination, Trip, TripItineraryDay, TripPackage, TripScope } from '@soutra/shared';
import { supabase } from './supabase';

const db = supabase as any;
const today = () => new Date().toISOString().slice(0, 10);

export const QR_TRIP_PREFIX = 'soutra:trip:';
export const QR_ACTIVITY_PREFIX = 'soutra:act:';

export type TripCard = Pick<Trip, 'id' | 'slug' | 'title' | 'scope' | 'city' | 'country' | 'cover_url' | 'starts_on' | 'ends_on' | 'duration_days' | 'base_price_xof' | 'seats_total' | 'seats_booked' | 'highlight'>;
const TRIP_CARD = 'id, slug, title, scope, city, country, cover_url, starts_on, ends_on, duration_days, base_price_xof, seats_total, seats_booked, highlight';

/** Terme sûr pour ilike / or() PostgREST : ni jokers ni séparateurs. */
const safeTerm = (v: string) => v.replace(/[%_,()\\*"']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);

export interface TripFilters { q?: string; maxPrice?: number | null }
export async function listTrips(scope: TripScope, filters: TripFilters = {}, limit = 30): Promise<TripCard[]> {
  let q = db.from('trips').select(TRIP_CARD).eq('scope', scope)
    .in('status', ['published', 'full']).gte('starts_on', today()).order('starts_on').limit(limit);
  const t = safeTerm(filters.q ?? '');
  if (t) q = q.or(`title.ilike.%${t}%,city.ilike.%${t}%,country.ilike.%${t}%`);
  if (filters.maxPrice && filters.maxPrice > 0) q = q.lte('base_price_xof', Math.round(filters.maxPrice));
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as TripCard[];
}

export async function getTrip(slug: string): Promise<{ trip: Trip; days: TripItineraryDay[]; packages: TripPackage[] } | null> {
  const { data: trip } = await db.from('trips').select('*').eq('slug', slug).in('status', ['published', 'full']).maybeSingle();
  if (!trip) return null;
  const [{ data: days }, { data: packages }] = await Promise.all([
    db.from('trip_itineraries').select('*').eq('trip_id', trip.id).order('day_number'),
    db.from('trip_packages').select('*').eq('trip_id', trip.id).eq('is_active', true).order('position'),
  ]);
  return { trip: trip as Trip, days: (days ?? []) as TripItineraryDay[], packages: (packages ?? []) as TripPackage[] };
}

export interface ActivityCard {
  id: string; slug: string; title: string; category: string; city: string | null; cover_url: string | null;
  price_xof: number; duration_minutes: number; rating_avg: number; rating_count: number; next_slot_at: string | null;
}

export interface ActivityFilters { q?: string; category?: string | null; maxPrice?: number | null }
export async function listActivities(filters: ActivityFilters = {}, limit = 30): Promise<ActivityCard[]> {
  const { data, error } = await db.rpc('list_activities', {
    p_q: safeTerm(filters.q ?? '') || null, p_category: filters.category || null, p_city: null, p_min_price: null,
    p_max_price: filters.maxPrice && filters.maxPrice > 0 ? Math.round(filters.maxPrice) : null, p_date: null,
    p_max_age: null, p_destination: null, p_sort: 'popular', p_limit: limit, p_offset: 0,
  });
  if (error) throw error;
  return (data ?? []) as ActivityCard[];
}

export interface ActivityReview { id: string; rating: number; comment: string | null; created_at: string; author: string | null }

export async function getActivity(slug: string): Promise<{ activity: Activity; slots: ActivitySlot[]; reviews: ActivityReview[] } | null> {
  const { data: activity } = await db.from('activities').select('*').eq('slug', slug).eq('status', 'published').maybeSingle();
  if (!activity) return null;
  const [{ data: slots }, { data: reviews }] = await Promise.all([
    db.from('activity_slots').select('*').eq('activity_id', activity.id).eq('status', 'open')
      .gt('starts_at', new Date(Date.now() + 3600_000).toISOString()).order('starts_at').limit(40),
    db.from('activity_reviews').select('id, rating, comment, created_at, profiles(full_name)')
      .eq('activity_id', activity.id).eq('status', 'published').order('created_at', { ascending: false }).limit(20),
  ]);
  return {
    activity: activity as Activity, slots: (slots ?? []) as ActivitySlot[],
    reviews: (reviews ?? []).map((r: any) => ({ id: r.id, rating: r.rating, comment: r.comment, created_at: r.created_at, author: r.profiles?.full_name ?? null })),
  };
}

export async function listDestinations(limit = 40): Promise<Destination[]> {
  const { data, error } = await db.from('destinations').select('*').eq('is_published', true).order('name').limit(limit);
  if (error) throw error;
  return (data ?? []) as Destination[];
}

// --- Offres ---------------------------------------------------------------
export interface Offer {
  id: string; kind: string; code: string | null; title: string; description: string | null;
  discount_type: 'percent' | 'fixed'; discount_value: number; max_discount_xof: number | null;
  min_participants: number; max_participants: number | null; min_days_before: number | null; max_days_before: number | null;
  valid_until: string | null; target_kind?: 'trip' | 'activity' | null; target_slug?: string | null; target_title?: string | null;
}
export const OFFER_KIND_LABEL: Record<string, string> = {
  discount: 'Promotion', flash: 'Vente flash', early_booking: 'Réservation anticipée', group: 'Offre groupe',
  birthday: 'Anniversaire', couple: 'Offre couple', family: 'Offre famille', corporate: 'Entreprise',
};
export async function listPublicOffers(limit = 40): Promise<Offer[]> {
  const { data, error } = await db.rpc('list_public_offers', { p_limit: limit });
  if (error) throw error;
  return (data ?? []) as Offer[];
}
export async function listOffersForTarget(kind: 'trip' | 'activity', target: string): Promise<Offer[]> {
  const { data } = await db.rpc('list_offers_for_target', { p_kind: kind, p_target: target });
  return (data ?? []) as Offer[];
}
export const offerValueLabel = (o: Pick<Offer, 'discount_type' | 'discount_value'>) =>
  o.discount_type === 'percent' ? `−${o.discount_value} %` : `−${new Intl.NumberFormat('fr-FR').format(o.discount_value)} FCFA`;

export const PROMO_ERRORS: Record<string, string> = {
  PROMO_NOT_FOUND: 'Ce code promo n’existe pas.', PROMO_NOT_APPLICABLE: 'Ce code ne s’applique pas à cette réservation.',
  PROMO_INACTIVE: 'Cette offre n’est plus active.', PROMO_NOT_STARTED: 'Cette offre n’a pas encore commencé.',
  PROMO_EXPIRED: 'Cette offre est terminée.', PROMO_PARTICIPANTS: 'Le nombre de participants ne correspond pas à l’offre.',
  PROMO_TOO_LATE: 'Trop tard pour cette offre.', PROMO_TOO_EARLY: 'Trop tôt pour cette offre : réservez plus près du départ.',
  PROMO_RATE_LIMITED: 'Trop d’essais de codes. Réessayez dans une heure.', PROMO_EXHAUSTED: 'Cette offre n’est plus disponible.', PROMO_ALREADY_USED: 'Vous avez déjà utilisé ce code.',
  NOT_AUTHENTICATED: 'Connectez-vous pour utiliser un code promo.',
};
export const promoError = (message?: string | null) => {
  const k = String(message ?? '').match(/PROMO_[A-Z_]+/)?.[0];
  return k ? PROMO_ERRORS[k] ?? 'Code promo invalide.' : null;
};

export interface PricePreview {
  gross_xof: number; discount_xof: number; total_xof: number;
  offer: { id: string; title: string; kind: string; code: string | null } | null; error: string | null;
}
/** Aperçu informatif ; le prix facturé est recalculé par create_*_booking. */
export async function previewPrice(kind: 'trip' | 'activity', target: string, participants: number, pkg: string | null, code: string): Promise<PricePreview | null> {
  const { data, error } = await db.rpc('preview_booking_price', {
    p_kind: kind, p_target: target, p_participants: participants, p_package: pkg, p_code: code.trim() || null,
  });
  return error ? null : (data as PricePreview);
}

// --- Réservations ---------------------------------------------------------
const BOOKING_ERRORS: Record<string, string> = {
  NOT_AUTHENTICATED: 'Connectez-vous pour réserver.', NOT_ENOUGH_SEATS: 'Il n’y a plus assez de places.',
  TRIP_NOT_AVAILABLE: 'Ce voyage n’est plus ouvert à la réservation.', TRIP_ALREADY_STARTED: 'Ce voyage a déjà commencé.',
  PACKAGE_NOT_FOUND: 'Formule indisponible.', INVALID_PARTICIPANTS: 'Nombre de participants invalide.',
  SLOT_CLOSED: 'Ce créneau n’est plus réservable.', GROUP_TOO_LARGE: 'Groupe trop grand pour une réservation.',
  ACTIVITY_NOT_AVAILABLE: 'Cette activité n’est plus disponible.',
};
export function bookingError(message?: string | null): string {
  const m = String(message ?? '');
  const promo = promoError(m);
  if (promo) return promo;
  const k = Object.keys(BOOKING_ERRORS).find((x) => m.includes(x));
  return k ? BOOKING_ERRORS[k] : 'Réservation impossible, réessayez.';
}

export interface BookingResult { id: string; reference: string; total_xof: number; discount_xof?: number }
export async function createTripBooking(p: { tripId: string; participants: number; packageId: string | null; phone: string; code: string }): Promise<BookingResult> {
  const { data, error } = await db.rpc('create_trip_booking', {
    p_trip_id: p.tripId, p_participants: p.participants, p_package_id: p.packageId, p_phone: p.phone || null, p_notes: null, p_promo_code: p.code.trim() || null,
  });
  if (error) throw new Error(bookingError(error.message));
  if (data?.error) throw new Error(bookingError(String(data.error)));   // échec de code promo renvoyé en { error }
  return data as BookingResult;
}
export async function createActivityBooking(p: { slotId: string; participants: number; phone: string; code: string }): Promise<BookingResult> {
  const { data, error } = await db.rpc('create_activity_booking', {
    p_slot_id: p.slotId, p_participants: p.participants, p_phone: p.phone || null, p_notes: null, p_promo_code: p.code.trim() || null,
  });
  if (error) throw new Error(bookingError(error.message));
  if (data?.error) throw new Error(bookingError(String(data.error)));   // échec de code promo renvoyé en { error }
  return data as BookingResult;
}

export interface MyBooking {
  kind: 'trip' | 'activity'; id: string; reference: string; title: string; slug: string | null; cover_url: string | null;
  when: string | null; participants: number; total_xof: number; discount_xof: number; paid_xof: number;
  status: string; qr_token: string | null; expires_at: string | null; deposit_pct: number; reviewed?: boolean;
}
export async function listMyBookings(userId: string): Promise<MyBooking[]> {
  const [t, a, r] = await Promise.all([
    db.from('trip_bookings')
      .select('id, reference, participants, total_xof, discount_xof, paid_xof, status, qr_token, expires_at, created_at, trips(slug, title, cover_url, starts_on, deposit_pct)')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(60),
    db.from('activity_bookings')
      .select('id, reference, participants, total_xof, discount_xof, paid_xof, status, qr_token, expires_at, created_at, activities(slug, title, cover_url), activity_slots(starts_at)')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(60),
    db.from('activity_reviews').select('booking_id').eq('user_id', userId).limit(200),
  ]);
  const reviewed = new Set<string>((r.data ?? []).map((x: any) => x.booking_id));
  const trips: MyBooking[] = (t.data ?? []).map((b: any) => ({
    kind: 'trip', id: b.id, reference: b.reference, title: b.trips?.title ?? 'Voyage', slug: b.trips?.slug ?? null, cover_url: b.trips?.cover_url ?? null,
    when: b.trips?.starts_on ?? null, participants: b.participants, total_xof: b.total_xof, discount_xof: b.discount_xof ?? 0, paid_xof: b.paid_xof,
    status: b.status, qr_token: b.qr_token, expires_at: b.expires_at, deposit_pct: b.trips?.deposit_pct ?? 100, created: b.created_at,
  }));
  const acts: MyBooking[] = (a.data ?? []).map((b: any) => ({
    kind: 'activity', id: b.id, reference: b.reference, title: b.activities?.title ?? 'Activité', slug: b.activities?.slug ?? null, cover_url: b.activities?.cover_url ?? null,
    when: b.activity_slots?.starts_at ?? null, participants: b.participants, total_xof: b.total_xof, discount_xof: b.discount_xof ?? 0, paid_xof: b.paid_xof,
    status: b.status, qr_token: b.qr_token, expires_at: b.expires_at, deposit_pct: 100, created: b.created_at, reviewed: reviewed.has(b.id),
  }));
  return [...trips, ...acts].sort((x: any, y: any) => String(y.created).localeCompare(String(x.created)));
}

export async function cancelBooking(kind: 'trip' | 'activity', id: string): Promise<void> {
  const { error } = await db.rpc(kind === 'trip' ? 'cancel_trip_booking' : 'cancel_activity_booking', { p_booking_id: id });
  if (error) throw new Error(String(error.message).includes('REFUND_REQUIRED')
    ? 'Réservation déjà payée : contactez le support pour un remboursement.' : 'Annulation impossible.');
}

export const BOOKING_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: 'À payer', color: '#f59e0b' }, paid: { label: 'Payée', color: '#059669' }, confirmed: { label: 'Confirmée', color: '#059669' },
  used: { label: 'Utilisée', color: '#6366f1' }, completed: { label: 'Terminée', color: '#6366f1' },
  cancelled: { label: 'Annulée', color: '#737373' }, expired: { label: 'Expirée', color: '#737373' }, refunded: { label: 'Remboursée', color: '#a855f7' },
};

export async function submitActivityReview(bookingId: string, rating: number, comment: string): Promise<void> {
  const { error } = await db.rpc('submit_activity_review', { p_booking_id: bookingId, p_rating: rating, p_comment: comment.trim() || null });
  if (error) {
    const m = String(error.message);
    throw new Error(m.includes('ALREADY_REVIEWED') ? 'Vous avez déjà donné votre avis.' : m.includes('NOT_ELIGIBLE') ? 'Vous pourrez donner votre avis après l’activité.' : 'Envoi impossible, réessayez.');
  }
}
