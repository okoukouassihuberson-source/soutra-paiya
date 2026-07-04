// ============================================================================
// Commissions Soutra-Playce.
//
// Règle unique : seul le retrait (wallet -> mobile money) est facturé, à
// 1 % fixe. Toutes les autres opérations (envoi P2P, paiement marchand,
// recharge, etc.) sont gratuites.
//
// Source de vérité serveur : supabase/functions/geniuspay-withdraw. Ce
// module sert de preview côté client (affichage avant confirmation) — le
// montant réellement transféré est toujours recalculé côté edge function.
// ============================================================================

export const WITHDRAWAL_FEE_BPS = 100; // 100 bps = 1 %

export interface WithdrawalFeeBreakdown {
  /** Montant débité du wallet (= montant demandé par l'utilisateur, inchangé). */
  amountXof: number;
  /** Commission retenue, arrondie à l'entier le plus proche. */
  feeXof: number;
  /** Montant net effectivement transféré vers le mobile money. */
  netXof: number;
}

export function computeWithdrawalFee(amountXof: number): WithdrawalFeeBreakdown {
  const amount = Math.max(0, Math.round(amountXof));
  const feeXof = Math.round((amount * WITHDRAWAL_FEE_BPS) / 10000);
  return { amountXof: amount, feeXof, netXof: amount - feeXof };
}
