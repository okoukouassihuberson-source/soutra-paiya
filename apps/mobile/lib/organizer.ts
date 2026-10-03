// ============================================================================
// Espace organisateur (mobile) — miroir des écrans web /organisateur.
// Tout passe par les RPC / politiques RLS existantes (aucune règle métier ici) :
//   • get_organizer_dashboard, get_organizer_trip_bookings, submit_trip_for_review
//   • get_organizer_activity_dashboard, get_organizer_activity_bookings, submit_activity_for_review
//   • scan_trip_ticket / scan_activity_ticket, get_my_commission
//   • écritures trips / trip_itineraries / trip_packages / activities / activity_slots (RLS organisateur)
// ============================================================================
import { decode } from 'base64-arraybuffer';
import { slugify } from '@soutra/shared';
import { supabase } from './supabase';
import { tr, type TKey } from '@/lib/i18n';
import { MAX_GENERATED_SLOTS, buildSlotRows, parseDays, parsePackages, parseTicket, splitList } from './organizer-core';

const db = supabase as any;

export const ORGANIZER_ROLES = ['organizer', 'venue_owner', 'guide', 'admin'];

export type TripStatus = 'draft' | 'published' | 'full' | 'closed' | 'cancelled';
export type ActivityStatus = 'draft' | 'published' | 'paused' | 'archived';

export interface OrgTripRow {
  id: string; slug: string; title: string; scope: 'national' | 'international'; status: TripStatus;
  starts_on: string; ends_on: string; seats_total: number; seats_booked: number; base_price_xof: number;
  submitted_at: string | null; bookings: number; paid_xof: number; due_xof: number;
}
export interface OrgTripDash { trips: OrgTripRow[]; totals: { bookings: number; seats_sold: number; paid_xof: number; due_xof: number } }

export interface OrgActivityRow {
  id: string; slug: string; title: string; category: string; status: ActivityStatus; price_xof: number; submitted_at: string | null;
  approved_at: string | null; rating_avg: number; rating_count: number; upcoming_slots: number; bookings: number; paid_xof: number;
}
export interface OrgActivityDash { activities: OrgActivityRow[]; totals: { bookings: number; participants: number; paid_xof: number } }

export interface OrgBooking {
  id: string; reference: string; traveler_name: string | null; contact_phone: string | null; participants: number;
  total_xof: number; paid_xof: number; status: string; starts_at?: string;
}
export interface MyCommission { trip_pct: number; activity_pct: number; collected_xof: number; commission_xof: number }

export async function getMyRole(userId: string): Promise<string | null> {
  const { data } = await db.from('profiles').select('role').eq('id', userId).maybeSingle();
  return data?.role ?? null;
}

export async function getTripDashboard(): Promise<OrgTripDash | null> {
  const { data, error } = await db.rpc('get_organizer_dashboard');
  if (error) throw new Error(error.message);
  return (data as OrgTripDash) ?? null;
}
export async function getActivityDashboard(): Promise<OrgActivityDash | null> {
  const { data, error } = await db.rpc('get_organizer_activity_dashboard');
  if (error) throw new Error(error.message);
  return (data as OrgActivityDash) ?? null;
}
export async function getMyCommission(): Promise<MyCommission | null> {
  const { data } = await db.rpc('get_my_commission');
  return (data as MyCommission) ?? null;
}
export async function getTripBookings(tripId: string): Promise<OrgBooking[]> {
  const { data, error } = await db.rpc('get_organizer_trip_bookings', { p_trip_id: tripId });
  if (error) throw new Error(error.message);
  return (data as OrgBooking[]) ?? [];
}
export async function getActivityBookings(activityId: string): Promise<OrgBooking[]> {
  const { data, error } = await db.rpc('get_organizer_activity_bookings', { p_activity_id: activityId });
  if (error) throw new Error(error.message);
  return (data as OrgBooking[]) ?? [];
}

export async function submitTrip(id: string) {
  const { error } = await db.rpc('submit_trip_for_review', { p_trip_id: id });
  if (error) throw new Error(error.message);
}
export async function closeTripSales(id: string) {
  const { error } = await db.from('trips').update({ status: 'closed' }).eq('id', id);
  if (error) throw new Error(error.message);
}
export async function submitActivity(id: string) {
  const { error } = await db.rpc('submit_activity_for_review', { p_activity_id: id });
  if (error) throw new Error(error.message);
}
export async function setActivityStatus(id: string, status: 'paused' | 'published') {
  const { error } = await db.from('activities').update({ status }).eq('id', id);
  if (error) throw new Error(error.message);
}

// ── Voyages : brouillon (création / modification) ───────────────────────────
export interface TripFormValues {
  scope: 'national' | 'international'; is_circuit: boolean; title: string; summary: string; city: string; cover_url: string;
  country: string; country_code: string; continent: string; starts_on: string; ends_on: string;
  base_price_xof: string; seats_total: string; deposit_pct: string; departure_point: string; departure_time: string; return_time: string;
  transport: string; lodging: string; meals: string; flight_info: string; hotel_info: string; visa_info: string; insurance_info: string;
  description: string; activities: string; inclusions: string; exclusions: string; conditions: string; days: string; packages: string;
  contact_phone: string; contact_whatsapp: string;
}
export const EMPTY_TRIP: TripFormValues = {
  scope: 'national', is_circuit: false, title: '', summary: '', city: '', cover_url: '', country: '', country_code: '', continent: '',
  starts_on: '', ends_on: '', base_price_xof: '', seats_total: '', deposit_pct: '100', departure_point: '', departure_time: '', return_time: '',
  transport: '', lodging: '', meals: '', flight_info: '', hotel_info: '', visa_info: '', insurance_info: '',
  description: '', activities: '', inclusions: '', exclusions: '', conditions: '', days: '', packages: '', contact_phone: '', contact_whatsapp: '',
};

const lines = splitList;
const hhmm = (x?: string | null) => (x ? String(x).slice(0, 5) : '');

export async function loadTripForm(tripId: string): Promise<{ values: TripFormValues; existingPackages: { id: string; name: string }[]; i18n: any } | null> {
  const [{ data: trip }, { data: days }, { data: pkgs }] = await Promise.all([
    db.from('trips').select('*').eq('id', tripId).maybeSingle(),
    db.from('trip_itineraries').select('day_number, title, stops').eq('trip_id', tripId).order('day_number'),
    db.from('trip_packages').select('id, name, price_xof, includes, is_active').eq('trip_id', tripId).order('position'),
  ]);
  if (!trip) return null;
  const s = (k: string) => (trip[k] ?? '') as string;
  const active = (pkgs ?? []).filter((p: any) => p.is_active);
  return {
    i18n: trip.i18n ?? {},
    existingPackages: (pkgs ?? []).map((p: any) => ({ id: p.id, name: p.name })),
    values: {
      scope: trip.scope, is_circuit: !!trip.is_circuit, title: s('title'), summary: s('summary'), city: s('city'), cover_url: s('cover_url'),
      country: s('country'), country_code: s('country_code'), continent: s('continent'), starts_on: s('starts_on'), ends_on: s('ends_on'),
      base_price_xof: String(trip.base_price_xof ?? ''), seats_total: String(trip.seats_total ?? ''), deposit_pct: String(trip.deposit_pct ?? 100),
      departure_point: s('departure_point'), departure_time: hhmm(trip.departure_time), return_time: hhmm(trip.return_time),
      transport: s('transport'), lodging: s('lodging'), meals: s('meals'), flight_info: s('flight_info'), hotel_info: s('hotel_info'),
      visa_info: s('visa_info'), insurance_info: s('insurance_info'), description: s('description'),
      activities: (trip.activities ?? []).join('\n'), inclusions: (trip.inclusions ?? []).join('\n'), exclusions: (trip.exclusions ?? []).join('\n'),
      conditions: s('conditions'),
      days: (days ?? []).map((d: any) => `${d.title}${d.stops?.length ? ` : ${d.stops.join(', ')}` : ''}`).join('\n'),
      packages: active.map((p: any) => `${p.name} | ${p.price_xof} | ${(p.includes ?? []).join(', ')}`).join('\n'),
      contact_phone: s('contact_phone'), contact_whatsapp: s('contact_whatsapp'),
    },
  };
}

/** Crée (sans tripId) ou met à jour un brouillon de voyage ; renvoie l'id. Lève une Error dont le message contient le code serveur. */
export async function saveTrip(
  userId: string, v: TripFormValues, tripId?: string, existingPackages: { id: string; name: string }[] = [], i18n: any = {},
): Promise<string> {
  const national = v.scope === 'national';
  const fields = {
    scope: v.scope, title: v.title.trim(), summary: v.summary.trim() || null, description: v.description.trim() || null,
    country: national ? "Côte d'Ivoire" : v.country.trim(), country_code: national ? 'CI' : v.country_code.trim().toUpperCase(),
    continent: national ? null : v.continent || null, city: v.city.trim() || null, cover_url: v.cover_url || null,
    starts_on: v.starts_on, ends_on: v.ends_on, base_price_xof: Number(v.base_price_xof), deposit_pct: Number(v.deposit_pct || 100),
    seats_total: Number(v.seats_total), departure_point: v.departure_point.trim() || null,
    departure_time: v.departure_time || null, return_time: v.return_time || null,
    transport: v.transport.trim() || null, lodging: v.lodging.trim() || null, meals: v.meals.trim() || null,
    flight_info: v.flight_info.trim() || null, hotel_info: v.hotel_info.trim() || null, visa_info: v.visa_info.trim() || null, insurance_info: v.insurance_info.trim() || null,
    activities: lines(v.activities), inclusions: lines(v.inclusions), exclusions: lines(v.exclusions),
    conditions: v.conditions.trim() || null, contact_phone: v.contact_phone.trim() || null, contact_whatsapp: v.contact_whatsapp.trim() || null,
    is_circuit: v.is_circuit, i18n,
  };
  let id = tripId;
  if (tripId) {
    const { error } = await db.from('trips').update(fields).eq('id', tripId);
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await db.from('trips').insert({
      ...fields, organizer_id: userId, status: 'draft',
      slug: `${slugify(v.title).slice(0, 60)}-${Math.random().toString(36).slice(2, 6)}`,
    }).select('id').single();
    if (error || !data) throw new Error(error?.message ?? 'INSERT_FAILED');
    id = data.id;
  }
  const days = parseDays(v.days, id);
  const packages = parsePackages(v.packages, id);
  const errors: string[] = [];
  if (tripId) {
    const r = await db.from('trip_itineraries').delete().eq('trip_id', id);
    if (r.error) errors.push(r.error.message);
    const names = new Set(packages.map((p) => p.name));
    const gone = existingPackages.filter((p) => !names.has(p.name)).map((p) => p.id);
    if (gone.length) { const r2 = await db.from('trip_packages').update({ is_active: false }).in('id', gone); if (r2.error) errors.push(r2.error.message); }
  }
  if (days.length) { const r = await db.from('trip_itineraries').insert(days); if (r.error) errors.push(r.error.message); }
  if (packages.length) { const r = await db.from('trip_packages').upsert(packages, { onConflict: 'trip_id,name' }); if (r.error) errors.push(r.error.message); }
  if (errors.length) throw new Error(`PARTIAL:${errors[0]}`);
  return id as string;
}

// ── Activités ───────────────────────────────────────────────────────────────
export interface ActivityFormValues {
  title: string; summary: string; category: string; city: string; address: string; latitude: string; longitude: string;
  price_xof: string; duration_minutes: string; min_age: string; min_participants: string; max_group_size: string;
  languages: string; cover_url: string; gallery: string[]; description: string; includes: string; excludes: string; conditions: string;
  contact_phone: string; contact_whatsapp: string;
}
export const EMPTY_ACTIVITY: ActivityFormValues = {
  title: '', summary: '', category: 'excursion', city: '', address: '', latitude: '', longitude: '', price_xof: '', duration_minutes: '120',
  min_age: '0', min_participants: '1', max_group_size: '20', languages: '', cover_url: '', gallery: [], description: '', includes: '', excludes: '',
  conditions: '', contact_phone: '', contact_whatsapp: '',
};

export async function loadActivityForm(id: string): Promise<{ values: ActivityFormValues; i18n: any } | null> {
  const { data: a } = await db.from('activities').select('*').eq('id', id).maybeSingle();
  if (!a) return null;
  const s = (k: string) => (a[k] ?? '') as string;
  const n = (k: string) => (a[k] == null ? '' : String(a[k]));
  return {
    i18n: a.i18n ?? {},
    values: {
      title: s('title'), summary: s('summary'), category: a.category ?? 'excursion', city: s('city'), address: s('address'),
      latitude: n('latitude'), longitude: n('longitude'), price_xof: n('price_xof'), duration_minutes: n('duration_minutes'),
      min_age: n('min_age') || '0', min_participants: n('min_participants') || '1', max_group_size: n('max_group_size') || '20',
      languages: (a.languages ?? []).join(', '), cover_url: s('cover_url'), gallery: a.gallery_urls ?? [], description: s('description'),
      includes: (a.includes ?? []).join('\n'), excludes: (a.excludes ?? []).join('\n'), conditions: s('conditions'),
      contact_phone: s('contact_phone'), contact_whatsapp: s('contact_whatsapp'),
    },
  };
}

export async function saveActivity(userId: string, v: ActivityFormValues, activityId?: string, i18n: any = {}): Promise<string> {
  const num = (x: string) => (x.trim() === '' ? null : Number(x));
  const fields = {
    title: v.title.trim(), summary: v.summary.trim() || null, description: v.description.trim() || null, category: v.category,
    city: v.city.trim() || null, address: v.address.trim() || null, latitude: num(v.latitude), longitude: num(v.longitude),
    cover_url: v.cover_url || null, gallery_urls: v.gallery,
    price_xof: Number(v.price_xof), duration_minutes: Number(v.duration_minutes), min_age: Number(v.min_age || 0),
    min_participants: Number(v.min_participants || 1), max_group_size: Number(v.max_group_size || 20),
    languages: lines(v.languages), includes: lines(v.includes), excludes: lines(v.excludes), conditions: v.conditions.trim() || null,
    contact_phone: v.contact_phone.trim() || null, contact_whatsapp: v.contact_whatsapp.trim() || null, i18n,
  };
  if (activityId) {
    const { error } = await db.from('activities').update(fields).eq('id', activityId);
    if (error) throw new Error(error.message);
    return activityId;
  }
  const { data, error } = await db.from('activities').insert({
    ...fields, organizer_id: userId, status: 'draft',
    slug: `${slugify(v.title).slice(0, 60)}-${Math.random().toString(36).slice(2, 6)}`,
  }).select('id').single();
  if (error || !data) throw new Error(error?.message ?? 'INSERT_FAILED');
  return data.id as string;
}

// ── Créneaux ────────────────────────────────────────────────────────────────
export interface OrgSlot { id: string; starts_at: string; capacity: number; booked: number; price_xof: number | null; status: 'open' | 'closed' }

export async function listSlots(activityId: string): Promise<OrgSlot[]> {
  const { data, error } = await db.from('activity_slots').select('id, starts_at, capacity, booked, price_xof, status')
    .eq('activity_id', activityId).gt('starts_at', new Date().toISOString()).order('starts_at').limit(300);
  if (error) throw new Error(error.message);
  return (data ?? []) as OrgSlot[];
}
export { MAX_GENERATED_SLOTS };
/** Génère les créneaux (heures saisies en heure d'Abidjan = UTC). Renvoie le nombre de créneaux envoyés. */
export async function generateSlots(activityId: string, p: Parameters<typeof buildSlotRows>[1]): Promise<number> {
  const future = buildSlotRows(activityId, p);
  if (future.length === 0) throw new Error('NO_FUTURE_SLOT');
  if (future.length > MAX_GENERATED_SLOTS) throw new Error(`TOO_MANY:${future.length}`);
  const { error } = await db.from('activity_slots').upsert(future, { onConflict: 'activity_id,starts_at', ignoreDuplicates: true });
  if (error) throw new Error(error.message);
  return future.length;
}
export async function toggleSlot(s: OrgSlot) {
  const { error } = await db.from('activity_slots').update({ status: s.status === 'open' ? 'closed' : 'open' }).eq('id', s.id);
  if (error) throw new Error(error.message);
}
export async function deleteSlot(s: OrgSlot) {
  if (s.booked > 0) throw new Error('SLOT_HAS_BOOKINGS');
  const { error } = await db.from('activity_slots').delete().eq('id', s.id);
  if (error) throw new Error(error.message);
}

// ── Médias (bucket tourism-media, dossier = id de l'utilisateur) ────────────
export async function uploadTourismImage(userId: string, base64: string): Promise<string> {
  if (base64.length > 7_000_000) throw new Error('IMAGE_TOO_BIG'); // ≈ 5 Mo
  const path = `${userId}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await supabase.storage.from('tourism-media').upload(path, decode(base64), { contentType: 'image/jpeg', cacheControl: '31536000' });
  if (error) throw new Error(error.message || 'UPLOAD_FAILED');
  return supabase.storage.from('tourism-media').getPublicUrl(path).data.publicUrl;
}

// ── Validation de billets ───────────────────────────────────────────────────
export interface ScanResult { ok: boolean; error?: string; reference?: string; traveler?: string; participants?: number; trip?: string; activity?: string; starts_at?: string; balance_due_xof?: number }
/** Valide un billet (contenu du QR ou jeton saisi). Lève 'INVALID_QR' / 'NOT_AUTHORIZED' / 'SCAN_FAILED'. */
export async function validateTicket(raw: string): Promise<ScanResult> {
  const parsed = parseTicket(raw);
  if (!parsed) throw new Error('INVALID_QR');
  const { token, kind } = parsed;
  const isAct = kind === 'activity';
  const call = (fn: string) => db.rpc(fn, { p_qr_token: token });
  let { data, error } = await call(isAct ? 'scan_activity_ticket' : 'scan_trip_ticket');
  if (!error && data?.error === 'UNKNOWN_TICKET' && kind === 'unknown') ({ data, error } = await call('scan_activity_ticket'));
  if (error) throw new Error(error.message?.includes('NOT_AUTHORIZED') ? 'NOT_AUTHORIZED' : 'SCAN_FAILED');
  return data as ScanResult;
}

// ── Messages d'erreur localisés ─────────────────────────────────────────────
const KNOWN_ERRORS = ['COVER_REQUIRED', 'CONTACT_REQUIRED', 'TRIP_ALREADY_STARTED', 'TRIP_HAS_PAYMENTS', 'TRIP_LOCKED', 'SLOT_REQUIRED', 'ACTIVITY_LOCKED'] as const;
export function orgError(msg?: string): string {
  if (!msg) return tr('org.actionFail');
  const code = KNOWN_ERRORS.find((k) => msg.includes(k));
  if (code) return tr(`org.err.${code}` as TKey);
  if (msg.includes('row-level security')) return tr('org.err.RLS');
  if (msg.startsWith('PARTIAL:')) return tr('org.err.PARTIAL', { detail: msg.slice(8) });
  return tr('org.actionFail');
}
