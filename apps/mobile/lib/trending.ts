// ============================================================================
// Module "Ça bouge maintenant" — wrappers RPC (migration 0037).
// ============================================================================
import { supabase } from './supabase';

// ----------------------------------------------------------------------------
// Trending venues
// ----------------------------------------------------------------------------

export interface TrendingVenue {
  id: string;
  name: string;
  slug: string;
  category: string;
  cover_url: string | null;
  district: string | null;
  city: string | null;
  avg_price_xof: number | null;
  rating_avg: number | null;
  rating_count: number | null;
  lat: number | null;
  lng: number | null;
  distance_km: number | null;
  is_open_now: boolean | null;
  popularity_score: number | null;
  trend_score: number;
  activity_24h: number;
  activity_30d: number;
  active_promo_count: number;
  happening_event_count: number;
}

export async function getTrendingVenues(opts?: {
  limit?: number;
  lat?: number;
  lng?: number;
  radiusKm?: number;
}): Promise<TrendingVenue[]> {
  const { data, error } = await (supabase.rpc as any)('get_trending_venues', {
    p_limit: opts?.limit ?? 20,
    p_lat: opts?.lat ?? null,
    p_lng: opts?.lng ?? null,
    p_radius_km: opts?.radiusKm ?? 50,
  });
  if (error) throw new Error(error.message ?? 'TRENDING_FAILED');
  return (data ?? []) as TrendingVenue[];
}

// ----------------------------------------------------------------------------
// Active promotions
// ----------------------------------------------------------------------------

/** Migration 0038 — type de promotion. */
export type PromoKind = 'discount' | 'happy_hour' | 'couple' | 'group' | 'weekend' | 'student';

export const PROMO_KIND_META: Record<PromoKind, { label: string; emoji: string; color: string }> = {
  discount:   { label: 'Réduction',   emoji: '🏷️', color: '#FF6B1A' },
  happy_hour: { label: 'Happy Hour',  emoji: '🍻', color: '#F59E0B' },
  couple:     { label: 'Couple',      emoji: '💑', color: '#EC4899' },
  group:      { label: 'Groupe',      emoji: '👥', color: '#3B82F6' },
  weekend:    { label: 'Week-end',    emoji: '🌅', color: '#A855F7' },
  student:    { label: 'Étudiant',    emoji: '🎓', color: '#10B981' },
};

export interface ActivePromotion {
  promo_id: string;
  code: string;
  discount_pct: number;
  valid_until: string | null;
  uses_count: number;
  max_uses: number | null;
  venue_id: string;
  venue_name: string;
  venue_slug: string;
  venue_category: string;
  venue_cover: string | null;
  venue_district: string | null;
  venue_city: string | null;
  venue_rating_avg: number | null;
  lat: number | null;
  lng: number | null;
  distance_km: number | null;
  is_open_now: boolean | null;
  /** Migration 0038. 'discount' par défaut pour les promos pré-migration. */
  kind?: PromoKind;
}

export async function getActivePromotions(opts?: {
  limit?: number;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  /** Migration 0038 : filtre par kind, null/'all' = tous. */
  kind?: PromoKind | 'all' | null;
}): Promise<ActivePromotion[]> {
  const { data, error } = await (supabase.rpc as any)('get_active_promotions', {
    p_limit: opts?.limit ?? 50,
    p_lat: opts?.lat ?? null,
    p_lng: opts?.lng ?? null,
    p_radius_km: opts?.radiusKm ?? 50,
    p_kind: opts?.kind && opts.kind !== 'all' ? opts.kind : null,
  });
  if (error) throw new Error(error.message ?? 'PROMOS_FAILED');
  return (data ?? []) as ActivePromotion[];
}

// ----------------------------------------------------------------------------
// Current events
// ----------------------------------------------------------------------------

export interface CurrentEvent {
  event_id: string;
  title: string;
  slug: string;
  description: string | null;
  cover_url: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  is_happening: boolean;
  is_upcoming: boolean;
  city: string | null;
  venue_id: string | null;
  venue_name: string | null;
  venue_slug: string | null;
  venue_category: string | null;
  venue_cover: string | null;
  venue_district: string | null;
}

export async function getCurrentEvents(opts?: {
  limit?: number;
  includeUpcomingHours?: number;
}): Promise<CurrentEvent[]> {
  const { data, error } = await (supabase.rpc as any)('get_current_events', {
    p_limit: opts?.limit ?? 50,
    p_include_upcoming_hours: opts?.includeUpcomingHours ?? 24,
  });
  if (error) throw new Error(error.message ?? 'EVENTS_FAILED');
  return (data ?? []) as CurrentEvent[];
}
