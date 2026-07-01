// ============================================================================
// geniuspay-subscribe — démarre le paiement du 1er mois d'un abonnement Pro.
//
// Appelée par /subscribe (web). Crée une transaction « pending » avec
// metadata = {purpose: 'subscription', plan_code, billing_period} puis renvoie
// la checkout_url GeniusPay pour que l'utilisateur autorise le paiement.
//
// Au retour, geniuspay-verify (ou le webhook payment.success) appelle
// geniuspay_settle_charge() qui dispatche sur purpose='subscription' →
// geniuspay_settle_subscription() qui crée la subscription active côté Soutra.
//
// Auto-renouvellement : reporté. GeniusPay expose bien une API subscriptions
// avec billing_cycle, mais la sub créée n'attache aucun moyen de paiement
// et le 1er débit est prévu pour le 1er du mois suivant sans mécanisme
// d'authorization visible. On ne l'utilise pas pour l'instant — chaque mois
// = un nouveau POST /payments côté user (renouvellement manuel).
//
// Cas plan « free » : pas de paiement, on insère directement dans
// public.subscriptions via le service_role (RLS bypass), comme paystack-subscribe.
// ============================================================================
import {
  corsHeaders,
  getAuthUser,
  jsonResponse,
  serviceClient,
} from "../_shared/supabase.ts";
import { initializePayment } from "../_shared/geniuspay.ts";

const DEFAULT_CALLBACK_URL = "https://soutra-playce.com/geniuspay/callback";
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
    const planCode = body?.plan_code;
    const billingPeriod = body?.billing_period ?? "monthly";

    const validPlans = ["free", "standard", "pro", "premium", "soutra_premium"];
    if (
      !planCode || typeof planCode !== "string" ||
      !validPlans.includes(planCode)
    ) {
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
      console.error("[gp-subscribe] price:", priceErr);
      return jsonResponse({ error: "Plan introuvable" }, 404);
    }

    const amountXof = Number((priceData as { amount_xof?: number }).amount_xof);
    const isFree = Boolean((priceData as { is_free?: boolean }).is_free);
    const displayName = String(
      (priceData as { display_name?: string }).display_name ?? planCode,
    );

    // ─────────── Cas Plan Free : insert direct, pas de GeniusPay ───────────
    if (isFree) {
      const periodEnd = new Date();
      periodEnd.setDate(
        periodEnd.getDate() + (billingPeriod === "yearly" ? 365 : 30),
      );

      // Annule tout abo actif précédent (paystack legacy inclus).
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
        console.error("[gp-subscribe] free insert:", subErr);
        return jsonResponse(
          { error: "Activation du plan Free impossible" },
          500,
        );
      }

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
        checkout_url: null,
        redirect_url: "/subscribe?status=success",
      });
    }

    // ─────────── Plan payant : flow GeniusPay ───────────
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
    const email = profile?.email || user.email ||
      `${user.id}@users.soutra-paiya.app`;
    const name = profile?.full_name ?? undefined;
    const phone = profile?.phone ?? undefined;

    // Préfixe sp-sub- reconnu par /geniuspay/callback pour rediriger vers
    // /subscribe?status=… (flow web, pas de deep-link mobile).
    const reference = `sp-sub-${crypto.randomUUID()}`;

    const { data: tx, error: txErr } = await svc
      .from("transactions")
      .insert({
        user_id: user.id,
        type: "payment",
        amount_xof: amountXof,
        status: "pending",
        provider: "geniuspay",
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
      console.error("[gp-subscribe] insert tx:", txErr);
      return jsonResponse({ error: "Impossible de créer la transaction" }, 500);
    }

    const callbackUrl = Deno.env.get("GENIUSPAY_CALLBACK_URL") ??
      DEFAULT_CALLBACK_URL;
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
        description: `Abonnement ${displayName} (${billingPeriod})`,
        customer: { name, email, phone, country: "CI" },
        success_url: successUrl,
        error_url: errorUrl,
        metadata: {
          purpose: "subscription",
          user_id: user.id,
          transaction_id: tx.id,
          plan_code: planCode,
          billing_period: billingPeriod,
          soutra_reference: reference,
        },
      });
      const data = init.data;
      if (!data?.checkout_url) {
        throw new Error("Réponse GeniusPay sans checkout_url");
      }
      // Enregistre la référence GeniusPay (MTX-…) dans la metadata pour la
      // reconciliation ultérieure côté verify.
      await svc
        .from("transactions")
        .update({
          metadata: {
            purpose: "subscription",
            plan_code: planCode,
            billing_period: billingPeriod,
            geniuspay_reference: data.reference,
            geniuspay_gateway: data.gateway,
            environment: data.environment,
          },
        })
        .eq("id", tx.id);

      return jsonResponse({
        ok: true,
        free: false,
        checkout_url: data.checkout_url,
        reference,
        amount_xof: amountXof,
        plan_code: planCode,
        billing_period: billingPeriod,
      });
    } catch (err) {
      console.error("[gp-subscribe] geniuspay:", err);
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
    console.error("[gp-subscribe] fatal:", err);
    return jsonResponse({ error: "Erreur interne" }, 500);
  }
});
