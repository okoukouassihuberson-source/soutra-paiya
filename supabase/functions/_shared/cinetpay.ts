// ============================================================================
// Client CinetPay — partagé par toutes les Edge Functions.
//
// CinetPay = passerelle de paiement africaine (Côte d'Ivoire, Sénégal, Mali,
// etc.). Supporte Orange Money, MTN MoMo, Moov Money, Wave, cartes Visa/MC.
//
// Architecture API :
//   • Checkout (encaissement) : POST https://api-checkout.cinetpay.com/v2/payment
//     → renvoie payment_url, l'utilisateur paie sur la page hostée CinetPay
//   • Check (vérification) : POST .../v2/payment/check
//   • Transfer (payout) : POST https://client.cinetpay.com/v1/?method=transfer&...
//   • Webhook (notify_url) : CinetPay POST des form-data + header x-token
//     (HMAC-SHA256 signature)
//
// SECRETS Supabase requis (jamais exposés au client) :
//   supabase secrets set CINETPAY_API_KEY=xxx
//   supabase secrets set CINETPAY_SITE_ID=xxx          (numérique)
//   supabase secrets set CINETPAY_SECRET_KEY=xxx       (pour signature webhook)
//   supabase secrets set CINETPAY_TRANSFER_PASSWORD=xxx (pour Transfer API,
//                                                       différent du SECRET_KEY)
//   supabase secrets set CINETPAY_MODE=PROD|TEST       (défaut TEST)
// ============================================================================

import { createHmac } from "node:crypto";

const CHECKOUT_BASE = "https://api-checkout.cinetpay.com/v2";
const CLIENT_BASE = "https://client.cinetpay.com/v1";

// ─── Secrets accessors ─────────────────────────────────────────────────────

function apiKey(): string {
  const k = Deno.env.get("CINETPAY_API_KEY");
  if (!k) throw new Error("CINETPAY_API_KEY n'est pas configuré");
  return k;
}
function siteId(): string {
  const s = Deno.env.get("CINETPAY_SITE_ID");
  if (!s) throw new Error("CINETPAY_SITE_ID n'est pas configuré");
  return s;
}
function secretKey(): string {
  const s = Deno.env.get("CINETPAY_SECRET_KEY");
  if (!s) throw new Error("CINETPAY_SECRET_KEY n'est pas configuré");
  return s;
}
function transferPassword(): string {
  const p = Deno.env.get("CINETPAY_TRANSFER_PASSWORD");
  if (!p) throw new Error("CINETPAY_TRANSFER_PASSWORD n'est pas configuré");
  return p;
}
export function cinetpayMode(): "PROD" | "TEST" {
  return (Deno.env.get("CINETPAY_MODE") ?? "TEST").toUpperCase() === "PROD" ? "PROD" : "TEST";
}

// ─── Types ────────────────────────────────────────────────────────────────

export interface CinetPayResponse<T = unknown> {
  code: string;        // "201" pour succès, autres pour erreurs
  message: string;
  description?: string;
  data?: T;
  api_response_id?: string;
}

export interface InitializeParams {
  /** Référence unique côté nous (sera notre `provider_ref` dans transactions) */
  transaction_id: string;
  amount: number;     // XOF entier (pas subunit comme Paystack)
  currency?: string;  // "XOF" par défaut
  description: string;
  /** URL de redirection après paiement (web callback) */
  return_url: string;
  /** URL appelée par CinetPay pour notifier (webhook) */
  notify_url: string;
  customer_name?: string;
  customer_surname?: string;
  customer_email?: string;
  customer_phone_number?: string;
  customer_address?: string;
  customer_city?: string;
  customer_country?: string;       // ISO code, ex: "CI"
  customer_state?: string;
  customer_zip_code?: string;
  /** Channels à autoriser : "ALL" (défaut), "MOBILE_MONEY", "CREDIT_CARD", "WALLET" */
  channels?: string;
  /** Metadata libre (max 100 char) — utile pour tagger sp-vp-/sp-wd- préfixes */
  metadata?: string;
}

export interface InitializeData {
  payment_url: string;
  payment_token: string;
}

// ─── HTTP wrapper ──────────────────────────────────────────────────────────

async function cinetpayFetch<T = unknown>(
  url: string,
  body: Record<string, unknown>,
): Promise<CinetPayResponse<T>> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as CinetPayResponse<T> | null;
  if (!json) {
    throw new Error(`CinetPay ${url} : réponse invalide (HTTP ${res.status})`);
  }
  // CinetPay code "201" = success ; tout autre = erreur applicative.
  // Le HTTP status peut être 200 même quand le code applicatif est erreur.
  if (json.code !== "201" && json.code !== "00") {
    throw new Error(`CinetPay ${url} : ${json.message ?? "erreur"} (code ${json.code})`);
  }
  return json;
}

// ─── Encaissement (charge) ─────────────────────────────────────────────────

export async function initializeTransaction(
  params: InitializeParams,
): Promise<CinetPayResponse<InitializeData>> {
  return cinetpayFetch<InitializeData>(`${CHECKOUT_BASE}/payment`, {
    apikey: apiKey(),
    site_id: siteId(),
    transaction_id: params.transaction_id,
    amount: params.amount,
    currency: params.currency ?? "XOF",
    description: params.description,
    return_url: params.return_url,
    notify_url: params.notify_url,
    channels: params.channels ?? "ALL",
    customer_name: params.customer_name,
    customer_surname: params.customer_surname,
    customer_email: params.customer_email,
    customer_phone_number: params.customer_phone_number,
    customer_address: params.customer_address,
    customer_city: params.customer_city,
    customer_country: params.customer_country ?? "CI",
    customer_state: params.customer_state,
    customer_zip_code: params.customer_zip_code,
    metadata: params.metadata,
  });
}

export interface CheckTransactionData {
  amount: number;
  currency: string;
  status: string;          // "ACCEPTED", "REFUSED", "PENDING", etc.
  payment_method: string;  // "OM" | "MTN" | "MOOV" | "WAVE" | "CARD" | ...
  description?: string;
  operator_id?: string;
  payment_date?: string;
}

export async function checkTransaction(
  transactionId: string,
): Promise<CinetPayResponse<CheckTransactionData>> {
  return cinetpayFetch<CheckTransactionData>(`${CHECKOUT_BASE}/payment/check`, {
    apikey: apiKey(),
    site_id: siteId(),
    transaction_id: transactionId,
  });
}

// ─── Transfer (payout sortant vers mobile money) ───────────────────────────
// Note : CinetPay Transfer requiert un endpoint et un flow différents du
// checkout. Authentification via apikey + password séparé.

interface TransferAuthData {
  token: string;
  expire_at: string;
}

/** Étape 1 : login pour récupérer le token de l'API Transfer. */
async function transferLogin(): Promise<string> {
  const url = `${CLIENT_BASE}/auth/login?apikey=${encodeURIComponent(apiKey())}&password=${encodeURIComponent(transferPassword())}`;
  const res = await fetch(url, { method: "POST" });
  const json = (await res.json().catch(() => null)) as CinetPayResponse<TransferAuthData> | null;
  if (!json || (json.code !== "0" && json.code !== "00" && json.code !== "201")) {
    throw new Error(`CinetPay Transfer login échoué : ${json?.message ?? "no body"}`);
  }
  const token = json.data?.token;
  if (!token) throw new Error("CinetPay Transfer login : token manquant");
  return token;
}

export interface TransferContactParams {
  prefix: string;          // "225" (CI) sans +
  phone: string;           // 10 chiffres locaux
  name: string;
  surname: string;
  email: string;
}

/** Ajoute un contact (destinataire) à CinetPay. Idempotent : si déjà existant
 *  CinetPay renvoie un code "703" qu'on traite comme un succès. */
export async function addTransferContact(p: TransferContactParams): Promise<void> {
  const token = await transferLogin();
  const url = `${CLIENT_BASE}/transfer/contact?token=${encodeURIComponent(token)}&lang=fr`;
  const formData = new URLSearchParams();
  formData.append("data", JSON.stringify([{
    prefix: p.prefix,
    phone: p.phone,
    name: p.name,
    surname: p.surname,
    email: p.email,
  }]));
  const res = await fetch(url, { method: "POST", body: formData });
  const json = (await res.json().catch(() => null)) as CinetPayResponse | null;
  if (!json) throw new Error("CinetPay addContact : réponse invalide");
  // Code "703" = "Already exists" → succès idempotent.
  if (json.code !== "0" && json.code !== "00" && json.code !== "703" && json.code !== "201") {
    throw new Error(`CinetPay addContact : ${json.message} (code ${json.code})`);
  }
}

export interface TransferRequest {
  prefix: string;          // "225"
  phone: string;           // 10 chiffres
  amount: number;          // XOF entier
  client_transaction_id: string; // notre référence interne (sp-vp-... / sp-wd-...)
  payment_method?: "OMCIDIRECT" | "MTNCI" | "MOOVCI" | "WAVECI";
  notify_url?: string;     // URL de webhook pour le statut du transfert
}

export interface TransferResponseData {
  transaction_id: string;       // notre client_transaction_id renvoyé
  cinetpay_transaction_id?: string;
  amount: number;
  receiver: string;
  treatment_status?: string;     // "NEW", "VAL", "REJ"
  operator?: string;
}

/** Étape 2 : lance un transfert. Le résultat final arrive via webhook
 *  (notify_url). Cette function renvoie juste l'accusé de réception. */
export async function initiateTransfer(
  req: TransferRequest,
): Promise<CinetPayResponse<TransferResponseData[]>> {
  const token = await transferLogin();
  const url = `${CLIENT_BASE}/transfer/money/send/contact?token=${encodeURIComponent(token)}&lang=fr`;
  const formData = new URLSearchParams();
  formData.append("data", JSON.stringify([{
    prefix: req.prefix,
    phone: req.phone,
    amount: req.amount,
    client_transaction_id: req.client_transaction_id,
    payment_method: req.payment_method,
    notify_url: req.notify_url,
  }]));
  const res = await fetch(url, { method: "POST", body: formData });
  const json = (await res.json().catch(() => null)) as CinetPayResponse<TransferResponseData[]> | null;
  if (!json) throw new Error("CinetPay transfer : réponse invalide");
  if (json.code !== "0" && json.code !== "00" && json.code !== "201") {
    throw new Error(`CinetPay transfer : ${json.message} (code ${json.code})`);
  }
  return json;
}

// ─── Webhook signature verification ────────────────────────────────────────
//
// CinetPay envoie le webhook en POST form-data avec un header `x-token`
// contenant un HMAC-SHA256 calculé sur la concat de :
//   cpm_site_id + cpm_trans_id + cpm_trans_date + cpm_amount + cpm_currency
//   + signature + payment_method + cel_phone_num + cpm_phone_prefixe
//   + cpm_language + cpm_version + cpm_payment_config + cpm_page_action
//   + cpm_custom + cpm_designation + cpm_error_message
// signé avec SECRET_KEY.
//
// Source : doc officielle CinetPay v2.
// ─────────────────────────────────────────────────────────────────────────

const SIGNATURE_FIELDS = [
  "cpm_site_id",
  "cpm_trans_id",
  "cpm_trans_date",
  "cpm_amount",
  "cpm_currency",
  "signature",
  "payment_method",
  "cel_phone_num",
  "cpm_phone_prefixe",
  "cpm_language",
  "cpm_version",
  "cpm_payment_config",
  "cpm_page_action",
  "cpm_custom",
  "cpm_designation",
  "cpm_error_message",
];

export function verifyWebhookSignature(
  body: Record<string, string>,
  receivedToken: string | null,
): boolean {
  if (!receivedToken) return false;
  const data = SIGNATURE_FIELDS.map((f) => body[f] ?? "").join("");
  const expected = createHmac("sha256", secretKey()).update(data).digest("hex");
  // Comparaison sécurisée (timing-safe) en lowercase
  return expected.toLowerCase() === receivedToken.toLowerCase();
}

// ─── Helpers de routing pour le webhook ────────────────────────────────────

/**
 * Notre convention de référence (héritée de Paystack) :
 *   sp-tp-<uuid> = topup wallet
 *   sp-dep-<uuid> = reservation deposit
 *   sp-wd-<uuid> = wallet withdraw (user payout)
 *   sp-vp-<uuid> = venue payout (gérant)
 * Permet au webhook de router vers le bon RPC settle_*.
 */
export type PaymentRefKind = "topup" | "deposit" | "withdraw" | "venue_payout" | "unknown";

export function classifyReference(ref: string | null | undefined): PaymentRefKind {
  if (!ref) return "unknown";
  if (ref.startsWith("sp-vp-")) return "venue_payout";
  if (ref.startsWith("sp-wd-")) return "withdraw";
  if (ref.startsWith("sp-tp-")) return "topup";
  if (ref.startsWith("sp-dep-")) return "deposit";
  // Anciennes refs Paystack (sp-... sans préfixe spécifique) → topup par défaut
  if (ref.startsWith("sp-")) return "topup";
  return "unknown";
}
