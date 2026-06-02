// ============================================================================
// Pro Revenue (migration 0043) — wrappers RPC accessibles aux venue owners.
//
// Sécurité côté serveur : toutes les RPCs vérifient auth.uid() = venues.owner_id
// (ou admin). Un user qui n'est pas owner reçoit l'erreur 'NOT_OWNER'.
// ============================================================================
import { supabase } from './supabase';

export interface ProSummary {
  gross_xof: number;
  commission_xof: number;
  net_xof: number;
  billable_xof: number;
  event_count: number;
  reservation_events: number;
  ticket_events: number;
  payment_events: number;
  previous_commission_xof: number;
  delta_pct: number | null;
  commission_rate_pct: number;
}

export interface ProByKind {
  kind: string;
  total_xof: number;
  event_count: number;
}

export interface ProTimelineRow {
  day: string;
  gross_xof: number;
  commission_xof: number;
  net_xof: number;
  event_count: number;
}

export interface ProEventRow {
  id: string;
  ts: string;
  kind: string;
  amount_xof: number;
  reservation_id: string | null;
  ticket_id: string | null;
  transaction_id: string | null;
  rule_name: string | null;
  metadata: Record<string, unknown>;
}

export interface ProVenue {
  id: string;
  name: string;
  category: string;
  city: string | null;
  district: string | null;
  cover_url: string | null;
  status: string;
}

export const PRO_KIND_META: Record<string, { label: string; emoji: string; color: string }> = {
  reservation_commission_pct:   { label: 'Commission réservation',  emoji: '🍽️', color: '#3B82F6' },
  reservation_commission_fixed: { label: 'Commission résa (fixe)',  emoji: '🍽️', color: '#3B82F6' },
  service_fee_pct:              { label: 'Frais de service',        emoji: '💼', color: '#A855F7' },
  service_fee_fixed:            { label: 'Frais de service (fixe)', emoji: '💼', color: '#A855F7' },
  payment_commission:           { label: 'Commission paiement',     emoji: '💳', color: '#10B981' },
  subscription_commission:      { label: 'Commission abonnement',   emoji: '📅', color: '#F59E0B' },
  ticket_commission:            { label: 'Commission billetterie',  emoji: '🎟️', color: '#EC4899' },
  marketplace_commission:       { label: 'Commission marketplace',  emoji: '🛍️', color: '#F43F5E' },
  affiliation_commission:       { label: 'Commission affiliation',  emoji: '🤝', color: '#06B6D4' },
  user_cashback:                { label: 'Cashback utilisateur',    emoji: '🎁', color: '#22C55E' },
  loyalty_bonus:                { label: 'Bonus fidélité',          emoji: '⭐', color: '#EAB308' },
  featured_listing:             { label: 'Mise en avant',           emoji: '⬆️', color: '#6366F1' },
  advertising:                  { label: 'Publicité',               emoji: '📣', color: '#6366F1' },
  account_verification:         { label: 'Vérification compte',     emoji: '✅', color: '#14B8A6' },
  venue_certification:          { label: 'Certification venue',     emoji: '🏅', color: '#14B8A6' },
  event_publication:            { label: 'Publication événement',   emoji: '📅', color: '#DB2777' },
  promo_publication:            { label: 'Publication promo',       emoji: '🏷️', color: '#DB2777' },
};

function isoFromNowMinusDays(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString();
}

/**
 * Liste les venues dont l'utilisateur courant est owner_id.
 */
export async function listMyProVenues(): Promise<ProVenue[]> {
  const { data, error } = await (supabase.rpc as any)('list_my_pro_venues');
  if (error) throw new Error(error.message ?? 'PRO_VENUES_FAILED');
  return (data ?? []) as ProVenue[];
}

/**
 * KPIs revenus pour un venue donné.
 *
 * @throws Error('NOT_OWNER' | 'NOT_AUTHENTICATED' | 'VENUE_NOT_FOUND')
 */
export async function getProRevenueSummary(venueId: string, days: number = 30): Promise<ProSummary> {
  const { data, error } = await (supabase.rpc as any)('get_pro_revenue_summary', {
    p_venue_id: venueId,
    p_from: isoFromNowMinusDays(days),
    p_to: new Date().toISOString(),
  });
  if (error) {
    const raw = error.message ?? '';
    if (raw.includes('NOT_OWNER')) throw new Error('NOT_OWNER');
    if (raw.includes('NOT_AUTHENTICATED')) throw new Error('NOT_AUTHENTICATED');
    if (raw.includes('VENUE_NOT_FOUND')) throw new Error('VENUE_NOT_FOUND');
    throw new Error(raw || 'SUMMARY_FAILED');
  }
  return data as ProSummary;
}

/**
 * Ventilation des revenus par kind monétaire.
 */
export async function getProRevenueByKind(venueId: string, days: number = 30): Promise<ProByKind[]> {
  const { data, error } = await (supabase.rpc as any)('get_pro_revenue_by_kind', {
    p_venue_id: venueId,
    p_from: isoFromNowMinusDays(days),
    p_to: new Date().toISOString(),
  });
  if (error) throw new Error(error.message ?? 'BY_KIND_FAILED');
  return (data ?? []) as ProByKind[];
}

/**
 * Timeline jour par jour des revenus (gross / commission / net).
 */
export async function getProRevenueTimeline(venueId: string, days: number = 30): Promise<ProTimelineRow[]> {
  const { data, error } = await (supabase.rpc as any)('get_pro_revenue_timeline', {
    p_venue_id: venueId,
    p_days: days,
  });
  if (error) throw new Error(error.message ?? 'TIMELINE_FAILED');
  return (data ?? []) as ProTimelineRow[];
}

/**
 * Détail des derniers events de commission pour ce venue.
 */
export async function listProRevenueEvents(venueId: string, limit: number = 50): Promise<ProEventRow[]> {
  const { data, error } = await (supabase.rpc as any)('list_pro_revenue_events', {
    p_venue_id: venueId,
    p_limit: limit,
  });
  if (error) throw new Error(error.message ?? 'EVENTS_FAILED');
  return (data ?? []) as ProEventRow[];
}
