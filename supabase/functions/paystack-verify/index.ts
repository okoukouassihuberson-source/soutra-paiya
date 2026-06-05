// ============================================================================
// paystack-verify — confirme un encaissement auprès de Paystack.
// Appelée par le mobile au retour de la page de paiement : chemin rapide pour
// mettre à jour l'UX sans attendre le webhook. Le crédit est idempotent
// (fonction SQL paystack_settle_charge), donc sûr même si le webhook passe
// en parallèle.
// ============================================================================
import {
  corsHeaders,
  getAuthUser,
  jsonResponse,
  serviceClient,
} from "../_shared/supabase.ts";
import { verifyTransaction } from "../_shared/paystack.ts";

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
    const reference = body?.reference;
    if (typeof reference !== "string" || !reference) {
      return jsonResponse({ error: "reference requise" }, 400);
    }

    const svc = serviceClient();

    // La transaction doit exister ET appartenir à l'appelant.
    const { data: tx } = await svc
      .from("transactions")
      .select("id, user_id, status, amount_xof")
      .eq("provider_ref", reference)
      .maybeSingle();
    if (!tx || tx.user_id !== user.id) {
      return jsonResponse({ error: "Transaction introuvable" }, 404);
    }
    if (tx.status === "success") {
      return jsonResponse({ status: "success", amount_xof: tx.amount_xof });
    }
    if (tx.status === "failed") {
      return jsonResponse({ status: "failed" });
    }

    // Confirmation auprès de Paystack.
    const verified = await verifyTransaction(reference);
    const pstatus = verified.data.status; // success | failed | abandoned | ...

    if (pstatus === "success") {
      const { data: outcome, error } = await svc.rpc("paystack_settle_charge", {
        p_reference: reference,
        p_paid_subunit: verified.data.amount,
      });
      if (error) {
        console.error("[verify] settle_charge:", error);
        return jsonResponse({ error: "Erreur de règlement" }, 500);
      }
      const ok = outcome === "settled" || outcome === "already_settled";
      return jsonResponse({
        status: ok ? "success" : "failed",
        amount_xof: tx.amount_xof,
      });
    }

    if (
      pstatus === "failed" || pstatus === "abandoned" || pstatus === "reversed"
    ) {
      await svc
        .from("transactions")
        .update({ status: "failed", completed_at: new Date().toISOString() })
        .eq("id", tx.id)
        .eq("status", "pending");
      return jsonResponse({ status: "failed" });
    }

    // Paiement pas encore finalisé côté Paystack.
    return jsonResponse({ status: "pending" });
  } catch (err) {
    console.error("[verify] fatal:", err);
    return jsonResponse({ error: "Erreur interne" }, 500);
  }
});
