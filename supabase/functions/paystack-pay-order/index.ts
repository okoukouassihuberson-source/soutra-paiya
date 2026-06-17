// ============================================================================
// paystack-pay-order — démarre un paiement Paystack pour une commande.
//
// Appelée depuis mobile (/orders) après création d'une order pending.
// Pattern miroir de paystack-subscribe :
//   1. Auth check
//   2. RPC get_order_payment_info (RLS owner) → infos authoritatives
//   3. Crée tx pending metadata={purpose:'order', order_id}
//   4. Paystack initialize avec channels mobile + card
//   5. Retourne authorization_url
//
// Au retour, paystack-verify appelle paystack_settle_charge → dispatch sur
// purpose='order' → paystack_settle_order → order.payment_status='paid' +
// status='confirmed'. Le trigger send-push (Database Webhook orders UPDATE)
// notifie le client + le merchant.
// ============================================================================
import {
  corsHeaders,
  getAuthUser,
  jsonResponse,
  serviceClient,
} from "../_shared/supabase.ts";
import { initializeTransaction, toSubunit } from "../_shared/paystack.ts";

const DEFAULT_CALLBACK_URL = "https://soutra-playce.vercel.app/paystack/callback";

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
    const orderId = body?.order_id;
    if (!orderId || typeof orderId !== "string") {
      return jsonResponse({ error: "order_id requis" }, 400);
    }

    const svc = serviceClient();

    // Authority check + récup montant via RPC (RLS owner + payable check)
    const { data: info, error: infoErr } = await svc.rpc(
      "get_order_payment_info",
      { p_order_id: orderId },
    );
    if (infoErr || !info) {
      console.error("[pay-order] info:", infoErr);
      return jsonResponse({ error: "Commande introuvable" }, 404);
    }
    const orderInfo = info as {
      order_id: string;
      venue_id: string;
      venue_name: string;
      order_number: string;
      total_xof: number;
      status: string;
      payment_status: string;
      payable: boolean;
    };

    if (!orderInfo.payable) {
      return jsonResponse(
        { error: "Cette commande n'est pas payable (déjà payée ou annulée)" },
        409,
      );
    }
    const amountXof = Number(orderInfo.total_xof);
    if (!Number.isInteger(amountXof) || amountXof < 100) {
      return jsonResponse({ error: "Montant invalide" }, 400);
    }

    // Email pour le reçu Paystack
    const { data: profile } = await svc
      .from("profiles")
      .select("email")
      .eq("id", user.id)
      .maybeSingle();
    const email =
      (profile as { email?: string } | null)?.email ||
      user.email ||
      `${user.id}@users.soutra-playce.app`;

    // Préfixe sp-ord- pour distinguer des subscriptions (sp-sub-) côté
    // /paystack/callback web.
    const reference = `sp-ord-${crypto.randomUUID()}`;

    const { data: tx, error: txErr } = await svc
      .from("transactions")
      .insert({
        user_id: user.id,
        type: "payment",
        amount_xof: amountXof,
        status: "pending",
        provider: "paystack",
        provider_ref: reference,
        description: `Commande ${orderInfo.order_number} chez ${orderInfo.venue_name}`,
        metadata: {
          purpose: "order",
          order_id: orderInfo.order_id,
          order_number: orderInfo.order_number,
          venue_id: orderInfo.venue_id,
        },
      })
      .select("id")
      .single();

    if (txErr || !tx) {
      console.error("[pay-order] insert tx:", txErr);
      return jsonResponse({ error: "Impossible de créer la transaction" }, 500);
    }

    const callbackUrl =
      Deno.env.get("PAYSTACK_CALLBACK_URL") ?? DEFAULT_CALLBACK_URL;

    try {
      const init = await initializeTransaction({
        email,
        amount: toSubunit(amountXof),
        currency: "XOF",
        reference,
        callback_url: callbackUrl,
        channels: [
          "card",
          "mobile_money",
          "bank",
          "ussd",
          "qr",
          "apple_pay",
          "google_pay",
        ],
        metadata: {
          purpose: "order",
          user_id: user.id,
          transaction_id: tx.id,
          order_id: orderInfo.order_id,
          order_number: orderInfo.order_number,
          venue_id: orderInfo.venue_id,
        },
      });

      return jsonResponse({
        ok: true,
        authorization_url: init.data.authorization_url,
        reference,
        amount_xof: amountXof,
        order_id: orderInfo.order_id,
        order_number: orderInfo.order_number,
      });
    } catch (err) {
      console.error("[pay-order] paystack:", err);
      await svc
        .from("transactions")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", tx.id);
      return jsonResponse(
        { error: "Le fournisseur de paiement a refusé la demande" },
        502,
      );
    }
  } catch (err) {
    console.error("[pay-order] fatal:", err);
    return jsonResponse({ error: "Erreur interne" }, 500);
  }
});
