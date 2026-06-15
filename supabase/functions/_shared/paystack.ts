// ============================================================================
// Client Paystack — partagé par toutes les Edge Functions.
// Le secret key (PAYSTACK_SECRET_KEY) ne vit QUE dans cet environnement
// serveur, jamais sur le mobile ni le web.
// ============================================================================
import { createHmac, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";

const PAYSTACK_BASE = "https://api.paystack.co";

function secretKey(): string {
  const key = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!key) throw new Error("PAYSTACK_SECRET_KEY n'est pas configuré");
  return key;
}

// XOF : Paystack attend le montant en « subunit » = FCFA × 100, même si le
// franc CFA n'a pas de centime en circulation.
export function toSubunit(amountXof: number): number {
  return Math.round(amountXof) * 100;
}

export interface PaystackResponse<T = unknown> {
  status: boolean;
  message: string;
  data: T;
}

async function paystackFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<PaystackResponse<T>> {
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const json = (await res.json().catch(() => null)) as PaystackResponse<T> | null;
  if (!res.ok || !json || json.status === false) {
    throw new Error(`Paystack ${path} : ${json?.message ?? `HTTP ${res.status}`}`);
  }
  return json;
}

// --- Encaissements (recharge, acompte) ------------------------------------

export interface InitializeParams {
  email: string;
  amount: number; // subunit
  currency?: string;
  reference?: string;
  callback_url?: string;
  channels?: string[];
  metadata?: Record<string, unknown>;
}

export function initializeTransaction(params: InitializeParams) {
  return paystackFetch<{
    authorization_url: string;
    access_code: string;
    reference: string;
  }>("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

// La réponse /verify renvoie aussi l'objet `authorization` quand la carte
// est réutilisable (reusable=true) — c'est ce qui permet le débit récurrent.
export interface PaystackAuthorization {
  authorization_code: string;
  bin?: string;
  last4?: string;
  exp_month?: string;
  exp_year?: string;
  channel?: string;        // 'card' | 'mobile_money' | …
  card_type?: string;
  brand?: string;          // 'visa', 'master', 'verve'…
  reusable?: boolean;
  signature?: string;
  account_name?: string | null;
}

export function verifyTransaction(reference: string) {
  return paystackFetch<{
    status: string;
    reference: string;
    amount: number;
    currency: string;
    gateway_response: string;
    authorization?: PaystackAuthorization;
    customer?: { email?: string; customer_code?: string };
  }>(`/transaction/verify/${encodeURIComponent(reference)}`, { method: "GET" });
}

// --- Auto-renouvellement (subscription) ------------------------------------

// Déclenche un débit récurrent en utilisant l'authorization_code obtenu lors
// de la première charge. Marche pour les cartes uniquement (le mobile money
// Paystack CI n'expose pas reusable=true). Source de vérité : la doc Paystack
// `/transaction/charge_authorization`.
export interface ChargeAuthorizationParams {
  email: string;
  amount: number;                    // subunit (FCFA × 100)
  authorization_code: string;
  currency?: string;
  reference?: string;
  metadata?: Record<string, unknown>;
}

export function chargeAuthorization(params: ChargeAuthorizationParams) {
  return paystackFetch<{
    status: string;                  // 'success' | 'failed' | 'abandoned' | …
    reference: string;
    amount: number;
    gateway_response: string;
    authorization?: PaystackAuthorization;
  }>("/transaction/charge_authorization", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

// --- Transferts sortants (retrait) ----------------------------------------

export function listBanks(query: string) {
  return paystackFetch<
    Array<{ name: string; code: string; currency: string; type: string }>
  >(`/bank?${query}`, { method: "GET" });
}

export interface RecipientParams {
  type: string; // "mobile_money" pour un retrait mobile money
  name: string;
  account_number: string; // numéro de téléphone pour le mobile money
  bank_code: string;
  currency: string;
}

export function createRecipient(params: RecipientParams) {
  return paystackFetch<{ recipient_code: string }>("/transferrecipient", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export interface TransferParams {
  source: string; // "balance"
  amount: number; // subunit
  recipient: string; // recipient_code
  reference?: string;
  reason?: string;
  currency?: string;
}

export function initiateTransfer(params: TransferParams) {
  return paystackFetch<{
    status: string;
    transfer_code: string;
    reference: string;
  }>("/transfer", { method: "POST", body: JSON.stringify(params) });
}

// --- Webhook ---------------------------------------------------------------

// Vérifie la signature d'un webhook Paystack : le header x-paystack-signature
// est le HMAC-SHA512 du corps brut, signé avec le secret key.
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
): boolean {
  if (!signature) return false;
  const expected = createHmac("sha512", secretKey())
    .update(rawBody)
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
