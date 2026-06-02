// ============================================================================
// Analytics venue — tracking événementiel fire-and-forget (migration 0035).
// ============================================================================
import { supabase } from './supabase';

export type VenueEventKind =
  | 'view'
  | 'click_call'
  | 'click_whatsapp'
  | 'click_directions'
  | 'click_website'
  | 'click_share'
  | 'reservation_start'
  | 'reservation_complete'
  | 'menu_view'
  | 'gallery_open';

/**
 * Enregistre un événement de visite/clic sur un venue.
 *
 * **Fire-and-forget** : l'appel ne `throw` jamais. Si la RPC échoue (réseau,
 * RLS, etc.), on log en console mais on ne casse pas le flux UX. Côté
 * serveur, les `kind` invalides ou venues inexistants sont silencieusement
 * ignorés (la fonction Postgres ne retourne pas d'erreur).
 *
 * Acceptable pour un user anonyme : `auth.uid()` sera null côté serveur,
 * mais l'événement est tout de même enregistré (RLS INSERT permissive).
 */
export function logVenueEvent(
  venueId: string,
  kind: VenueEventKind,
  meta?: Record<string, unknown>,
): void {
  if (!venueId) return;
  // On ne `await` pas : c'est un fire-and-forget. Toute erreur est avalée.
  (supabase.rpc as any)('log_venue_event', {
    p_venue_id: venueId,
    p_kind: kind,
    p_meta: meta ?? {},
  })
    .then?.(({ error }: { error: any }) => {
      if (error) console.warn('[analytics]', kind, error.message ?? error);
    })
    .catch?.(() => {/* swallow */});
}

// ============================================================================
// Lecture analytics (réservée au propriétaire / admin)
// ============================================================================

export interface VenueAnalyticsKpi {
  views: number;
  clicks: number;
  reservations: number;
  conversion_rate: number;
  period_days: number;
  period_from: string;
  period_to: string;
}

export interface VenueAnalyticsByKind {
  kind: VenueEventKind;
  count: number;
}

export interface VenueAnalyticsDaily {
  day: string;
  views: number;
  clicks: number;
  reservations: number;
}

export interface VenueAnalytics {
  kpi: VenueAnalyticsKpi;
  by_kind: VenueAnalyticsByKind[];
  daily: VenueAnalyticsDaily[];
}

/**
 * Renvoie le panel analytics complet pour un venue.
 * Throw si caller != owner et != admin (FORBIDDEN), ou si venue introuvable.
 */
export async function getVenueAnalytics(venueId: string, periodDays = 30): Promise<VenueAnalytics> {
  const { data, error } = await (supabase.rpc as any)('get_venue_analytics', {
    p_venue_id: venueId,
    p_days: periodDays,
  });
  if (error) {
    const raw = error.message ?? '';
    if (raw.includes('NOT_AUTHENTICATED')) throw new Error('NOT_AUTHENTICATED');
    if (raw.includes('FORBIDDEN')) throw new Error('FORBIDDEN');
    if (raw.includes('VENUE_NOT_FOUND')) throw new Error('VENUE_NOT_FOUND');
    throw new Error(raw || 'ANALYTICS_FAILED');
  }
  return data as VenueAnalytics;
}
