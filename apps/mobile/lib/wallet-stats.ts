// ============================================================================
// Statistiques wallet — wrapper RPC + types (migration 0032).
// ============================================================================
import { supabase } from './supabase';

export type StatsPeriod = '7d' | '30d' | '90d' | '1y' | 'all';

export interface StatsKpi {
  in_xof: number;
  out_xof: number;
  net_xof: number;
  count: number;
  period: StatsPeriod;
  period_label: string;
  period_from: string;
  period_to: string;
}

export interface StatsByType {
  type: string;        // 'transfer_in' | 'transfer_out' | 'payment' | 'split' | ...
  in_xof: number;
  out_xof: number;
  count: number;
}

export interface StatsDaily {
  day: string;         // YYYY-MM-DD
  in_xof: number;
  out_xof: number;
}

export interface StatsCounterparty {
  user_id: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  total_xof: number;
  count: number;
}

export interface WalletStats {
  kpi: StatsKpi;
  by_type: StatsByType[];
  daily: StatsDaily[];
  top_counterparties: StatsCounterparty[];
}

export async function getWalletStats(period: StatsPeriod = '30d'): Promise<WalletStats> {
  const { data, error } = await (supabase.rpc as any)('get_wallet_stats', { p_period: period });
  if (error) throw new Error(error.message ?? 'STATS_FAILED');
  return data as WalletStats;
}

/** Libellé humanisé pour un bucket de `by_type`. */
export function typeBucketLabel(t: string): string {
  switch (t) {
    case 'transfer_in':   return 'Transferts reçus';
    case 'transfer_out':  return 'Transferts envoyés';
    case 'payment':       return 'Paiements';
    case 'split':         return 'Splits';
    case 'topup':         return 'Rechargements';
    case 'withdraw':      return 'Retraits';
    case 'refund':        return 'Remboursements';
    case 'escrow_hold':   return 'Séquestres';
    case 'escrow_release':return 'Libérations';
    case 'fee':           return 'Frais';
    default:              return t;
  }
}

/** Catégorise un bucket en flux entrant / sortant pour les couleurs UI. */
export function typeBucketDirection(t: string): 'in' | 'out' {
  if (t === 'transfer_in' || t === 'topup' || t === 'refund' || t === 'escrow_release') return 'in';
  return 'out';
}
