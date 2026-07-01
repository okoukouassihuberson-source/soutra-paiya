// ============================================================================
// geniuspay-pay-order — démarre un paiement GeniusPay pour une commande.
//
// Appelée depuis mobile (/orders) après création d'une order pending.
// Pattern miroir de paystack-pay-order :
//   1. Auth check
//   2. RPC get_order_payment_info (RLS owner) → infos authoritatives
//   3. Crée tx pending metadata={purpose:'order', order_id}
//   4. GeniusPay POST /payments (checkout page — sans payment_method forcé)
//   5. Retourne checkout_url
//
// Au retour, geniuspay-verify appelle geniuspay_settle_charge → dispatch sur
// purpose='order' → geniuspay_settle_order → order.payment_status='paid' +
// status='confirmed'. Le trigger send-push (Database Webhook orders UPDATE)
// notifie le client + le merchant.
// ============================================================================
import {
  corsHeaders,
  getAuthUser,
  jsonResponse,
  serviceClient,
} from "../_shared/supabase.ts";
import { initializePayment } from "../_shared/geniuspay.ts";

const DEFAULT_CALLBACK_URL = "https://soutra-paiya.vercel.app/geniuspay/callback";
const MIN_XOF = 200;

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

    const { data: info, error: infoErr } = await svc.rpc(
      "get_order_payment_info",
      { p_order_id: orderId },
    );
    if (infoErr || !info) {
      console.error("[gp-pay-order] info:", infoErr);
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
    if (!Number.isInteger(amountXof) || amountXof < MIN_XOF) {
      return jsonResponse(
        { error: `Montant invalide (minimum ${MIN_XOF} XOF)` },
        400,
      );
    }

    const { data: profile } = await svc
      .from("profiles")
      .select("email, full_name, phone")
      .eq("id", user.id)
      .maybeSingle();
    const email =
      (profile as { email?: string } | null)?.email ||
      user.email ||
      `${user.id}@users.soutra-paiya.app`;
    const name = (profile as { full_name?: string } | null)?.full_name ??
      undefined;
    const phone = (profile as { phone?: string } | null)?.phone ?? undefined;

    // Préfixe sp-ord- conservé pour dispatch dans le callback web.
    const reference = `sp-ord-${crypto.randomUUID()}`;

    const { data: tx, error: txErr } = await svc
      .from("transactions")
      .insert({
        user_id: user.id,
        type: "payment",
        amount_xof: amountXof,
        status: "pending",
        provider: "geniuspay",
        provider_ref: reference,
        description:
          `Commande ${orderInfo.order_number} chez ${orderInfo.venue_name}`,
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
      console.error("[gp-pay-order] insert tx:", txErr);
      return jsonResponse({ error: "Impossible de créer la transaction" }, 500);
    }

    const callbackUrl =
      Deno.env.get("GENIUSPAY_CALLBACK_URL") ?? DEFAULT_CALLBACK_URL;
    const successUrl = `${callbackUrl}?reference=${
      encodeURIComponent(reference)
    }`;
    const errorUrl = `${callbackUrl}?reference=${
      encodeURIComponent(reference)
    }&status=failed`;

    try {
      const init = await initializePayment({
        amount: amountXof,
        currency: "XOF",
        description:
          `Commande ${orderInfo.order_number} chez ${orderInfo.venue_name}`,
        customer: { name, email, phone, country: "CI" },
        success_url: successUrl,
        error_url: errorUrl,
        metadata: {
          purpose: "order",
          user_id: user.id,
          transaction_id: tx.id,
          order_id: orderInfo.order_id,
          order_number: orderInfo.order_number,
          venue_id: orderInfo.venue_id,
          soutra_reference: reference,
        },
      });
      const data = init.data;
      if (!data?.checkout_url) {
        throw new Error("Réponse GeniusPay sans checkout_url");
      }
      return jsonResponse({
        ok: true,
        checkout_url: data.checkout_url,
        reference,
        amount_xof: amountXof,
        order_id: orderInfo.order_id,
        order_number: orderInfo.order_number,
      });
    } catch (err) {
      console.error("[gp-pay-order] geniuspay:", err);
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
    console.error("[gp-pay-order] fatal:", err);
    return jsonResponse({ error: "Erreur interne" }, 500);
  }
});
