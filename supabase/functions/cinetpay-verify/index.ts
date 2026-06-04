// ============================================================================
// cinetpay-verify — vérification synchrone d'un paiement CinetPay.
//
// Appelée par le mobile au retour du WebBrowser (après que l'utilisateur a
// payé sur la page hostée CinetPay). Renvoie le statut courant sans attendre
// le webhook. Le webhook reste la source de vérité ; verify est juste le
// chemin rapide UX.
//
// Sécurité : auth JWT user + double-check via checkTransaction côté serveur.
// L'utilisateur ne peut vérifier que SES propres transactions (RLS check
// inline via provider_ref → transactions.user_id).
// ============================================================================
import {
  corsHeaders,
  getAuthUser,
  jsonResponse,
  serviceClient,
} from "../_shared/supabase.ts";
import { checkTransaction } from "../_shared/cinetpay.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Méthode non autorisée" }, 405);

  try {
    const user = await getAuthUser(req);
    if (!user) return jsonResponse({ error: "Non authentifié" }, 401);

    const body = await req.json().catch(() => null);
    const reference = String(body?.reference ?? "").trim();
    if (!reference) return jsonResponse({ error: "reference requis" }, 400);

    const svc = serviceClient();

    // Vérifie ownership de la transaction
    const { data: tx } = await svc
      .from("transactions")
      .select("id, user_id, status, amount_xof, type, reservation_id")
      .eq("provider_ref", reference)
      .maybeSingle();
    if (!tx) return jsonResponse({ error: "Transaction introuvable" }, 404);
    const t = tx as {
      id: string; user_id: string; status: string;
      amount_xof: number; type: string; reservation_id: string | null;
    };
    if (t.user_id !== user.id) return jsonResponse({ error: "Pas tes droits" }, 403);

    // Si déjà settled par le webhook → on retourne directement
    if (t.status === "success" || t.status === "failed") {
      return jsonResponse({
        status: t.status === "success" ? "success" : "failed",
        reference,
        amount_xof: t.amount_xof,
        type: t.type,
        reservation_id: t.reservation_id,
        cached: true,
      });
    }

    // Sinon : check CinetPay puis settle si nécessaire
    let cinetpayStatus = "PENDING";
    try {
      const check = await checkTransaction(reference);
      cinetpayStatus = check.data?.status ?? "PENDING";
    } catch (err) {
      console.warn("[cinetpay-verify] check failed:", err);
      return jsonResponse({ status: "pending", reference, error: "check_failed" });
    }

    if (cinetpayStatus === "ACCEPTED") {
      // Idempotent : si le webhook a settled entre-temps, l'alias RPC le détecte
      await svc.rpc("settle_payment_charge", {
        p_reference: reference,
        p_paid_subunit: t.amount_xof * 100,
      });
      return jsonResponse({
        status: "success",
        reference,
        amount_xof: t.amount_xof,
        type: t.type,
        reservation_id: t.reservation_id,
      });
    }
    if (cinetpayStatus === "REFUSED") {
      await svc.from("transactions").update({
        status: "failed",
        completed_at: new Date().toISOString(),
      }).eq("id", t.id);
      return jsonResponse({ status: "failed", reference, amount_xof: t.amount_xof });
    }
    return jsonResponse({
      status: "pending",
      reference,
      amount_xof: t.amount_xof,
      cinetpay_status: cinetpayStatus,
    });
  } catch (err) {
    console.error("[cinetpay-verify] fatal:", err);
    return jsonResponse({ error: "Erreur interne" }, 500);
  }
});
