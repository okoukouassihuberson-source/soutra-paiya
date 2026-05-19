// ============================================================================
// Paystack — orchestration côté mobile.
// Le mobile ne touche jamais au secret key : il appelle les Edge Functions
// Supabase, ouvre la page de paiement Paystack, puis demande la vérification.
// ============================================================================
import * as WebBrowser from 'expo-web-browser';
import { invokeEdge } from './edge';

// Deep link de retour : Paystack y redirige (via la page web /paystack/callback),
// ce qui referme automatiquement le navigateur in-app.
const RETURN_URL = 'soutrapaiya://paystack';

export type PaystackPurpose = 'topup' | 'reservation_deposit';
export type PaymentStatus = 'success' | 'failed' | 'pending';

export interface PaymentResult {
  status: PaymentStatus;
  amountXof?: number;
}

interface PayParams {
  purpose: PaystackPurpose;
  amountXof?: number; // requis pour une recharge
  reservationId?: string; // requis pour un acompte
}

export interface WithdrawParams {
  amountXof: number;
  provider: 'orange' | 'mtn' | 'wave';
  phone: string;
}

// Démarre un paiement Paystack : initialise la transaction côté serveur,
// ouvre la page de paiement, puis vérifie le résultat au retour.
export async function payWithPaystack(params: PayParams): Promise<PaymentResult> {
  const init = await invokeEdge<{
    authorization_url: string;
    reference: string;
  }>('paystack-initialize', {
    purpose: params.purpose,
    amount_xof: params.amountXof,
    reservation_id: params.reservationId,
  });

  if (!init?.authorization_url || !init?.reference) {
    throw new Error('Réponse invalide du serveur de paiement');
  }

  // Ouvre la page Paystack. Le navigateur se referme automatiquement quand
  // il atteint RETURN_URL ; sinon l'utilisateur le ferme manuellement.
  await WebBrowser.openAuthSessionAsync(init.authorization_url, RETURN_URL);

  // Le webhook reste la source de vérité ; verify est le chemin rapide UX.
  const result = await invokeEdge<{ status: PaymentStatus; amount_xof?: number }>(
    'paystack-verify',
    { reference: init.reference },
  );

  return { status: result?.status ?? 'pending', amountXof: result?.amount_xof };
}

// Demande un retrait du wallet vers un compte mobile money.
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
