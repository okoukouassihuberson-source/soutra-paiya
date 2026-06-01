// ============================================================================
// Signalements communautaires sur les venues (migration 0034).
// ============================================================================
import { supabase } from './supabase';

export type ReportKind =
  | 'closed'        // Fermé définitivement
  | 'moved'         // A déménagé
  | 'duplicate'     // Doublon
  | 'wrong_info'    // Info erronée
  | 'wrong_price'   // Prix faux
  | 'inappropriate' // Contenu inapproprié
  | 'other';        // Autre

export type ReportStatus = 'open' | 'reviewing' | 'resolved' | 'rejected';

export const REPORT_KIND_LABELS: Record<ReportKind, { label: string; icon: string; description: string }> = {
  closed:        { label: 'Fermé définitivement',  icon: '🚫', description: "L'établissement n'existe plus." },
  moved:         { label: 'A déménagé',            icon: '📦', description: "Le lieu a changé d'adresse." },
  duplicate:     { label: 'Doublon',               icon: '👯', description: 'Cette fiche existe déjà sous un autre nom.' },
  wrong_info:    { label: 'Info erronée',          icon: '✏️', description: 'Horaires, numéro ou adresse incorrects.' },
  wrong_price:   { label: 'Prix incorrect',        icon: '💰', description: 'Le prix affiché ne correspond pas à la réalité.' },
  inappropriate: { label: 'Contenu inapproprié',   icon: '⚠️', description: 'Photos, description ou autres contenus inappropriés.' },
  other:         { label: 'Autre',                 icon: '📝', description: 'Autre problème — précise dans le champ détail.' },
};

export interface SubmitResult {
  ok: boolean;
  report_id: string | null;
  reason: 'ALREADY_REPORTED' | null;
}

/**
 * Soumet un signalement sur un venue. Anti-spam côté serveur : un seul
 * report actif (open/reviewing) par (user, venue, kind).
 *
 * @throws Error('VENUE_REQUIRED' | 'INVALID_KIND' | 'DUPLICATE_TARGET_REQUIRED'
 *               | 'NOT_AUTHENTICATED' | 'SELF_DUPLICATE')
 */
export async function submitVenueReport(params: {
  venueId: string;
  kind: ReportKind;
  details?: string;
  duplicateOf?: string;
}): Promise<SubmitResult> {
  const { data, error } = await (supabase.rpc as any)('submit_venue_report', {
    p_venue_id: params.venueId,
    p_kind: params.kind,
    p_details: params.details ?? null,
    p_duplicate_of: params.duplicateOf ?? null,
  });
  if (error) {
    // Les codes maison remontent dans error.message ; on les normalise.
    const raw = error.message ?? '';
    if (raw.includes('NOT_AUTHENTICATED')) throw new Error('NOT_AUTHENTICATED');
    if (raw.includes('VENUE_REQUIRED')) throw new Error('VENUE_REQUIRED');
    if (raw.includes('INVALID_KIND')) throw new Error('INVALID_KIND');
    if (raw.includes('DUPLICATE_TARGET_REQUIRED')) throw new Error('DUPLICATE_TARGET_REQUIRED');
    if (raw.includes('SELF_DUPLICATE')) throw new Error('SELF_DUPLICATE');
    throw new Error(raw || 'REPORT_FAILED');
  }
  const payload = data as { ok: boolean; report_id?: string; reason?: SubmitResult['reason'] };
  return {
    ok: !!payload?.ok,
    report_id: payload?.report_id ?? null,
    reason: payload?.reason ?? null,
  };
}
