// ============================================================================
// Partage d'addition (bouton « Split Bill »).
// ============================================================================
import { supabase } from './supabase';
import { lookupRecipient } from './wallet';
import { tr } from '@/lib/i18n';

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
      throw new Error(tr('sys.splitNotRegistered', { phone: p.phone }));
    }
    resolved.push({ payer_id: user.id, amount: p.amountXof });
  }

  const { data, error } = await (supabase as any).rpc('create_bill_split', {
    p_title: params.title ?? null,
    p_total: params.totalXof,
    p_participants: resolved,
  });

  if (error) {
    let msg = error.message || tr('sys.splitFail');
    if (/SELF_PARTICIPANT/i.test(msg)) {
      msg = tr('sys.splitSelf');
    } else if (/INVALID/i.test(msg)) {
      msg = tr('sys.splitInvalid');
    }
    throw new Error(msg);
  }
  return data as string;
}
