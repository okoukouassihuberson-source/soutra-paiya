// ============================================================================
// Client GeniusPay — partagé par toutes les Edge Functions.
// Les credentials (X-API-Key / X-API-Secret) et le webhook secret ne vivent QUE
// dans cet environnement serveur, jamais sur le mobile ni le web.
//
// Base URL : https://geniuspay.ci/api/v1/merchant (sandbox = même URL,
// distinction par la clé : sk_sandbox_* / sk_live_* pour l'API Key et
// ss_sandbox_* / ss_live_* pour l'API Secret — GeniusPay a un naming
// custom où sk_ = « Clé publique (API Key) » et ss_ = « Clé secrète
// (API Secret) », cf. dashboard geniuspay.ci/dashboard/integrations).
//
// Différences clés vs ancien client Paystack :
//   - Montants en XOF entier (min 200), pas en subunit ×100.
//   - Récurrent géré côté GeniusPay (POST /subscriptions avec billing_cycle) ;
//     plus de cron de débit silencieux côté Soutra.
//   - Payouts via wallet dédié (GENIUSPAY_PAYOUT_WALLET_UUID).
//   - Webhook signé HMAC-SHA256(timestamp + "." + body, whsec_secret) avec
//     fenêtre anti-replay de 5 min.
// ============================================================================
import { createHmac, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";

const GENIUSPAY_BASE =
  Deno.env.get("GENIUSPAY_BASE_URL") ?? "https://geniuspay.ci/api/v1/merchant";

function apiKey(): string {
  const key = Deno.env.get("GENIUSPAY_API_KEY");
  if (!key) throw new Error("GENIUSPAY_API_KEY n'est pas configuré");
  return key;
}

function apiSecret(): string {
  const key = Deno.env.get("GENIUSPAY_API_SECRET");
  if (!key) throw new Error("GENIUSPAY_API_SECRET n'est pas configuré");
  return key;
}

function webhookSecret(): string {
  const key = Deno.env.get("GENIUSPAY_WEBHOOK_SECRET");
  if (!key) throw new Error("GENIUSPAY_WEBHOOK_SECRET n'est pas configuré");
  return key;
}

function payoutWalletUuid(): string {
  const id = Deno.env.get("GENIUSPAY_PAYOUT_WALLET_UUID");
  if (!id) throw new Error("GENIUSPAY_PAYOUT_WALLET_UUID n'est pas configuré");
  return id;
}

// XOF chez GeniusPay = entier (1 000 FCFA → 1000). Aucune conversion à faire.
// Helper gardé pour symétrie avec l'ancien toSubunit de Paystack.
export function toXof(amount: number): number {
  return Math.round(amount);
}

export interface GeniusPayResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: { code?: string; message?: string };
}

// La doc Payments parle de X-API-Key + X-API-Secret, les docs Payouts et
// Subscriptions parlent d'Authorization Bearer. On envoie les trois headers
// systématiquement — toute version du backend GeniusPay en ignore celles
// qu'elle ne reconnaît pas.
async function geniusFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<GeniusPayResponse<T>> {
  const res = await fetch(`${GENIUSPAY_BASE}${path}`, {
    ...init,
    headers: {
      "X-API-Key": apiKey(),
      "X-API-Secret": apiSecret(),
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const json = (await res.json().catch(() => null)) as
    | GeniusPayResponse<T>
    | null;
  if (!res.ok || !json || json.success === false) {
    const reason =
      json?.error?.message ?? json?.message ?? `HTTP ${res.status}`;
    throw new Error(`GeniusPay ${path} : ${reason}`);
  }
  return json;
}

// --- Encaissements (recharge, acompte, order, booking, subscription init) ---

export interface InitializePaymentParams {
  amount: number; // XOF entier, min 200
  currency?: string; // défaut XOF
  // Omis → page checkout GeniusPay (recommandé). Sinon : 'wave', 'orange_money', 'mtn_money', 'moov_money', 'card', 'pawapay'.
  payment_method?: string;
  description?: string;
  customer?: {
    name?: string;
    email?: string;
    phone?: string;
    country?: string; // ISO2, défaut CI
  };
  success_url?: string;
  error_url?: string;
  metadata?: Record<string, unknown>;
}

export interface InitializedPayment {
  id: number;
  reference: string; // MTX-XXXXXXXXXX
  amount: number;
  fees: number;
  net_amount: number;
  status: string; // "pending" en sortie d'init
  payment_url?: string; // URL directe d'un provider (ex. wave.com/...)
  checkout_url: string; // page hostée GeniusPay → recommandée
  gateway: string;
  environment: "sandbox" | "live";
  metadata?: Record<string, unknown>;
}

export function initializePayment(params: InitializePaymentParams) {
  return geniusFetch<InitializedPayment>("/payments", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

// Statuts retournés par GeniusPay : pending | processing | completed | failed
// | cancelled | refunded | expired.
export interface PaymentDetails {
  id: number;
  reference: string;
  amount: number;
  currency: string;
  fees: number;
  net_amount: number;
  status: string;
  payment_method?: string;
  payment_provider?: string;
  environment: "sandbox" | "live";
  customer?: { name?: string; email?: string; phone?: string };
  metadata?: Record<string, unknown>;
  created_at: string;
  completed_at?: string;
}

export function getPayment(reference: string) {
  return geniusFetch<PaymentDetails>(
    `/payments/${encodeURIComponent(reference)}`,
    { method: "GET" },
  );
}

// --- Abonnements (récurrent géré 100 % côté GeniusPay) -------------------

export type BillingCycle =
  | "daily"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "yearly";

export interface CreateSubscriptionParams {
  customer: { phone: string; name?: string; email?: string };
  plan_name: string;
  amount: number; // XOF entier
  billing_cycle: BillingCycle;
  trial_days?: number;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface CreatedSubscription {
  uuid: string;
  reference?: string;
  status: string; // "active" | "trialing" | "past_due" | "cancelled"
  next_billing_date?: string;
  checkout_url?: string; // pour la 1re autorisation par le client
}

export function createSubscription(params: CreateSubscriptionParams) {
  return geniusFetch<CreatedSubscription>("/subscriptions", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export function getSubscriptionStatus(uuid: string) {
  return geniusFetch<{
    status: string;
    next_billing_date?: string;
    cancelled_at?: string;
  }>(`/subscriptions/${encodeURIComponent(uuid)}/status`, { method: "GET" });
}

export function cancelSubscription(
  uuid: string,
  opts: { cancel_immediately?: boolean; reason?: string } = {},
) {
  return geniusFetch<{ status: string; cancelled_at?: string }>(
    `/subscriptions/${encodeURIComponent(uuid)}/cancel`,
    { method: "POST", body: JSON.stringify(opts) },
  );
}

// --- Payouts (retrait utilisateur + payout venue) -------------------------

export type PayoutDestinationType = "mobile_money" | "bank_transfer";
export type PayoutProvider =
  | "wave"
  | "orange_money"
  | "mtn_money"
  | "moov_money";

export interface InitiatePayoutParams {
  recipient: { name: string; phone: string; email?: string };
  destination: {
    type: PayoutDestinationType;
    provider: PayoutProvider | string; // string pour les codes étendus (Airtel, etc.)
    account: string; // tel pour mobile money, IBAN pour bank_transfer
  };
  amount: number; // XOF entier
  currency?: string; // défaut XOF
  description?: string;
  metadata?: Record<string, unknown>;
  idempotency_key: string; // obligatoire côté Soutra pour éviter les doubles débits
}

export interface InitiatedPayout {
  id: string; // uuid
  reference: string; // PYT-XXXXXX-XXXXXX
  status: string; // "pending" | "processing" | "completed" | "failed" | "cancelled"
  amount: number;
  fees: number;
  net_amount: number;
  created_at: string;
}

export function initiatePayout(params: InitiatePayoutParams) {
  return geniusFetch<{ payout: InitiatedPayout }>("/payouts", {
    method: "POST",
    body: JSON.stringify({ wallet_id: payoutWalletUuid(), ...params }),
  });
}

export function getPayout(reference: string) {
  return geniusFetch<{ payout: InitiatedPayout }>(
    `/payouts/${encodeURIComponent(reference)}`,
    { method: "GET" },
  );
}

export function cancelPayout(reference: string, reason?: string) {
  return geniusFetch<{ payout: InitiatedPayout }>(
    `/payouts/${encodeURIComponent(reference)}/cancel`,
    { method: "POST", body: JSON.stringify({ reason }) },
  );
}

// --- Wallet payout (administration ; appelé manuellement à l'install) -----

export function listWallets() {
  return geniusFetch<{
    wallets: Array<{
      id: string;
      name: string;
      type: string;
      currency: string;
      balance: number;
      available_balance: number;
      status: string;
    }>;
  }>("/wallets", { method: "GET" });
}

export function rechargePayoutWallet(amount: number) {
  return geniusFetch<{ available_balance: number }>(
    `/wallets/${encodeURIComponent(payoutWalletUuid())}/recharge`,
    {
      method: "POST",
      body: JSON.stringify({ amount, source: "merchant_balance" }),
    },
  );
}

// --- Webhook signature ----------------------------------------------------

// GeniusPay signe : HMAC-SHA256( timestamp + "." + json_payload, whsec_secret )
// avec fenêtre anti-replay 5 minutes. La doc fournit l'exemple de référence
// en PHP — on en transcrit la sémantique exacte.
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
  timestamp: string | null,
  now: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!signature || !timestamp) return false;

  const ts = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(now - ts) > 300) return false; // anti-replay 5 min

  const expected = createHmac("sha256", webhookSecret())
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// Helper de typage pour les events webhook GeniusPay les plus utilisés
// (la liste exhaustive vit dans la doc — on n'en typrise que ce qu'on
// consomme).
export type GeniusPayWebhookEvent =
  | "payment.initiated"
  | "payment.success"
  | "payment.failed"
  | "payment.cancelled"
  | "payment.refunded"
  | "payment.expired"
  | "payout.created"
  | "payout.completed"
  | "payout.failed"
  | "subscription.payment_succeeded"
  | "subscription.payment_failed"
  | "subscription.past_due"
  | "subscription.cancelled"
  | "webhook.test";

export interface GeniusPayWebhookPayload<T = unknown> {
  id: string;
  event: GeniusPayWebhookEvent;
  timestamp: number;
  created_at: string;
  data: T;
  environment: "sandbox" | "live";
  api_version: string;
}
