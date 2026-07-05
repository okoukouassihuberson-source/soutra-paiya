// ============================================================================
// GeniusPay — orchestration côté mobile.
// Le mobile ne touche jamais aux clés API : il appelle les Edge Functions
// Supabase, ouvre la page de paiement GeniusPay, puis demande la vérification.
// ============================================================================
import * as WebBrowser from 'expo-web-browser';
import { invokeEdge } from './edge';

// Deep link de retour : GeniusPay y redirige (via la page web
// /geniuspay/callback), ce qui referme automatiquement le navigateur in-app.
const RETURN_URL = 'soutrapaiya://geniuspay';

export type GeniusPayPurpose = 'topup' | 'reservation_deposit';
export type PaymentStatus = 'success' | 'failed' | 'pending';

export interface PaymentResult {
  status: PaymentStatus;
  amountXof?: number;
}

interface PayParams {
  purpose: GeniusPayPurpose;
  amountXof?: number; // requis pour une recharge
  reservationId?: string; // requis pour un acompte
}

// Démarre un paiement GeniusPay : initialise la transaction côté serveur,
// ouvre la page checkout, puis vérifie le résultat au retour.
export async function payWithGeniuspay(
  params: PayParams,
): Promise<PaymentResult> {
  const init = await invokeEdge<{
    checkout_url: string;
    reference: string;
  }>('geniuspay-initialize', {
    purpose: params.purpose,
    amount_xof: params.amountXof,
    reservation_id: params.reservationId,
  });

  if (!init?.checkout_url || !init?.reference) {
    throw new Error('Réponse invalide du serveur de paiement');
  }

  // Ouvre la page GeniusPay. Le navigateur se referme automatiquement quand
  // il atteint RETURN_URL ; sinon l'utilisateur le ferme manuellement.
  await WebBrowser.openAuthSessionAsync(init.checkout_url, RETURN_URL);

  // Le webhook reste la source de vérité ; verify est le chemin rapide UX.
  const result = await invokeEdge<{
    status: PaymentStatus;
    amount_xof?: number;
  }>('geniuspay-verify', { reference: init.reference });

  return { status: result?.status ?? 'pending', amountXof: result?.amount_xof };
}

// ============================================================================
// Pattern B — fonctions Edge dédiées (geniuspay-pay-order, -pay-booking,
// -pay-ticket), chacune avec sa propre RPC de prix faisant autorité côté
// serveur. Contrairement à payWithGeniuspay ci-dessus (purpose dispatché
// dans une seule fonction geniuspay-initialize), ce pattern cible une
// fonction Edge distincte par type d'achat — plus récent, utilisé par
// orders/room_bookings. Helper générique + wrapper typé pour les billets.
// ============================================================================

async function payViaDedicatedFunction(
  functionName: string,
  body: Record<string, unknown>,
): Promise<PaymentResult> {
  const init = await invokeEdge<{
    checkout_url: string;
    reference: string;
    amount_xof?: number;
  }>(functionName, body);

  if (!init?.checkout_url || !init?.reference) {
    throw new Error('Réponse invalide du serveur de paiement');
  }

  await WebBrowser.openAuthSessionAsync(init.checkout_url, RETURN_URL);

  const result = await invokeEdge<{
    status: PaymentStatus;
    amount_xof?: number;
  }>('geniuspay-verify', { reference: init.reference });

  return { status: result?.status ?? 'pending', amountXof: result?.amount_xof ?? init.amount_xof };
}

// Achat d'un billet d'événement — un seul billet par appel (v1).
export async function payForTicket(params: {
  eventId: string;
  tierName: string;
}): Promise<PaymentResult> {
  return payViaDedicatedFunction('geniuspay-pay-ticket', {
    event_id: params.eventId,
    tier_name: params.tierName,
    quantity: 1,
  });
}

// ============================================================================
// Retrait wallet — mobile money via GeniusPay.
// Migré depuis paystack-withdraw en PR #4.
// ============================================================================

export interface WithdrawParams {
  amountXof: number;
  provider: 'orange' | 'mtn' | 'wave' | 'moov';
  phone: string;
}

// Demande un retrait du wallet vers un compte mobile money via GeniusPay.
// Le webhook payout.completed / payout.failed règle la transaction
// (crédit final ou remboursement) — voir geniuspay-webhook.
export async function requestWithdrawal(
  params: WithdrawParams,
): Promise<PaymentResult> {
  const result = await invokeEdge<{ status: PaymentStatus }>(
    'geniuspay-withdraw',
    {
      amount_xof: params.amountXof,
      provider: params.provider,
      phone: params.phone,
    },
  );
  return { status: result?.status ?? 'pending', amountXof: params.amountXof };
}
