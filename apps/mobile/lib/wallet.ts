// ============================================================================
// Opérations wallet — transfert P2P (bouton « Envoyer »).
// ============================================================================
import { invokeEdge } from './edge';
import { supabase } from './supabase';

export interface SendMoneyResult {
  transactionId: string;
  senderBalance: number;
  recipientName: string;
}

// Recherche un utilisateur par numéro — sert à confirmer un transfert ou à
// cibler une demande d'argent. Renvoie null si le numéro n'est pas inscrit.
export async function lookupRecipient(
  phone: string,
): Promise<{ id: string; name: string } | null> {
  // Supabase Auth stocke le numéro sans le « + » — on interroge les 2 formats.
  // RPC (migration 0098) : la table profiles n'est plus lisible par les autres utilisateurs.
  const { data, error } = await (supabase as any).rpc('find_profile_by_phone', {
    p_phones: [phone, phone.replace(/^\+/, '')],
  });
  const row = (Array.isArray(data) ? data[0] : data) as { id: string; full_name: string | null } | undefined;
  if (error || !row) return null;
  return { id: row.id, name: row.full_name || phone };
}

// Envoie de l'argent à un autre utilisateur. Le débit/crédit atomique est
// effectué côté serveur (Edge Function wallet-transfer).
export async function sendMoney(params: {
  recipientPhone: string;
  amountXof: number;
  note?: string;
}): Promise<SendMoneyResult> {
  const data = await invokeEdge<{
    transaction_id: string;
    sender_balance: number;
    recipient_name: string;
  }>('wallet-transfer', {
    recipient_phone: params.recipientPhone,
    amount_xof: params.amountXof,
    note: params.note,
  });
  return {
    transactionId: data.transaction_id,
    senderBalance: data.sender_balance,
    recipientName: data.recipient_name,
  };
}
