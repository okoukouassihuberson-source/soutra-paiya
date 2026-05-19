// ============================================================================
// payment-request-respond — accepter / refuser / annuler une demande d'argent.
// L'acceptation déclenche un transfert atomique (fonction SQL
// resolve_payment_request) — pas de double traitement possible.
// ============================================================================
import {
  corsHeaders,
  getAuthUser,
  jsonResponse,
  serviceClient,
} from "../_shared/supabase.ts";

const ACTIONS = ["accept", "decline", "cancel"];

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
    const requestId = String(body?.request_id ?? "");
    const action = String(body?.action ?? "");

    if (!/^[0-9a-f-]{36}$/i.test(requestId)) {
      return jsonResponse({ error: "request_id invalide" }, 400);
    }
    if (!ACTIONS.includes(action)) {
      return jsonResponse({ error: "Action invalide" }, 400);
    }

    const svc = serviceClient();
    const { data: result, error } = await svc.rpc("resolve_payment_request", {
      p_request_id: requestId,
      p_actor: user.id,
      p_action: action,
    });
    if (error) {
      console.error("[payment-request-respond] rpc:", error);
      return jsonResponse({ error: "Erreur de traitement" }, 500);
    }

    const r = (result ?? {}) as { ok: boolean; reason?: string; status?: string };
    if (!r.ok) {
      const reason = r.reason ?? "";
      if (reason === "not_found") {
        return jsonResponse({ error: "Demande introuvable" }, 404);
      }
      if (reason === "not_pending") {
        return jsonResponse({ error: "Cette demande a déjà été traitée" }, 409);
      }
      if (reason === "forbidden") {
        return jsonResponse(
          { error: "Action non autorisée pour cette demande" },
          403,
        );
      }
      if (reason.includes("insufficient")) {
        return jsonResponse({ error: "Solde insuffisant" }, 400);
      }
      console.error("[payment-request-respond] échec:", reason);
      return jsonResponse({ error: "Demande non traitée" }, 400);
    }

    return jsonResponse({ status: r.status });
  } catch (err) {
    console.error("[payment-request-respond] fatal:", err);
    return jsonResponse({ error: "Erreur interne" }, 500);
  }
});
