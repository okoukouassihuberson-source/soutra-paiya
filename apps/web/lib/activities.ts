import { supabaseServer } from './supabase-server';
import type { Activity, ActivitySlot } from '@soutra/shared';

const db = () => supabaseServer() as any;

export interface ActivityCard {
  id: string; slug: string; title: string; summary: string | null; category: string; city: string | null;
  cover_url: string | null; price_xof: number; duration_minutes: number; min_age: number; highlight: string | null;
  rating_avg: number; rating_count: number; latitude: number | null; longitude: number | null;
  next_slot_at: string | null; seats_left: number | null; total_count: number;
  i18n?: Record<string, Record<string, string>> | null;
}

export interface ListActivitiesParams {
  q?: string; category?: string; city?: string; minPrice?: number; maxPrice?: number; date?: string;
  maxAge?: number; destinationId?: string; sort?: string; limit?: number; offset?: number;
}

export async function listActivities(p: ListActivitiesParams = {}): Promise<{ items: ActivityCard[]; total: number; error?: string }> {
  const { data, error } = await db().rpc('list_activities', {
    p_q: p.q || null, p_category: p.category || null, p_city: p.city || null,
    p_min_price: p.minPrice ?? null, p_max_price: p.maxPrice ?? null, p_date: p.date || null,
    p_max_age: p.maxAge ?? null, p_destination: p.destinationId ?? null,
    p_sort: p.sort || 'popular', p_limit: p.limit ?? 24, p_offset: p.offset ?? 0,
  });
  if (error) { console.error('[activities] list', error); return { items: [], total: 0, error: error.message }; }
  const items = (data ?? []) as ActivityCard[];
  return { items, total: items[0] ? Number(items[0].total_count) : 0 };
}

export interface ReviewRow { id: string; rating: number; comment: string | null; created_at: string; author: string }

export async function getActivity(slug: string) {
  const sb = db();
  const { data: activity } = await sb.from('activities').select('*').eq('slug', slug).eq('status', 'published').maybeSingle();
  if (!activity) return null;
  const nowPlus = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const [{ data: slots }, { data: reviews }, { data: dest }] = await Promise.all([
    sb.from('activity_slots').select('*').eq('activity_id', activity.id).eq('status', 'open')
      .gt('starts_at', nowPlus).order('starts_at').limit(60),
    sb.from('activity_reviews').select('id, rating, comment, created_at, profiles(full_name)')
      .eq('activity_id', activity.id).eq('status', 'published').order('created_at', { ascending: false }).limit(20),
    activity.destination_id
      ? sb.from('destinations').select('slug, name').eq('id', activity.destination_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return {
    activity: activity as Activity,
    slots: ((slots ?? []) as ActivitySlot[]).filter((s) => s.capacity > s.booked),
    reviews: ((reviews ?? []) as any[]).map((r): ReviewRow => ({
      id: r.id, rating: r.rating, comment: r.comment, created_at: r.created_at, author: shortName(r.profiles?.full_name),
    })),
    destination: dest as { slug: string; name: string } | null,
  };
}

/** « Awa Koné » → « Awa K. » (on n'expose jamais le nom complet d'un voyageur). */
function shortName(full?: string | null): string {
  const parts = (full ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

export interface ActivityBookingRow {
  id: string; reference: string; activity_id: string; slot_id: string; participants: number; total_xof: number;
  paid_xof: number; status: string; qr_token: string; used_at: string | null; created_at: string; expires_at: string | null;
  activities: { slug: string; title: string; category: string; city: string | null; cover_url: string | null; duration_minutes: number; address: string | null; i18n?: Record<string, Record<string, string>> | null } | null;
  activity_slots: { starts_at: string } | null;
}
const BOOKING_COLS = 'id, reference, activity_id, slot_id, participants, total_xof, paid_xof, status, qr_token, used_at, created_at, expires_at, activities(slug, title, category, city, cover_url, duration_minutes, address, i18n), activity_slots(starts_at)';

export async function listMyActivityBookings(userId: string): Promise<ActivityBookingRow[]> {
  const { data, error } = await db().from('activity_bookings').select(BOOKING_COLS).eq('user_id', userId)
    .order('created_at', { ascending: false }).limit(100);
  if (error) console.error('[activities] my bookings', error);
  return (data ?? []) as ActivityBookingRow[];
}

export async function getMyActivityBooking(userId: string, id: string) {
  const sb = db();
  const { data: booking } = await sb.from('activity_bookings').select(BOOKING_COLS).eq('id', id).eq('user_id', userId).maybeSingle();
  if (!booking) return null;
  const [{ data: payments }, { data: review }] = await Promise.all([
    sb.from('activity_payments').select('id, amount_xof, receipt_number, created_at').eq('booking_id', id).order('created_at'),
    sb.from('activity_reviews').select('id, rating, comment').eq('booking_id', id).maybeSingle(),
  ]);
  return {
    booking: booking as ActivityBookingRow,
    payments: (payments ?? []) as { id: string; amount_xof: number; receipt_number: string; created_at: string }[],
    review: review as { id: string; rating: number; comment: string | null } | null,
  };
}
