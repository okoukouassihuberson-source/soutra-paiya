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

// Recherche le nom d'un destinataire par numéro — sert à confirmer avant
// d'envoyer (éviter une erreur de numéro). Renvoie null si non inscrit.
export async function lookupRecipient(
  phone: string,
): Promise<{ name: string } | null> {
  // Supabase Auth stocke le numéro sans le « + » — on interroge les 2 formats.
  const { data, error } = await supabase
    .from('profiles')
    .select('full_name')
    .in('phone', [phone, phone.replace(/^\+/, '')])
    .maybeSingle();
  if (error || !data) return null;
  return { name: (data as { full_name: string | null }).full_name || phone };
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
