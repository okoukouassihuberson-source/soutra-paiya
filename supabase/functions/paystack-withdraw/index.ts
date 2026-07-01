// ============================================================================
// paystack-withdraw — retrait du wallet vers un compte mobile money.
// Débit atomique du wallet, puis transfert sortant Paystack.
// L'issue finale (succès / échec + remboursement) arrive via le webhook.
// ============================================================================
import {
  corsHeaders,
  getAuthUser,
  jsonResponse,
  serviceClient,
} from "../_shared/supabase.ts";
import {
  createRecipient,
  initiateTransfer,
  listBanks,
  toSubunit,
} from "../_shared/paystack.ts";

const MIN_XOF = 100;
const MAX_XOF = 2_000_000;

// Mots-clés pour retrouver l'opérateur dans la liste des banques Paystack.
// Paystack ne propose le payout mobile money XOF que pour MTN, Orange et
// Wave (vérifié via GET /bank?currency=XOF&type=mobile_money) — Moov exclu.
const PROVIDER_KEYWORDS: Record<string, string[]> = {
  mtn: ["mtn"],
  orange: ["orange"],
  wave: ["wave"],
};

// Résout le code « banque » mobile money Paystack à partir de l'opérateur.
async function resolveBankCode(provider: string): Promise<string> {
  const keywords = PROVIDER_KEYWORDS[provider];
  const banks = await listBanks("currency=XOF&type=mobile_money");
  const match = banks.data.find((b) =>
    keywords.some((k) => b.name.toLowerCase().includes(k))
  );
  if (!match) {
    throw new Error(`Opérateur « ${provider} » indisponible chez Paystack`);
  }
  return match.code;
}

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
    if (!PROVIDER_KEYWORDS[provider]) {
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

    // 1. Transaction « pending » créée d'abord : elle sert d'ancre au
    //    remboursement idempotent (paystack_settle_transfer) en cas d'échec.
    const { data: tx, error: txErr } = await svc
      .from("transactions")
      .insert({
        user_id: user.id,
        type: "withdraw",
        amount_xof: amountXof,
        status: "pending",
        provider: "paystack",
        provider_ref: reference,
        description: `Retrait ${provider.toUpperCase()}`,
        metadata: { provider, phone },
      })
      .select("id")
      .single();
    if (txErr || !tx) {
      console.error("[withdraw] insert tx:", txErr);
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
      console.error("[withdraw] debit:", debitErr);
      return jsonResponse({ error: "Impossible de débiter le wallet" }, 500);
    }

    // 3. Destinataire + transfert Paystack. En cas d'échec : remboursement.
    try {
      const bankCode = await resolveBankCode(provider);
      // Pour le mobile money, account_number = numéro local (sans +225).
      const localNumber = phone.replace(/^\+225/, "");
      const recipient = await createRecipient({
        type: "mobile_money",
        name: profile.full_name || "Client Soutra-Explore",
        account_number: localNumber,
        bank_code: bankCode,
        currency: "XOF",
      });
      const transfer = await initiateTransfer({
        source: "balance",
        amount: toSubunit(amountXof),
        recipient: recipient.data.recipient_code,
        reference,
        reason: "Retrait Soutra-Pay",
        currency: "XOF",
      });

      await svc
        .from("transactions")
        .update({
          metadata: {
            provider,
            phone,
            recipient_code: recipient.data.recipient_code,
            transfer_code: transfer.data.transfer_code,
            transfer_status: transfer.data.status,
          },
        })
        .eq("id", tx.id);

      // En mode test, le transfert est parfois « success » immédiatement :
      // on règle tout de suite (idempotent avec un éventuel webhook).
      if (transfer.data.status === "success") {
        await svc.rpc("paystack_settle_transfer", {
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
      // Échec après le débit : remboursement + transaction marquée échouée.
      console.error("[withdraw] paystack:", err);
      await svc.rpc("paystack_settle_transfer", {
        p_reference: reference,
        p_outcome: "failed",
      });
      return jsonResponse(
        { error: "Le transfert a échoué — ton solde a été recrédité" },
        502,
      );
    }
  } catch (err) {
    console.error("[withdraw] fatal:", err);
    return jsonResponse({ error: "Erreur interne" }, 500);
  }
});
