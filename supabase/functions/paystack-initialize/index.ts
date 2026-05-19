// ============================================================================
// paystack-initialize — démarre un paiement Paystack.
// Appelée par le mobile pour : recharger le wallet (« topup ») ou payer un
// acompte de réservation (« reservation_deposit »).
// Crée une transaction « pending » puis renvoie l'authorization_url Paystack.
// ============================================================================
import {
  corsHeaders,
  getAuthUser,
  jsonResponse,
  serviceClient,
} from "../_shared/supabase.ts";
import { initializeTransaction, toSubunit } from "../_shared/paystack.ts";

const MIN_XOF = 100;
const MAX_XOF = 2_000_000;
const CALLBACK_URL = Deno.env.get("PAYSTACK_CALLBACK_URL") ??
  "https://soutra-paiya.vercel.app/paystack/callback";

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

    // Email pour le reçu Paystack. Les comptes sont créés par téléphone : on
    // génère une adresse de repli si le profil n'a pas d'email.
    const { data: profile } = await svc
      .from("profiles")
      .select("email")
      .eq("id", user.id)
      .maybeSingle();
    const email = profile?.email || user.email ||
      `${user.id}@users.soutra-paiya.app`;

    let amountXof: number;
    let txType: "topup" | "payment";
    let reservationId: string | null = null;

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
      // Empêche un double paiement d'acompte pour la même réservation.
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
    }

    const reference = `sp-${crypto.randomUUID()}`;

    // Transaction créée AVANT l'appel Paystack : le webhook et le verify la
    // retrouvent ensuite par provider_ref.
    const { data: tx, error: txErr } = await svc
      .from("transactions")
      .insert({
        user_id: user.id,
        type: txType,
        amount_xof: amountXof,
        status: "pending",
        provider: "paystack",
        provider_ref: reference,
        reservation_id: reservationId,
        description: txType === "topup"
          ? "Recharge Paiya-Pay"
          : "Acompte de réservation",
        metadata: { purpose },
      })
      .select("id")
      .single();

    if (txErr || !tx) {
      console.error("[initialize] insert tx:", txErr);
      return jsonResponse({ error: "Impossible de créer la transaction" }, 500);
    }

    try {
      const init = await initializeTransaction({
        email,
        amount: toSubunit(amountXof),
        currency: "XOF",
        reference,
        callback_url: CALLBACK_URL,
        metadata: {
          purpose,
          user_id: user.id,
          transaction_id: tx.id,
          reservation_id: reservationId,
        },
      });
      return jsonResponse({
        authorization_url: init.data.authorization_url,
        reference,
        amount_xof: amountXof,
      });
    } catch (err) {
      // L'appel Paystack a échoué : la transaction est marquée échouée.
      console.error("[initialize] paystack:", err);
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
    console.error("[initialize] fatal:", err);
    return jsonResponse({ error: "Erreur interne" }, 500);
  }
});
