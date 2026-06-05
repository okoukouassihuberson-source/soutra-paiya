// ============================================================================
// subscribe-initialize — démarre un paiement d'abonnement Soutra-Pay via Paystack.
//
// Flow :
//   1. Valide le plan (catalogue hardcodé serveur)
//   2. RPC subscribe(plan_code, amount, duration) → crée subscription pending
//      + retourne la référence sp-sub-<uuid>
//   3. Insère transaction pending avec ce sp-sub-
//   4. Paystack initialize → renvoie authorization_url au mobile
//   5. Webhook Paystack routera ensuite vers activate_subscription via
//      la branche sp-sub- dans paystack-webhook
// ============================================================================
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  corsHeaders,
  getAuthUser,
  jsonResponse,
  serviceClient,
} from "../_shared/supabase.ts";
import { initializeTransaction, toSubunit } from "../_shared/paystack.ts";

// Catalogue d'abonnements (hardcodé serveur pour rester simple et auditable).
const PLANS: Record<string, { name: string; amount_xof: number; duration_days: number }> = {
  free:            { name: "Free",            amount_xof: 0,      duration_days: 365 },
  standard:        { name: "Standard",        amount_xof: 2000,   duration_days: 30 },
  pro:             { name: "Pro",             amount_xof: 5000,   duration_days: 30 },
  premium:         { name: "Premium",         amount_xof: 15000,  duration_days: 30 },
  soutra_premium:  { name: "Soutra Premium",  amount_xof: 30000,  duration_days: 30 },
};

const RETURN_URL = "https://soutra-paiya.vercel.app/paystack/callback";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Méthode non autorisée" }, 405);

  try {
    const user = await getAuthUser(req);
    if (!user) return jsonResponse({ error: "Non authentifié" }, 401);

    const body = await req.json().catch(() => null);
    const planCode = String(body?.plan_code ?? "").toLowerCase();
    const plan = PLANS[planCode];
    if (!plan) {
      return jsonResponse({
        error: "Plan inconnu",
        available_plans: Object.keys(PLANS),
      }, 400);
    }

    const svc = serviceClient();
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      },
    );

    // Free → active direct sans paiement
    if (plan.amount_xof === 0) {
      const { data: subData, error: subErr } = await userClient.rpc("subscribe", {
        p_plan_code: planCode,
        p_amount_xof: 0,
        p_duration_days: plan.duration_days,
      });
      if (subErr) return jsonResponse({ error: subErr.message }, 400);
      const ref = (subData as { reference?: string })?.reference;
      if (ref) {
        await svc.rpc("activate_subscription", {
          p_reference: ref,
          p_duration_days: plan.duration_days,
        });
      }
      return jsonResponse({ status: "active", plan_code: planCode });
    }

    // ── Plan payant : crée la subscription pending via RPC ──
    const { data: subData, error: subErr } = await userClient.rpc("subscribe", {
      p_plan_code: planCode,
      p_amount_xof: plan.amount_xof,
      p_duration_days: plan.duration_days,
    });
    if (subErr) {
      const msg = subErr.message ?? "";
      if (msg.includes("ALREADY_SUBSCRIBED")) {
        return jsonResponse({ error: "Tu as déjà un abonnement actif sur ce plan" }, 409);
      }
      return jsonResponse({ error: msg || "Inscription échouée" }, 400);
    }
    const reference = (subData as { reference?: string })?.reference;
    const subscriptionId = (subData as { subscription_id?: string })?.subscription_id;
    if (!reference) return jsonResponse({ error: "Réponse RPC invalide" }, 500);

    // Crée la transaction pending. Le webhook Paystack activera l'abo via
    // activate_subscription dès paiement confirmé.
    await svc.from("transactions").insert({
      user_id: user.id,
      type: "payment",
      amount_xof: plan.amount_xof,
      status: "pending",
      provider: "paystack",
      provider_ref: reference,
      description: `Abonnement ${plan.name}`,
      metadata: {
        kind: "subscription",
        plan_code: planCode,
        subscription_id: subscriptionId,
        duration_days: plan.duration_days,
      },
    });

    const { data: profile } = await svc
      .from("profiles")
      .select("email")
      .eq("id", user.id)
      .maybeSingle();
    const email = (profile as { email?: string } | null)?.email
      || `${user.id.slice(0, 8)}@soutra-playce.local`;

    const init = await initializeTransaction({
      email,
      amount: toSubunit(plan.amount_xof),
      currency: "XOF",
      reference,
      callback_url: RETURN_URL,
      metadata: { kind: "subscription", plan_code: planCode, subscription_id: subscriptionId },
    });

    return jsonResponse({
      status: "pending",
      authorization_url: init.data.authorization_url,
      reference,
      subscription_id: subscriptionId,
      plan: { code: planCode, ...plan },
    });
  } catch (err) {
    console.error("[subscribe-initialize] fatal:", err);
    const msg = err instanceof Error ? err.message : "Erreur interne";
    return jsonResponse({ error: msg }, 500);
  }
});
