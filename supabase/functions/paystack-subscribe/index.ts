// ============================================================================
// paystack-subscribe — démarre un paiement Paystack pour un abonnement.
//
// Appelée par /subscribe sur le web. Crée une transaction « pending » avec
// metadata = {purpose: 'subscription', plan_code, billing_period} puis renvoie
// l'authorization_url Paystack.
//
// Au retour du paiement, paystack-verify (ou le webhook) appelle
// paystack_settle_charge() qui dispatche sur purpose='subscription' →
// paystack_settle_subscription() qui crée la subscription active.
//
// Cas plan « free » : pas de paiement Paystack, on insère directement dans
// public.subscriptions via le service_role (RLS bypass).
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
    const planCode = body?.plan_code;
    const billingPeriod = body?.billing_period ?? "monthly";

    const validPlans = ["free", "standard", "pro", "premium", "soutra_premium"];
    if (!planCode || typeof planCode !== "string" || !validPlans.includes(planCode)) {
      return jsonResponse({ error: "plan_code invalide" }, 400);
    }
    if (!["monthly", "yearly"].includes(billingPeriod)) {
      return jsonResponse({ error: "billing_period invalide" }, 400);
    }

    const svc = serviceClient();

    // Prix authoritatif côté serveur (le front ne peut pas mentir).
    const { data: priceData, error: priceErr } = await svc.rpc(
      "get_subscription_price",
      { p_plan_code: planCode, p_billing_period: billingPeriod },
    );
    if (priceErr || !priceData) {
      console.error("[subscribe] price:", priceErr);
      return jsonResponse({ error: "Plan introuvable" }, 404);
    }

    const amountXof = Number((priceData as any).amount_xof);
    const isFree = Boolean((priceData as any).is_free);
    const displayName = String((priceData as any).display_name ?? planCode);

    // ─────────── Cas Plan Free : insert direct, pas de Paystack ───────────
    if (isFree) {
      const periodEnd = new Date();
      periodEnd.setDate(
        periodEnd.getDate() + (billingPeriod === "yearly" ? 365 : 30),
      );

      // Annule tout abo actif précédent.
      await svc
        .from("subscriptions")
        .update({
          status: "cancelled",
          cancel_at_period_end: true,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id)
        .in("status", ["active", "trialing", "past_due"]);

      const { data: newSub, error: subErr } = await svc
        .from("subscriptions")
        .insert({
          user_id: user.id,
          plan_code: planCode,
          status: "active",
          billing_period: billingPeriod,
          current_period_start: new Date().toISOString(),
          current_period_end: periodEnd.toISOString(),
          metadata: { source: "free_signup" },
        })
        .select("id")
        .single();

      if (subErr || !newSub) {
        console.error("[subscribe] free insert:", subErr);
        return jsonResponse(
          { error: "Activation du plan Free impossible" },
          500,
        );
      }

      // Log analytics.
      await svc.from("subscription_events").insert({
        user_id: user.id,
        kind: "subscribe_success",
        plan_code: planCode,
        metadata: {
          billing_period: billingPeriod,
          subscription_id: newSub.id,
          source: "free_signup",
        },
      });

      return jsonResponse({
        ok: true,
        free: true,
        subscription_id: newSub.id,
        authorization_url: null,
        redirect_url: "/subscribe?status=success",
      });
    }

    // ─────────── Plan payant : flow Paystack ───────────
    if (!Number.isInteger(amountXof) || amountXof < 100) {
      return jsonResponse({ error: "Montant invalide" }, 400);
    }

    const { data: profile } = await svc
      .from("profiles")
      .select("email")
      .eq("id", user.id)
      .maybeSingle();
    const email =
      profile?.email ||
      user.email ||
      `${user.id}@users.soutra-playce.app`;

    const reference = `sp-sub-${crypto.randomUUID()}`;

    const { data: tx, error: txErr } = await svc
      .from("transactions")
      .insert({
        user_id: user.id,
        type: "payment",
        amount_xof: amountXof,
        status: "pending",
        provider: "paystack",
        provider_ref: reference,
        description: `Abonnement ${displayName} (${billingPeriod})`,
        metadata: {
          purpose: "subscription",
          plan_code: planCode,
          billing_period: billingPeriod,
        },
      })
      .select("id")
      .single();

    if (txErr || !tx) {
      console.error("[subscribe] insert tx:", txErr);
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
        // Channels : Paystack expose carte, mobile money (Orange/MTN/Wave
        // selon numéro), bank et USSD. L'user choisit dans leur UI.
        channels: ["card", "mobile_money", "bank", "ussd"],
        metadata: {
          purpose: "subscription",
          user_id: user.id,
          transaction_id: tx.id,
          plan_code: planCode,
          billing_period: billingPeriod,
        },
      });

      return jsonResponse({
        ok: true,
        free: false,
        authorization_url: init.data.authorization_url,
        reference,
        amount_xof: amountXof,
        plan_code: planCode,
        billing_period: billingPeriod,
      });
    } catch (err) {
      console.error("[subscribe] paystack:", err);
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
    console.error("[subscribe] fatal:", err);
    return jsonResponse({ error: "Erreur interne" }, 500);
  }
});
