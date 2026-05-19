// ============================================================================
// wallet-transfer — transfert P2P (bouton « Envoyer »).
// Débit de l'expéditeur + crédit du destinataire + écriture de la transaction,
// le tout atomique côté serveur (fonction SQL wallet_transfer).
// ============================================================================
import {
  corsHeaders,
  getAuthUser,
  jsonResponse,
  serviceClient,
} from "../_shared/supabase.ts";

const MIN_XOF = 100;
const MAX_XOF = 2_000_000;

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
    const recipientPhone = String(body?.recipient_phone ?? "").trim();
    const amountXof = Number(body?.amount_xof);
    const note = body?.note ? String(body.note).slice(0, 140) : null;

    if (!/^\+225[0-9]{10}$/.test(recipientPhone)) {
      return jsonResponse(
        { error: "Numéro destinataire invalide (format +225XXXXXXXXXX)" },
        400,
      );
    }
    if (
      !Number.isInteger(amountXof) || amountXof < MIN_XOF ||
      amountXof > MAX_XOF
    ) {
      return jsonResponse(
        { error: `Montant invalide (entre ${MIN_XOF} et ${MAX_XOF} FCFA)` },
        400,
      );
    }

    const svc = serviceClient();

    // Recherche du destinataire par numéro. Supabase Auth stocke le numéro
    // sans le « + » (225XXXXXXXXXX) — on interroge les deux formats.
    const phoneNoPlus = recipientPhone.replace(/^\+/, "");
    const { data: recipient } = await svc
      .from("profiles")
      .select("id, full_name")
      .in("phone", [recipientPhone, phoneNoPlus])
      .maybeSingle();
    if (!recipient) {
      return jsonResponse(
        { error: "Aucun compte Soutra-Paiya avec ce numéro" },
        404,
      );
    }
    if (recipient.id === user.id) {
      return jsonResponse(
        { error: "Tu ne peux pas t'envoyer de l'argent à toi-même" },
        400,
      );
    }

    // Transfert atomique (débit + crédit + transaction en une seule opération).
    const { data: result, error } = await svc.rpc("wallet_transfer", {
      p_sender: user.id,
      p_recipient: recipient.id,
      p_amount: amountXof,
      p_note: note,
    });
    if (error) {
      const msg = String(error.message ?? "");
      if (msg.includes("INSUFFICIENT_FUNDS")) {
        return jsonResponse({ error: "Solde insuffisant" }, 400);
      }
      if (msg.includes("RECIPIENT_WALLET_MISSING")) {
        return jsonResponse(
          { error: "Le destinataire n'a pas encore de wallet actif" },
          409,
        );
      }
      console.error("[wallet-transfer] rpc:", error);
      return jsonResponse({ error: "Le transfert a échoué" }, 500);
    }

    const data = result as { transaction_id: string; sender_balance: number };
    return jsonResponse({
      status: "success",
      transaction_id: data.transaction_id,
      sender_balance: data.sender_balance,
      recipient_name: recipient.full_name || recipientPhone,
    });
  } catch (err) {
    console.error("[wallet-transfer] fatal:", err);
    return jsonResponse({ error: "Erreur interne" }, 500);
  }
});
