// ============================================================================
// CinetPay — orchestration côté mobile.
//
// Le mobile ne touche jamais aux clés API CinetPay : il appelle les Edge
// Functions Supabase qui possèdent les secrets et orchestrent les appels
// à CinetPay côté serveur.
//
// Remplace l'ancien apps/mobile/lib/paystack.ts (Phase 13 — migration
// Paystack → CinetPay). API publique volontairement proche pour minimiser
// les changements dans les call sites.
// ============================================================================
import * as WebBrowser from 'expo-web-browser';
import { invokeEdge } from './edge';

// Deep link de retour : CinetPay y redirige (via la page web
// /cinetpay/callback), ce qui referme automatiquement le navigateur in-app.
const RETURN_URL = 'soutrapaiya://cinetpay';

export type CinetPayPurpose = 'topup' | 'reservation_deposit';
export type PaymentStatus = 'success' | 'failed' | 'pending';

export interface PaymentResult {
  status: PaymentStatus;
  amountXof?: number;
  reference?: string;
}

interface PayParams {
  purpose: CinetPayPurpose;
  amountXof?: number;     // requis pour topup
  reservationId?: string; // requis pour reservation_deposit
}

export interface WithdrawParams {
  amountXof: number;
  provider: 'orange' | 'mtn' | 'wave' | 'moov';
  phone: string;
}

/**
 * Démarre un paiement CinetPay :
 *   1. Initialise la transaction côté serveur (Edge cinetpay-initialize)
 *   2. Ouvre la page de paiement hostée CinetPay dans un WebBrowser
 *   3. Vérifie le résultat au retour (Edge cinetpay-verify)
 *
 * Le webhook reste la source de vérité — verify est juste le chemin rapide UX.
 */
export async function payWithCinetPay(params: PayParams): Promise<PaymentResult> {
  const init = await invokeEdge<{
    payment_url: string;
    payment_token: string;
    reference: string;
  }>('cinetpay-initialize', {
    purpose: params.purpose,
    amount_xof: params.amountXof,
    reservation_id: params.reservationId,
  });

  if (!init?.payment_url || !init?.reference) {
    throw new Error('Réponse invalide du serveur de paiement CinetPay');
  }

  // Ouvre la page CinetPay. Le navigateur se referme automatiquement quand
  // il atteint RETURN_URL (via la web callback /cinetpay/callback) ; sinon
  // l'utilisateur le ferme manuellement.
  await WebBrowser.openAuthSessionAsync(init.payment_url, RETURN_URL);

  // Verify : statut courant via Edge function (le webhook fait l'autorité,
  // mais on retourne tout de suite l'info à l'UI pour pas attendre).
  try {
    const result = await invokeEdge<{
      status: PaymentStatus;
      amount_xof?: number;
      reference?: string;
    }>('cinetpay-verify', { reference: init.reference });
    return {
      status: result?.status ?? 'pending',
      amountXof: result?.amount_xof ?? params.amountXof,
      reference: init.reference,
    };
  } catch (err) {
    // Si verify échoue, on retourne pending : le webhook réglera l'état
    // et l'UI verra l'update au prochain refresh des transactions.
    console.warn('[cinetpay] verify failed:', err);
    return { status: 'pending', amountXof: params.amountXof, reference: init.reference };
  }
}

/**
 * Demande un retrait du wallet vers un compte mobile money via CinetPay.
 * Le résultat final arrive via webhook ; cette function retourne 'pending'
 * dans la quasi-totalité des cas.
 */
export async function requestWithdrawal(
  params: WithdrawParams,
): Promise<PaymentResult> {
  const result = await invokeEdge<{
    status: PaymentStatus;
    reference: string;
    cinetpay_status?: string;
  }>('cinetpay-withdraw', {
    amount_xof: params.amountXof,
    provider: params.provider,
    phone: params.phone,
  });
  return {
    status: result?.status ?? 'pending',
    amountXof: params.amountXof,
    reference: result?.reference,
  };
}
