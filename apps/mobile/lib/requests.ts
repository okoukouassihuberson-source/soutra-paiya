// ============================================================================
// Demandes d'argent (bouton « Demander »).
// ============================================================================
import { invokeEdge } from './edge';
import { supabase } from './supabase';
import { lookupRecipient } from './wallet';

export type RequestStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';
export type RequestAction = 'accept' | 'decline' | 'cancel';

// Crée une demande d'argent : le payeur est ciblé par son numéro.
// L'insertion directe est sûre (RLS : requester_id = auth.uid()) — aucune
// somme n'est déplacée tant que le payeur n'a pas accepté.
export async function createPaymentRequest(params: {
  requesterId: string;
  payerPhone: string;
  amountXof: number;
  note?: string;
}): Promise<{ payerName: string }> {
  const payer = await lookupRecipient(params.payerPhone);
  if (!payer) {
    throw new Error('Aucun compte Soutra-Playce avec ce numéro');
  }
  if (payer.id === params.requesterId) {
    throw new Error("Tu ne peux pas te demander de l'argent à toi-même");
  }
  const { error } = await (supabase as any).from('payment_requests').insert({
    requester_id: params.requesterId,
    payer_id: payer.id,
    amount_xof: params.amountXof,
    note: params.note?.trim() || null,
  });
  if (error) throw new Error(error.message);
  return { payerName: payer.name };
}

// Accepte / refuse / annule une demande. Le traitement (et le transfert en
// cas d'acceptation) est atomique côté serveur.
export async function respondToRequest(
  requestId: string,
  action: RequestAction,
): Promise<{ status: RequestStatus }> {
  return invokeEdge<{ status: RequestStatus }>('payment-request-respond', {
    request_id: requestId,
    action,
  });
}
