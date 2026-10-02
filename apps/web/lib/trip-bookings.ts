import { supabaseServer } from './supabase-server';

export interface TripBookingRow {
  id: string; reference: string; trip_id: string; participants: number;
  unit_price_xof: number; total_xof: number; paid_xof: number; status: string;
  qr_token: string; used_at: string | null; created_at: string; expires_at: string | null;
  trips: {
    slug: string; title: string; scope: string; city: string | null; country: string;
    starts_on: string; ends_on: string; departure_point: string | null;
    departure_time: string | null; deposit_pct: number; cover_url: string | null; i18n?: Record<string, Record<string, string>> | null;
  } | null;
}

export interface TripPaymentRow {
  id: string; kind: string; amount_xof: number; receipt_number: string; created_at: string;
}

const TRIP_COLS =
  'slug, title, scope, city, country, starts_on, ends_on, departure_point, departure_time, deposit_pct, cover_url, i18n';
const COLS = `id, reference, trip_id, participants, unit_price_xof, total_xof, paid_xof, status, qr_token, used_at, created_at, expires_at, trips(${TRIP_COLS})`;

// RLS : un voyageur ne lit que ses propres réservations (filtre explicite en plus).
export async function listMyTripBookings(userId: string): Promise<TripBookingRow[]> {
  const { data, error } = await (supabaseServer() as any)
    .from('trip_bookings').select(COLS).eq('user_id', userId)
    .order('created_at', { ascending: false }).limit(100);
  if (error) console.error('[trip-bookings] list', error);
  return (data ?? []) as TripBookingRow[];
}

export async function getMyTripBooking(userId: string, id: string) {
  const sb = supabaseServer() as any;
  const { data: booking } = await sb.from('trip_bookings').select(COLS).eq('id', id).eq('user_id', userId).maybeSingle();
  if (!booking) return null;
  const { data: payments } = await sb.from('trip_payments')
    .select('id, kind, amount_xof, receipt_number, created_at').eq('booking_id', id).order('created_at');
  return { booking: booking as TripBookingRow, payments: (payments ?? []) as TripPaymentRow[] };
}

export const QR_PREFIX = 'soutra:trip:';
