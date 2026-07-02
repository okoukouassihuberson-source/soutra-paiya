// ============================================================================
// Venue payouts (migration 0044) — wrappers RPC + Edge function.
//
// Sécurité côté serveur :
//   • `get_venue_payable_balance` et `list_venue_payouts` : SECURITY DEFINER
//     qui appellent assert_venue_owner_or_admin.
//   • `venue-payout-initiate` (Edge) : appelle request_venue_payout puis
//     orchestre le transfer Paystack ; expose des messages d'erreur clairs.
// ============================================================================
import { supabase } from './supabase';
import { invokeEdge } from './edge';

export interface VenuePayoutBalance {
  gross_xof: number;
  commission_xof: number;
  net_xof: number;
  pending_xof: number;
  paid_xof: number;
  payable_xof: number;
}

export interface VenuePayoutRow {
  id: string;
  amount_xof: number;
  provider: string;
  phone: string;
  status: 'pending' | 'success' | 'failed' | 'reversed';
  paystack_reference: string;
  failure_reason: string | null;
  requested_at: string;
  completed_at: string | null;
}

export type PayoutProvider = 'orange' | 'mtn' | 'wave';

export interface RequestVenuePayoutParams {
  venueId: string;
  amountXof: number;
  provider: PayoutProvider;
  phone: string;
}

export interface RequestVenuePayoutResult {
  status: 'success' | 'pending';
  reference: string;
  payout_id: string;
}

/**
 * Récupère le solde encore retirable pour un venue.
 * @throws Error('NOT_OWNER' | 'NOT_AUTHENTICATED' | 'VENUE_NOT_FOUND')
 */
export async function getVenuePayableBalance(
  venueId: string,
): Promise<VenuePayoutBalance> {
  const { data, error } = await (supabase.rpc as any)(
    'get_venue_payable_balance',
    { p_venue_id: venueId },
  );
  if (error) {
    const raw = error.message ?? '';
    if (raw.includes('NOT_OWNER')) throw new Error('NOT_OWNER');
    if (raw.includes('NOT_AUTHENTICATED')) throw new Error('NOT_AUTHENTICATED');
    if (raw.includes('VENUE_NOT_FOUND')) throw new Error('VENUE_NOT_FOUND');
    throw new Error(raw || 'BALANCE_FAILED');
  }
  return data as VenuePayoutBalance;
}

/**
 * Liste les payouts d'un venue (les plus récents d'abord).
 */
export async function listVenuePayouts(
  venueId: string,
  limit: number = 20,
): Promise<VenuePayoutRow[]> {
  const { data, error } = await (supabase.rpc as any)('list_venue_payouts', {
    p_venue_id: venueId,
    p_limit: limit,
  });
  if (error) throw new Error(error.message ?? 'LIST_PAYOUTS_FAILED');
  return (data ?? []) as VenuePayoutRow[];
}

/**
 * Déclenche une demande de payout via l'Edge function GeniusPay.
 * L'Edge function fait toutes les vérifs (owner, KYC, solde) et orchestre
 * le POST /payouts GeniusPay. Renvoie 'success' (transfer immédiat) ou
 * 'pending' (le webhook payout.completed / payout.failed règlera).
 *
 * Migré depuis venue-payout-initiate (Paystack) en PR #4.
 */
export async function requestVenuePayout(
  params: RequestVenuePayoutParams,
): Promise<RequestVenuePayoutResult> {
  const result = await invokeEdge<{
    status?: 'success' | 'pending';
    reference: string;
    payout_id: string;
  }>('geniuspay-venue-payout', {
    venue_id: params.venueId,
    amount_xof: params.amountXof,
    provider: params.provider,
    phone: params.phone,
  });
  return {
    status: result.status ?? 'pending',
    reference: result.reference,
    payout_id: result.payout_id,
  };
}
