// ============================================================================
// Paystack — orchestration côté mobile (résiduel PR #2).
//
// L'encaissement (recharge, acompte, order, booking) est maintenant assuré
// par apps/mobile/lib/geniuspay.ts (voir payWithGeniuspay). Ce fichier ne
// conserve que le flow retrait qui reste sur Paystack jusqu'à PR #4.
// ============================================================================
import { invokeEdge } from './edge';

export type PaymentStatus = 'success' | 'failed' | 'pending';

export interface PaymentResult {
  status: PaymentStatus;
  amountXof?: number;
}

export interface WithdrawParams {
  amountXof: number;
  provider: 'orange' | 'mtn' | 'wave';
  phone: string;
}

// Demande un retrait du wallet vers un compte mobile money.
// Reste sur paystack-withdraw jusqu'à PR #4 (migration payouts).
export async function requestWithdrawal(
  params: WithdrawParams,
): Promise<PaymentResult> {
  const result = await invokeEdge<{ status: PaymentStatus }>(
    'paystack-withdraw',
    {
      amount_xof: params.amountXof,
      provider: params.provider,
      phone: params.phone,
    },
  );
  return { status: result?.status ?? 'pending', amountXof: params.amountXof };
}
