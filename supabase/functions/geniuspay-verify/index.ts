// ============================================================================
// geniuspay-verify — confirme un encaissement en polling la DB Supabase.
//
// Appelée par le callback web (et le mobile pour topup/reservation/order/
// booking) au retour de la page de paiement.
//
// STRATÉGIE : le webhook GeniusPay est la SOURCE DE VÉRITÉ — c'est lui qui
// settle la transaction via geniuspay_settle_charge. verify ne fait PLUS
// d'appel à GET /payments côté GeniusPay pour deux raisons :
//   1. En sandbox, GET /payments renvoie 404 tant que le paiement n'est pas
//      complété (constaté empiriquement 2026-07-01). Le round-trip
//      POST/GET est incohérent.
//   2. Même en prod, le webhook arrive typiquement dans les ~1s après le
//      paiement. Un polling court de la DB suffit largement à donner un
//      feedback UX rapide sans risquer de racer avec le webhook.
//
// Comportement :
//   - Si la tx est déjà success/failed → retourne le statut immédiatement.
//   - Sinon (pending), poll toutes les 500 ms jusqu'à 4 s. Si settle par
//     le webhook entretemps → success/failed. Sinon → pending (le user
//     reste en attente, un refresh manuel montrera le statut final).
// ============================================================================
import {
  corsHeaders,
  getAuthUser,
  jsonResponse,
  serviceClient,
} from "../_shared/supabase.ts";

const POLL_INTERVAL_MS = 500;
const POLL_TIMEOUT_MS = 4000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    const reference = body?.reference;
    if (typeof reference !== "string" || !reference) {
      return jsonResponse({ error: "reference requise" }, 400);
    }

    const svc = serviceClient();

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

    // Polling DB : on attend que le webhook settle la transaction.
    const start = Date.now();
    let currentStatus: string = tx.status;
    while (
      currentStatus === "pending" && (Date.now() - start) < POLL_TIMEOUT_MS
    ) {
      await sleep(POLL_INTERVAL_MS);
      const { data: refreshed } = await svc
        .from("transactions")
        .select("status, amount_xof")
        .eq("id", tx.id)
        .single();
      if (refreshed) {
        currentStatus = refreshed.status;
      }
    }

    if (currentStatus === "success") {
      return jsonResponse({
        status: "success",
        amount_xof: tx.amount_xof,
      });
    }
    if (currentStatus === "failed") {
      return jsonResponse({ status: "failed" });
    }
    // Timeout — le webhook n'est pas encore arrivé. Le user reste sur
    // "pending" et pourra refresh pour voir l'état final quand le
    // webhook aura settle.
    return jsonResponse({ status: "pending" });
  } catch (err) {
    console.error("[gp-verify] fatal:", err);
    return jsonResponse({ error: "Erreur interne" }, 500);
  }
});
