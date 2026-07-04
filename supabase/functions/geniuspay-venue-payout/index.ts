// ============================================================================
// geniuspay-venue-payout — retrait des revenus venue vers mobile money.
//
// Miroir de venue-payout-initiate adapté à GeniusPay.
// Le gérant déclenche via son Espace gérant → RPC request_venue_payout
// (locks, KYC, solde payable) → POST /payouts GeniusPay.
//
// Référence conservée : sp-vp-<uuid> (pour cohérence avec les logs et le
// dispatch dans le webhook geniuspay-webhook).
// ============================================================================
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  corsHeaders,
  getAuthUser,
  jsonResponse,
  serviceClient,
} from "../_shared/supabase.ts";
import { initiatePayout } from "../_shared/geniuspay.ts";

const PROVIDER_MAP: Record<string, string> = {
  orange: "orange_money",
  mtn: "mtn_money",
  wave: "wave",
  moov: "moov_money",
};

function mapRpcError(raw: string): { status: number; message: string } {
  if (raw.includes("NOT_AUTHENTICATED")) {
    return { status: 401, message: "Authentification requise" };
  }
  if (raw.includes("NOT_OWNER")) {
    return { status: 403, message: "Tu n'es pas le propriétaire de ce lieu" };
  }
  if (raw.includes("VENUE_NOT_FOUND")) {
    return { status: 404, message: "Établissement introuvable" };
  }
  if (raw.includes("KYC_REQUIRED")) {
    return {
      status: 403,
      message: "Vérification d'identité (KYC) requise pour retirer",
    };
  }
  if (raw.includes("AMOUNT_TOO_LOW")) {
    return { status: 400, message: "Montant minimum : 1 000 FCFA" };
  }
  if (raw.includes("AMOUNT_TOO_HIGH")) {
    return { status: 400, message: "Montant maximum : 2 000 000 FCFA" };
  }
  if (raw.includes("PROVIDER_INVALID")) {
    return { status: 400, message: "Opérateur invalide (MTN, Orange ou Wave)" };
  }
  if (raw.includes("PHONE_INVALID")) {
    return { status: 400, message: "Numéro invalide (format +225XXXXXXXXXX)" };
  }
  if (raw.includes("INSUFFICIENT_PAYABLE")) {
    return {
      status: 400,
      message: "Solde payable insuffisant pour ce montant",
    };
  }
  return { status: 500, message: "Impossible de créer la demande de retrait" };
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
    const venueId = String(body?.venue_id ?? "").trim();
    const amountXof = Number(body?.amount_xof);
    const provider = String(body?.provider ?? "").toLowerCase();
    const phone = String(body?.phone ?? "").trim();

    if (!venueId) {
      return jsonResponse({ error: "venue_id requis" }, 400);
    }
    if (!Number.isInteger(amountXof) || amountXof <= 0) {
      return jsonResponse({ error: "Montant invalide" }, 400);
    }
    if (!PROVIDER_MAP[provider]) {
      return jsonResponse({ error: "Opérateur invalide" }, 400);
    }

    const svc = serviceClient();

    // ── 1. Crée la demande en base via RPC (verrou + vérifs métier) ──
    // request_venue_payout utilise auth.uid() → doit être appelée avec le
    // JWT user (pas le service role).
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          headers: { Authorization: req.headers.get("Authorization") ?? "" },
        },
      },
    );

    const { data: reqData, error: reqErr } = await userClient.rpc(
      "request_venue_payout",
      {
        p_venue_id: venueId,
        p_amount: amountXof,
        p_provider: provider,
        p_phone: phone,
      },
    );

    if (reqErr) {
      const mapped = mapRpcError(reqErr.message ?? "");
      return jsonResponse({ error: mapped.message }, mapped.status);
    }

    const reference = (reqData as { reference?: string })?.reference;
    const payoutId = (reqData as { payout_id?: string })?.payout_id;
    if (!reference || !payoutId) {
      return jsonResponse({ error: "Réponse RPC invalide" }, 500);
    }

    // ── 2. Récupère le nom du gérant pour le destinataire GeniusPay ──
    const { data: profile } = await svc
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();
    const recipientName = (profile as { full_name?: string } | null)
      ?.full_name || "Gérant Soutra-Playce";

    // ── 3. Initie le payout GeniusPay ──
    try {
      const payout = await initiatePayout({
        recipient: { name: recipientName, phone },
        destination: {
          type: "mobile_money",
          provider: PROVIDER_MAP[provider],
          account: phone,
        },
        amount: amountXof,
        currency: "XOF",
        description: "Retrait revenus Soutra-Playce",
        metadata: {
          purpose: "venue_payout",
          user_id: user.id,
          venue_id: venueId,
          payout_id: payoutId,
          soutra_reference: reference,
        },
        idempotency_key: reference,
      });

      const payoutData = payout.data?.payout;
      if (!payoutData) {
        throw new Error("Réponse GeniusPay sans données de payout");
      }

      await svc
        .from("venue_payouts")
        .update({
          metadata: {
            geniuspay_payout_id: payoutData.id,
            geniuspay_reference: payoutData.reference,
            payout_status: payoutData.status,
            initial_provider: provider,
          },
        })
        .eq("id", payoutId);

      // Statut « completed » immédiat → règle tout de suite (idempotent
      // avec le webhook payout.completed).
      if (payoutData.status === "completed") {
        await svc.rpc("settle_venue_payout", {
          p_reference: reference,
          p_outcome: "success",
          p_failure_reason: null,
          p_metadata_patch: { settled_by: "immediate" },
        });
        return jsonResponse({
          status: "success",
          reference,
          payout_id: payoutId,
        });
      }

      return jsonResponse({
        status: "pending",
        reference,
        payout_id: payoutId,
        message: "Retrait en cours de traitement",
      });
    } catch (err) {
      // Échec GeniusPay : on marque le payout en failed (libère le solde).
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("[gp-venue-payout] geniuspay:", errMsg);
      await svc.rpc("settle_venue_payout", {
        p_reference: reference,
        p_outcome: "failed",
        p_failure_reason: errMsg,
        p_metadata_patch: { settled_by: "edge_error" },
      });
      return jsonResponse(
        { error: "Le transfert a échoué — ton solde a été restauré" },
        502,
      );
    }
  } catch (err) {
    console.error("[gp-venue-payout] fatal:", err);
    return jsonResponse({ error: "Erreur interne" }, 500);
  }
});
