// ============================================================================
// Récompenses Soutra-Pay — wrappers RPC (migration 0030).
// ============================================================================
import { supabase } from './supabase';

export type RewardTier = {
  tier: string;
  display_name: string;
  multiplier_bps: number;
  color_hex: string;
  min_lifetime_points: number;
};

export type RewardSummary = {
  balance: number;                      // points dépensables
  lifetime: number;                     // cumul à vie (détermine le palier)
  redeem_rate_xof_per_point: number;    // 1 = 1 point vaut 1 FCFA
  redeem_min_points: number;            // seuil minimum de conversion
  current_tier: RewardTier | null;
  next_tier: (RewardTier & { points_to_reach: number }) | null;
};

export type RewardHistoryEntry = {
  id: string;
  delta_points: number;
  kind: 'earn_transaction' | 'redeem_wallet' | 'bonus_tier' | 'admin_adjust';
  description: string | null;
  source_tx_id: string | null;
  created_at: string;
};

export type RedeemResult = {
  transaction_id: string;
  redeemed_points: number;
  credited_xof: number;
  remaining_points: number;
  new_wallet_balance: number;
};

export async function getRewardSummary(): Promise<RewardSummary> {
  const { data, error } = await (supabase.rpc as any)('get_reward_summary');
  if (error) throw new Error(error.message ?? 'REWARD_SUMMARY_FAILED');
  return data as RewardSummary;
}

export async function listRewardHistory(limit = 50): Promise<RewardHistoryEntry[]> {
  const { data, error } = await (supabase.rpc as any)('list_reward_history', { p_limit: limit });
  if (error) throw new Error(error.message ?? 'REWARD_HISTORY_FAILED');
  return (data as RewardHistoryEntry[]) ?? [];
}

export async function redeemRewardPoints(points: number): Promise<RedeemResult> {
  const { data, error } = await (supabase.rpc as any)('redeem_reward_points', { p_points: points });
  if (error) {
    // Codes maison renvoyés par la fonction PL/pgSQL — on les normalise pour l'UI.
    const raw = error.message ?? '';
    if (raw.includes('INSUFFICIENT_POINTS')) throw new Error('INSUFFICIENT_POINTS');
    if (raw.includes('BELOW_MIN_POINTS')) throw new Error('BELOW_MIN_POINTS');
    if (raw.includes('NOT_AUTHENTICATED')) throw new Error('NOT_AUTHENTICATED');
    throw new Error(raw || 'REDEEM_FAILED');
  }
  return data as RedeemResult;
}

export function multiplierLabel(bps: number): string {
  return (bps / 10000).toFixed(2).replace(/\.?0+$/, '') + '×';
}
