// ============================================================================
// geniuspay-verify — confirme un encaissement auprès de GeniusPay.
// Appelée par le callback web (et éventuellement le mobile) au retour de la
// page de paiement. Chemin rapide pour mettre à jour l'UX sans attendre le
// webhook — le crédit reste idempotent (RPC geniuspay_settle_charge).
//
// Différence critique vs paystack-verify : le montant est comparé en XOF
// entier (pas en subunit ×100), et les statuts GeniusPay sont completed /
// failed / cancelled / expired / refunded (au lieu de success / failed /
// abandoned / reversed).
// ============================================================================
import {
  corsHeaders,
  getAuthUser,
  jsonResponse,
  serviceClient,
} from "../_shared/supabase.ts";
import { getPayment } from "../_shared/geniuspay.ts";

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

    const { data: tx } = await svc
      .from("transactions")
      .select("id, user_id, status, amount_xof, metadata")
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

    // Confirmation auprès de GeniusPay. IMPORTANT : leur API attend leur propre
    // référence (MTX-…) qu'on a stockée en metadata.geniuspay_reference au
    // moment de l'init. Notre référence Soutra (sp-…) leur est inconnue et
    // renvoie 404. Fallback sur notre référence si la metadata n'a pas été
    // sauvegardée (ne devrait pas arriver, sinon la tx est bloquée en pending
    // jusqu'au webhook).
    const gpReference =
      (tx.metadata as { geniuspay_reference?: string } | null)
        ?.geniuspay_reference ?? reference;
    // Mapping de statut :
    //   completed        → success (débit encaissé, on règle)
    //   failed | cancelled | expired | refunded → failed
    //   pending | processing → still pending, on ne change rien
    const verified = await getPayment(gpReference);
    const data = verified.data;
    if (!data) {
      return jsonResponse({ status: "pending" });
    }
    const gpStatus = data.status;

    if (gpStatus === "completed") {
      const { data: outcome, error } = await svc.rpc(
        "geniuspay_settle_charge",
        {
          p_reference: reference,
          p_paid_amount_xof: Number(data.amount),
        },
      );
      if (error) {
        console.error("[gp-verify] settle_charge:", error);
        return jsonResponse({ error: "Erreur de règlement" }, 500);
      }
      const ok = outcome === "settled" || outcome === "already_settled";
      return jsonResponse({
        status: ok ? "success" : "failed",
        amount_xof: tx.amount_xof,
      });
    }

    if (
      gpStatus === "failed" || gpStatus === "cancelled" ||
      gpStatus === "expired" || gpStatus === "refunded"
    ) {
      await svc
        .from("transactions")
        .update({ status: "failed", completed_at: new Date().toISOString() })
        .eq("id", tx.id)
        .eq("status", "pending");
      return jsonResponse({ status: "failed" });
    }

    // pending / processing → paiement pas encore finalisé côté GeniusPay.
    return jsonResponse({ status: "pending" });
  } catch (err) {
    console.error("[gp-verify] fatal:", err);
    return jsonResponse({ error: "Erreur interne" }, 500);
  }
});
