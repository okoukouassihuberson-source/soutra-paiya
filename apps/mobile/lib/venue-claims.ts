// ============================================================================
// Revendications de propriété d'un venue + KYC pro (migration 0039).
// ============================================================================
import { supabase } from './supabase';

export type ClaimStatus =
  | 'pending'
  | 'reviewing'
  | 'approved'
  | 'rejected'
  | 'cancelled';

export const CLAIM_STATUS_META: Record<ClaimStatus, { label: string; color: string; icon: string }> = {
  pending:   { label: 'En attente',  color: '#F59E0B', icon: '⏳' },
  reviewing: { label: 'En revue',    color: '#3B82F6', icon: '🔎' },
  approved:  { label: 'Approuvée',   color: '#10B981', icon: '✅' },
  rejected:  { label: 'Refusée',     color: '#EF4444', icon: '❌' },
  cancelled: { label: 'Annulée',     color: '#6B7280', icon: '🚫' },
};

export interface ClaimStatusInfo {
  claimable: boolean;
  hasOwner: boolean;
  myClaimId: string | null;
  myClaimStatus: ClaimStatus | null;
  reason?: string;
}

/**
 * Renvoie l'état de revendication d'un venue pour l'utilisateur courant.
 * Utilisé pour décider si le bouton "Revendiquer cet établissement" doit
 * être affiché sur la fiche venue.
 */
export async function getVenueClaimStatus(venueId: string): Promise<ClaimStatusInfo> {
  const { data, error } = await (supabase.rpc as any)('get_venue_claim_status', {
    p_venue_id: venueId,
  });
  if (error) throw new Error(error.message ?? 'CLAIM_STATUS_FAILED');
  const payload = (data ?? {}) as {
    claimable?: boolean;
    has_owner?: boolean;
    my_claim_id?: string | null;
    my_claim_status?: ClaimStatus | null;
    reason?: string;
  };
  return {
    claimable: !!payload.claimable,
    hasOwner: !!payload.has_owner,
    myClaimId: payload.my_claim_id ?? null,
    myClaimStatus: payload.my_claim_status ?? null,
    reason: payload.reason,
  };
}

export interface SubmitClaimParams {
  venueId: string;
  idDocUrl?: string;
  businessDocUrl?: string;
  proofUrl?: string;
  businessName?: string;
  businessRole?: string;
  contactPhone?: string;
  notes?: string;
}

export interface SubmitClaimResult {
  ok: boolean;
  claimId: string | null;
  reason: 'ALREADY_OWNER' | 'ALREADY_PENDING' | null;
}

/**
 * Soumet une revendication de propriété avec dossier KYC.
 * Anti-spam : un seul claim actif (pending/reviewing) par (user, venue).
 *
 * @throws Error('NOT_AUTHENTICATED' | 'VENUE_REQUIRED' | 'VENUE_NOT_FOUND'
 *               | 'VENUE_NOT_ACTIVE')
 */
export async function submitVenueClaim(params: SubmitClaimParams): Promise<SubmitClaimResult> {
  const { data, error } = await (supabase.rpc as any)('submit_venue_claim', {
    p_venue_id: params.venueId,
    p_id_doc_url: params.idDocUrl ?? null,
    p_business_doc_url: params.businessDocUrl ?? null,
    p_proof_url: params.proofUrl ?? null,
    p_business_name: params.businessName ?? null,
    p_business_role: params.businessRole ?? null,
    p_contact_phone: params.contactPhone ?? null,
    p_notes: params.notes ?? null,
  });
  if (error) {
    const raw = error.message ?? '';
    if (raw.includes('NOT_AUTHENTICATED')) throw new Error('NOT_AUTHENTICATED');
    if (raw.includes('VENUE_REQUIRED')) throw new Error('VENUE_REQUIRED');
    if (raw.includes('VENUE_NOT_FOUND')) throw new Error('VENUE_NOT_FOUND');
    if (raw.includes('VENUE_NOT_ACTIVE')) throw new Error('VENUE_NOT_ACTIVE');
    throw new Error(raw || 'CLAIM_FAILED');
  }
  const payload = data as { ok?: boolean; claim_id?: string; reason?: SubmitClaimResult['reason'] };
  return {
    ok: !!payload?.ok,
    claimId: payload?.claim_id ?? null,
    reason: payload?.reason ?? null,
  };
}

/**
 * Annule une revendication tant qu'elle est pending/reviewing.
 *
 * @throws Error('NOT_AUTHENTICATED' | 'CLAIM_NOT_FOUND'
 *               | 'NOT_OWNER_OF_CLAIM' | 'CLAIM_FINAL')
 */
export async function cancelVenueClaim(claimId: string): Promise<void> {
  const { error } = await (supabase.rpc as any)('cancel_venue_claim', {
    p_claim_id: claimId,
  });
  if (error) {
    const raw = error.message ?? '';
    if (raw.includes('NOT_AUTHENTICATED')) throw new Error('NOT_AUTHENTICATED');
    if (raw.includes('CLAIM_NOT_FOUND')) throw new Error('CLAIM_NOT_FOUND');
    if (raw.includes('NOT_OWNER_OF_CLAIM')) throw new Error('NOT_OWNER_OF_CLAIM');
    if (raw.includes('CLAIM_FINAL')) throw new Error('CLAIM_FINAL');
    throw new Error(raw || 'CANCEL_FAILED');
  }
}
