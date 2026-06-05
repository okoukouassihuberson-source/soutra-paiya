// ============================================================================
// subscribe-initialize — démarre un paiement d'abonnement Soutra-Pay.
//
// Flow :
//   1. Valide le plan (catalogue hardcodé serveur)
//   2. RPC subscribe(plan_code, amount, duration) → crée subscription pending
//      + retourne la référence sp-sub-<uuid>
//   3. Insère transaction pending avec ce sp-sub-
//   4. CinetPay initialize → renvoie payment_url au mobile
//   5. Webhook CinetPay routera ensuite vers activate_subscription
// ============================================================================
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  corsHeaders,
  getAuthUser,
  jsonResponse,
  serviceClient,
} from "../_shared/supabase.ts";
import { initializeTransaction, cinetpayMode } from "../_shared/cinetpay.ts";

const RETURN_URL = "https://soutra-paiya.vercel.app/cinetpay/callback";
const NOTIFY_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/cinetpay-webhook`;

// Catalogue d'abonnements (hardcodé serveur pour rester simple et auditable).
// Si tu veux les administrables, créer une table `subscription_plans` plus tard.
const PLANS: Record<string, { name: string; amount_xof: number; duration_days: number }> = {
  free:            { name: "Free",            amount_xof: 0,      duration_days: 365 },
  standard:        { name: "Standard",        amount_xof: 2000,   duration_days: 30 },
  pro:             { name: "Pro",             amount_xof: 5000,   duration_days: 30 },
  premium:         { name: "Premium",         amount_xof: 15000,  duration_days: 30 },
  soutra_premium:  { name: "Soutra Premium",  amount_xof: 30000,  duration_days: 30 },
};

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

    // Pour le plan Free, on active direct sans paiement
    if (plan.amount_xof === 0) {
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
        },
      );
      const { data: subData, error: subErr } = await userClient.rpc("subscribe", {
        p_plan_code: planCode,
        p_amount_xof: 0,
        p_duration_days: plan.duration_days,
      });
      if (subErr) return jsonResponse({ error: subErr.message }, 400);
      const ref = (subData as { reference?: string })?.reference;
      // Active direct
      if (ref) {
        await svc.rpc("activate_subscription", {
          p_reference: ref,
          p_duration_days: plan.duration_days,
        });
      }
      return jsonResponse({ status: "active", plan_code: planCode });
    }

    // ── Plan payant : crée la subscription pending via RPC ──
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      },
    );
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

    // Crée la transaction pending (le webhook activera l'abo via activate_subscription)
    await svc.from("transactions").insert({
      user_id: user.id,
      type: "payment",
      amount_xof: plan.amount_xof,
      status: "pending",
      provider: "cinetpay",
      provider_ref: reference,
      description: `Abonnement ${plan.name}`,
      metadata: {
        kind: "subscription",
        plan_code: planCode,
        subscription_id: subscriptionId,
        duration_days: plan.duration_days,
        mode: cinetpayMode(),
      },
    });

    // Récupère info user pour CinetPay
    const { data: profile } = await svc
      .from("profiles")
      .select("full_name, phone, email")
      .eq("id", user.id)
      .maybeSingle();
    const fullName = (profile as { full_name?: string } | null)?.full_name || "Utilisateur";
    const [firstName, ...rest] = fullName.split(" ");
    const lastName = rest.join(" ") || firstName;
    const email = (profile as { email?: string } | null)?.email
      || `${user.id.slice(0, 8)}@soutra-playce.local`;
    const phone = (profile as { phone?: string } | null)?.phone || "";

    const init = await initializeTransaction({
      transaction_id: reference,
      amount: plan.amount_xof,
      currency: "XOF",
      description: `Abonnement Soutra-Pay ${plan.name}`,
      return_url: RETURN_URL,
      notify_url: NOTIFY_URL,
      customer_name: firstName.slice(0, 50) || "User",
      customer_surname: lastName.slice(0, 50) || "Soutra",
      customer_email: email,
      customer_phone_number: phone,
      customer_country: "CI",
      customer_city: "Abidjan",
      customer_state: "CI",
      customer_zip_code: "00000",
      customer_address: "N/A",
      channels: "ALL",
      metadata: reference.slice(0, 100),
    });

    return jsonResponse({
      status: "pending",
      payment_url: init.data?.payment_url,
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
