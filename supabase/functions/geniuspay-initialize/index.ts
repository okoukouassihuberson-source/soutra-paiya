// ============================================================================
// geniuspay-initialize — démarre un paiement GeniusPay.
// Appelée par le mobile pour : recharger le wallet (« topup ») ou payer un
// acompte de réservation (« reservation_deposit »).
// Crée une transaction « pending » puis renvoie la checkout_url GeniusPay.
//
// Différence vs paystack-initialize :
//   - Montant en XOF entier (pas de subunit ×100).
//   - Minimum GeniusPay = 200 XOF (au lieu de 100 chez Paystack).
//   - Réponse : { checkout_url, reference } (au lieu de authorization_url).
// ============================================================================
import {
  corsHeaders,
  getAuthUser,
  jsonResponse,
  serviceClient,
} from "../_shared/supabase.ts";
import { initializePayment } from "../_shared/geniuspay.ts";

const MIN_XOF = 200; // Minimum imposé par GeniusPay.
const MAX_XOF = 2_000_000;
// GeniusPay rejette un success_url/error_url qui n'est pas en https (testé en
// sandbox : 502 "Le fournisseur de paiement a refusé la demande" avec un
// deep link soutrapaiya:// direct). On repasse donc par la page web
// intermédiaire, qui elle-même deep-link vers l'app ensuite.
const CALLBACK_URL = Deno.env.get("GENIUSPAY_CALLBACK_URL") ??
  "https://soutra-playce.com/geniuspay/callback";

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
    const purpose = body?.purpose;
    if (purpose !== "topup" && purpose !== "reservation_deposit") {
      return jsonResponse({ error: "purpose invalide" }, 400);
    }

    const svc = serviceClient();

    // Récup email + téléphone du profil pour le reçu / le mobile money.
    const { data: profile } = await svc
      .from("profiles")
      .select("email, full_name, phone")
      .eq("id", user.id)
      .maybeSingle();
    const email = profile?.email || user.email ||
      `${user.id}@users.soutra-paiya.app`;
    const phone = profile?.phone ?? undefined;
    const name = profile?.full_name ?? undefined;

    let amountXof: number;
    let txType: "topup" | "payment";
    let reservationId: string | null = null;
    let description: string;

    if (purpose === "topup") {
      amountXof = Number(body?.amount_xof);
      if (
        !Number.isInteger(amountXof) || amountXof < MIN_XOF ||
        amountXof > MAX_XOF
      ) {
        return jsonResponse(
          { error: `Montant invalide (entre ${MIN_XOF} et ${MAX_XOF} FCFA)` },
          400,
        );
      }
      txType = "topup";
      description = "Recharge Soutra-Pay";
    } else {
      reservationId = body?.reservation_id ?? null;
      if (!reservationId) {
        return jsonResponse({ error: "reservation_id requis" }, 400);
      }
      const { data: resa } = await svc
        .from("reservations")
        .select("id, user_id, status, deposit_xof")
        .eq("id", reservationId)
        .maybeSingle();
      if (!resa || resa.user_id !== user.id) {
        return jsonResponse({ error: "Réservation introuvable" }, 404);
      }
      if (resa.status !== "pending") {
        return jsonResponse(
          { error: "Cette réservation n'attend pas de paiement" },
          409,
        );
      }
      if (!resa.deposit_xof || resa.deposit_xof < MIN_XOF) {
        return jsonResponse({ error: "Aucun acompte à payer" }, 400);
      }
      const { data: alreadyPaid } = await svc
        .from("transactions")
        .select("id")
        .eq("reservation_id", reservationId)
        .eq("type", "payment")
        .eq("status", "success")
        .maybeSingle();
      if (alreadyPaid) {
        return jsonResponse({ error: "Acompte déjà payé" }, 409);
      }
      amountXof = resa.deposit_xof;
      txType = "payment";
      description = "Acompte de réservation";
    }

    // Convention de préfixe conservée : sp- = topup/reservation_deposit,
    // reconnu par le callback web et le webhook pour dispatch.
    const reference = `sp-${crypto.randomUUID()}`;

    const { data: tx, error: txErr } = await svc
      .from("transactions")
      .insert({
        user_id: user.id,
        type: txType,
        amount_xof: amountXof,
        status: "pending",
        provider: "geniuspay",
        provider_ref: reference,
        reservation_id: reservationId,
        description,
        metadata: { purpose },
      })
      .select("id")
      .single();

    if (txErr || !tx) {
      console.error("[gp-initialize] insert tx:", txErr);
      return jsonResponse({ error: "Impossible de créer la transaction" }, 500);
    }

    // Inclure la reference dans success_url : ainsi le callback web la
    // retrouve toujours en query param, quelle que soit la stratégie de
    // redirection de GeniusPay.
    const successUrl = `${CALLBACK_URL}?reference=${
      encodeURIComponent(reference)
    }`;
    const errorUrl = `${CALLBACK_URL}?reference=${
      encodeURIComponent(reference)
    }&status=failed`;

    try {
      const init = await initializePayment({
        amount: amountXof,
        currency: "XOF",
        description,
        customer: { name, email, phone, country: "CI" },
        success_url: successUrl,
        error_url: errorUrl,
        metadata: {
          purpose,
          user_id: user.id,
          transaction_id: tx.id,
          reservation_id: reservationId,
          soutra_reference: reference,
        },
      });
      const data = init.data;
      if (!data?.checkout_url) {
        throw new Error("Réponse GeniusPay sans checkout_url");
      }
      // Enregistre la référence GeniusPay (MTX-…) dans la metadata pour
      // pouvoir reconcilier si besoin.
      await svc
        .from("transactions")
        .update({
          metadata: {
            purpose,
            geniuspay_reference: data.reference,
            geniuspay_gateway: data.gateway,
            environment: data.environment,
          },
        })
        .eq("id", tx.id);

      return jsonResponse({
        checkout_url: data.checkout_url,
        reference,
        amount_xof: amountXof,
      });
    } catch (err) {
      console.error("[gp-initialize] geniuspay:", err);
      await svc
        .from("transactions")
        .update({ status: "failed", completed_at: new Date().toISOString() })
        .eq("id", tx.id);
      return jsonResponse(
        { error: "Le fournisseur de paiement a refusé la demande" },
        502,
      );
    }
  } catch (err) {
    console.error("[gp-initialize] fatal:", err);
    return jsonResponse({ error: "Erreur interne" }, 500);
  }
});
