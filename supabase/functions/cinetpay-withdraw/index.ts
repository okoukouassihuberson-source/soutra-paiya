// ============================================================================
// cinetpay-withdraw — retrait du wallet vers mobile money via CinetPay Transfer.
//
// Remplace paystack-withdraw. Flow :
//   1. Vérifie KYC + montant + provider supporté
//   2. Insère transaction `pending` avec préfixe sp-wd- (routing webhook)
//   3. Débite atomiquement le wallet (wallet_debit RPC 0007)
//   4. Ajoute le contact CinetPay (idempotent)
//   5. Lance le transfer
//   6. Si webhook reçu en quasi-temps réel (rare), settle direct ; sinon
//      l'issue arrive via cinetpay-webhook
// ============================================================================
import {
  corsHeaders,
  getAuthUser,
  jsonResponse,
  serviceClient,
} from "../_shared/supabase.ts";
import {
  addTransferContact,
  initiateTransfer,
  cinetpayMode,
} from "../_shared/cinetpay.ts";

const MIN_XOF = 100;
const MAX_XOF = 2_000_000;
const NOTIFY_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/cinetpay-webhook`;

// Mapping provider Soutra → CinetPay payment_method
const PROVIDER_METHODS: Record<string, "OMCIDIRECT" | "MTNCI" | "MOOVCI" | "WAVECI"> = {
  orange: "OMCIDIRECT",
  mtn: "MTNCI",
  moov: "MOOVCI",
  wave: "WAVECI",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Méthode non autorisée" }, 405);

  try {
    const user = await getAuthUser(req);
    if (!user) return jsonResponse({ error: "Non authentifié" }, 401);

    const body = await req.json().catch(() => null);
    const amountXof = Number(body?.amount_xof);
    const provider = String(body?.provider ?? "").toLowerCase();
    const phone = String(body?.phone ?? "").trim();

    if (!Number.isInteger(amountXof) || amountXof < MIN_XOF || amountXof > MAX_XOF) {
      return jsonResponse({ error: `Montant invalide (${MIN_XOF}-${MAX_XOF} FCFA)` }, 400);
    }
    if (!(provider in PROVIDER_METHODS)) {
      return jsonResponse({ error: "Opérateur invalide (orange, mtn, moov, wave)" }, 400);
    }
    if (!/^\+225[0-9]{10}$/.test(phone)) {
      return jsonResponse({ error: "Numéro invalide (+225XXXXXXXXXX)" }, 400);
    }

    const svc = serviceClient();

    // ── KYC obligatoire ──
    const { data: profile } = await svc
      .from("profiles")
      .select("kyc_status, full_name, email")
      .eq("id", user.id)
      .maybeSingle();
    const p = profile as { kyc_status?: string; full_name?: string; email?: string } | null;
    if (!p || p.kyc_status !== "verified") {
      return jsonResponse({ error: "KYC vérifié requis pour retirer" }, 403);
    }
    const fullName = p.full_name || "Utilisateur";
    const [firstName, ...rest] = fullName.split(" ");
    const lastName = rest.join(" ") || firstName;
    const email = p.email || `${user.id.slice(0, 8)}@soutra-playce.local`;

    // ── Référence + transaction pending ──
    const reference = `sp-wd-${crypto.randomUUID()}`;
    const { data: tx, error: txErr } = await svc.from("transactions").insert({
      user_id: user.id,
      type: "withdraw",
      amount_xof: amountXof,
      status: "pending",
      provider: "cinetpay",
      provider_ref: reference,
      description: `Retrait ${provider.toUpperCase()}`,
      metadata: { provider, phone, mode: cinetpayMode() },
    }).select("id").single();
    if (txErr || !tx) {
      console.error("[cinetpay-withdraw] insert tx:", txErr);
      return jsonResponse({ error: "Insert tx échoué" }, 500);
    }

    // ── Débit atomique du wallet ──
    const { error: debitErr } = await svc.rpc("wallet_debit", {
      p_user_id: user.id,
      p_amount: amountXof,
    });
    if (debitErr) {
      await svc.from("transactions").update({
        status: "failed",
        completed_at: new Date().toISOString(),
      }).eq("id", (tx as { id: string }).id);
      if (String(debitErr.message ?? "").includes("INSUFFICIENT_FUNDS")) {
        return jsonResponse({ error: "Solde insuffisant" }, 400);
      }
      console.error("[cinetpay-withdraw] debit:", debitErr);
      return jsonResponse({ error: "Débit wallet échoué" }, 500);
    }

    // ── CinetPay Transfer ──
    try {
      const localNumber = phone.replace(/^\+225/, "");
      // 1. Add contact (idempotent CinetPay côté)
      await addTransferContact({
        prefix: "225",
        phone: localNumber,
        name: firstName.slice(0, 50) || "User",
        surname: lastName.slice(0, 50) || "Soutra",
        email,
      });
      // 2. Initier le transfert
      const transfer = await initiateTransfer({
        prefix: "225",
        phone: localNumber,
        amount: amountXof,
        client_transaction_id: reference,
        payment_method: PROVIDER_METHODS[provider],
        notify_url: NOTIFY_URL,
      });

      // L'issue finale arrive via webhook (cinetpay-webhook).
      // Note : on ne marque PAS success ici — on attend la confirmation
      // CinetPay (treatment_status NEW → VAL ou REJ).
      const status = transfer.data?.[0]?.treatment_status ?? "NEW";
      return jsonResponse({
        status: "pending",
        reference,
        cinetpay_status: status,
        message: "Retrait en cours de traitement par CinetPay",
      });
    } catch (err) {
      // Échec après le débit → recrédite via settle_payment_transfer failed
      console.error("[cinetpay-withdraw] cinetpay:", err);
      await svc.rpc("settle_payment_transfer", {
        p_reference: reference,
        p_outcome: "failed",
      });
      return jsonResponse({
        error: "Transfert échoué — ton solde a été restauré",
      }, 502);
    }
  } catch (err) {
    console.error("[cinetpay-withdraw] fatal:", err);
    return jsonResponse({ error: "Erreur interne" }, 500);
  }
});
