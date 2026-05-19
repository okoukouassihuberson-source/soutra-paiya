// ============================================================================
// Partage d'addition (bouton « Split Bill »).
// ============================================================================
import { supabase } from './supabase';
import { lookupRecipient } from './wallet';

export interface SplitParticipant {
  phone: string;
  amountXof: number;
}

// Crée un partage : résout les numéros en identifiants, puis appelle la
// fonction atomique create_bill_split (partage + une demande par participant).
// Renvoie l'id du partage créé.
export async function createSplit(params: {
  title?: string;
  totalXof: number;
  participants: SplitParticipant[];
}): Promise<string> {
  const resolved: { payer_id: string; amount: number }[] = [];
  for (const p of params.participants) {
    const user = await lookupRecipient(p.phone);
    if (!user) {
      throw new Error(`Numéro non inscrit sur Soutra-Paiya : ${p.phone}`);
    }
    resolved.push({ payer_id: user.id, amount: p.amountXof });
  }

  const { data, error } = await (supabase as any).rpc('create_bill_split', {
    p_title: params.title ?? null,
    p_total: params.totalXof,
    p_participants: resolved,
  });

  if (error) {
    let msg = error.message || 'Création du partage impossible';
    if (/SELF_PARTICIPANT/i.test(msg)) {
      msg = "Tu ne peux pas t'inclure comme participant";
    } else if (/INVALID/i.test(msg)) {
      msg = 'Montant invalide';
    }
    throw new Error(msg);
  }
  return data as string;
}
