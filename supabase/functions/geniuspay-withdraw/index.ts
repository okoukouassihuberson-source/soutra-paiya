// ============================================================================
// geniuspay-withdraw — retrait du wallet utilisateur vers mobile money.
//
// Miroir de paystack-withdraw adapté au contrat GeniusPay :
//   - Un seul POST /api/v1/merchant/payouts (pas de créationRecipient
//     séparée), le wallet_id GeniusPay est piloté par le secret
//     GENIUSPAY_PAYOUT_WALLET_UUID.
//   - Montant en XOF entier (pas de subunit).
//   - Provider mobile money : passé tel quel à GeniusPay via
//     destination.provider (wave / orange_money / mtn_money / moov_money).
//   - Le webhook geniuspay-webhook route les events payout.completed /
//     payout.failed sur la référence sp-wd-… → geniuspay_settle_payout
//     (settle tx success ou refund wallet).
// ============================================================================
import {
  corsHeaders,
  getAuthUser,
  jsonResponse,
  serviceClient,
} from "../_shared/supabase.ts";
import { initiatePayout } from "../_shared/geniuspay.ts";

const MIN_XOF = 200; // Contrainte GeniusPay
const MAX_XOF = 2_000_000;

// Mapping du provider court (envoyé par le mobile) vers le code GeniusPay.
// Moov ajouté (GeniusPay le supporte, Paystack non).
const PROVIDER_MAP: Record<string, string> = {
  orange: "orange_money",
  mtn: "mtn_money",
  wave: "wave",
  moov: "moov_money",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Méthode non autorisée" }, 405);
  }

  try {
    const user = await getAuthUser(req);
    if (!user) return jsonResponse({ error: "Non authentifié" }, 401);

    const body = await req.json().catch(() => null);
    const amountXof = Number(body?.amount_xof);
    const provider = String(body?.provider ?? "").toLowerCase();
    const phone = String(body?.phone ?? "").trim();

    if (
      !Number.isInteger(amountXof) || amountXof < MIN_XOF ||
      amountXof > MAX_XOF
    ) {
      return jsonResponse(
        { error: `Montant invalide (entre ${MIN_XOF} et ${MAX_XOF} FCFA)` },
        400,
      );
    }
    if (!PROVIDER_MAP[provider]) {
      return jsonResponse({ error: "Opérateur invalide" }, 400);
    }
    if (!/^\+225[0-9]{10}$/.test(phone)) {
      return jsonResponse(
        { error: "Numéro invalide (format +225XXXXXXXXXX)" },
        400,
      );
    }

    const svc = serviceClient();

    // KYC vérifié obligatoire pour retirer.
    const { data: profile } = await svc
      .from("profiles")
      .select("kyc_status, full_name")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile || profile.kyc_status !== "verified") {
      return jsonResponse(
        { error: "Vérification d'identité (KYC) requise pour retirer" },
        403,
      );
    }

    const reference = `sp-wd-${crypto.randomUUID()}`;
    const nowIso = () => new Date().toISOString();

    // 1. Transaction « pending » créée d'abord — sert d'ancre au
    //    remboursement idempotent (geniuspay_settle_payout) en cas d'échec.
    const { data: tx, error: txErr } = await svc
      .from("transactions")
      .insert({
        user_id: user.id,
        type: "withdraw",
        amount_xof: amountXof,
        status: "pending",
        provider: "geniuspay",
        provider_ref: reference,
        description: `Retrait ${provider.toUpperCase()}`,
        metadata: { provider, phone },
      })
      .select("id")
      .single();
    if (txErr || !tx) {
      console.error("[gp-withdraw] insert tx:", txErr);
      return jsonResponse({ error: "Impossible de créer la transaction" }, 500);
    }

    // 2. Débit atomique du wallet.
    const { error: debitErr } = await svc.rpc("wallet_debit", {
      p_user_id: user.id,
      p_amount: amountXof,
    });
    if (debitErr) {
      await svc
        .from("transactions")
        .update({ status: "failed", completed_at: nowIso() })
        .eq("id", tx.id);
      if (String(debitErr.message ?? "").includes("INSUFFICIENT_FUNDS")) {
        return jsonResponse({ error: "Solde insuffisant" }, 400);
      }
      console.error("[gp-withdraw] debit:", debitErr);
      return jsonResponse({ error: "Impossible de débiter le wallet" }, 500);
    }

    // 3. Payout GeniusPay. Le wallet_id est pris automatiquement depuis
    //    GENIUSPAY_PAYOUT_WALLET_UUID dans _shared/geniuspay.ts.
    //    idempotency_key = notre reference → GeniusPay dédoublonne côté leur.
    try {
      const payout = await initiatePayout({
        recipient: {
          name: profile.full_name || "Client Soutra-Explore",
          phone,
        },
        destination: {
          type: "mobile_money",
          provider: PROVIDER_MAP[provider],
          account: phone,
        },
        amount: amountXof,
        currency: "XOF",
        description: `Retrait wallet ${provider.toUpperCase()}`,
        metadata: {
          purpose: "wallet_withdraw",
          user_id: user.id,
          transaction_id: tx.id,
          soutra_reference: reference,
        },
        idempotency_key: reference,
      });

      const payoutData = payout.data?.payout;
      if (!payoutData) {
        throw new Error("Réponse GeniusPay sans données de payout");
      }

      await svc
        .from("transactions")
        .update({
          metadata: {
            provider,
            phone,
            geniuspay_payout_id: payoutData.id,
            geniuspay_reference: payoutData.reference,
            payout_status: payoutData.status,
          },
        })
        .eq("id", tx.id);

      // GeniusPay peut renvoyer 'completed' immédiatement en sandbox ou
      // pour certains rails — on règle tout de suite (idempotent avec un
      // éventuel webhook payout.completed).
      if (payoutData.status === "completed") {
        await svc.rpc("geniuspay_settle_payout", {
          p_reference: reference,
          p_outcome: "success",
        });
        return jsonResponse({ status: "success", reference });
      }

      return jsonResponse({
        status: "pending",
        reference,
        message: "Retrait en cours de traitement",
      });
    } catch (err) {
      // Échec après le débit : remboursement via geniuspay_settle_payout.
      console.error("[gp-withdraw] geniuspay:", err);
      await svc.rpc("geniuspay_settle_payout", {
        p_reference: reference,
        p_outcome: "failed",
      });
      return jsonResponse(
        { error: "Le transfert a échoué — ton solde a été recrédité" },
        502,
      );
    }
  } catch (err) {
    console.error("[gp-withdraw] fatal:", err);
    return jsonResponse({ error: "Erreur interne" }, 500);
  }
});
