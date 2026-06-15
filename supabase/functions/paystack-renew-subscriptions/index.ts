// ============================================================================
// paystack-renew-subscriptions — cron daily des renouvellements auto.
//
// Pour chaque subscription à renouveler (auto_renew=true, échéance dans les
// 24h, plan != free, authorization_code stockée), invoque Paystack
// /transaction/charge_authorization. Si success → étend la période via la
// RPC renew_subscription_success. Si fail → status='past_due' + event
// subscribe_failed (déclenche notif push/email).
//
// Authentification : Bearer SUPABASE_SERVICE_ROLE_KEY (appelé par pg_cron).
// ============================================================================

import { jsonResponse, serviceClient } from "../_shared/supabase.ts";
import { chargeAuthorization, toSubunit } from "../_shared/paystack.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface RenewRow {
  subscription_id: string;
  user_id: string;
  plan_code: string;
  billing_period: "monthly" | "yearly";
  current_period_end: string;
  authorization_code: string;
  amount_xof: number;
  card_brand: string | null;
  card_last4: string | null;
}

Deno.serve(async (req) => {
  const auth = req.headers.get("Authorization") ?? "";
  if (auth !== `Bearer ${SERVICE_ROLE}`) {
    return jsonResponse({ error: "Non autorisé" }, 401);
  }

  const svc = serviceClient();
  let success = 0;
  let failed = 0;
  let skipped = 0;
  const errors: string[] = [];

  try {
    const { data: rows, error: scanErr } = await svc.rpc(
      "list_subscriptions_to_renew",
      { p_horizon_hours: 24 },
    );
    if (scanErr) {
      console.error("[renew] scan error:", scanErr);
      return jsonResponse({ error: "Scan impossible" }, 500);
    }
    const toRenew = (rows ?? []) as RenewRow[];

    for (const r of toRenew) {
      // Email pour le reçu Paystack
      const { data: profile } = await svc
        .from("profiles")
        .select("email")
        .eq("id", r.user_id)
        .maybeSingle();
      const email = (profile as { email?: string } | null)?.email
        || `${r.user_id}@users.soutra-playce.app`;

      const reference = `sp-sub-renew-${crypto.randomUUID()}`;

      try {
        const result = await chargeAuthorization({
          email,
          amount: toSubunit(r.amount_xof),
          authorization_code: r.authorization_code,
          currency: "XOF",
          reference,
          metadata: {
            purpose: "subscription_renewal",
            user_id: r.user_id,
            subscription_id: r.subscription_id,
            plan_code: r.plan_code,
            billing_period: r.billing_period,
          },
        });

        if (result.data.status === "success") {
          const { error: renewErr } = await svc.rpc(
            "renew_subscription_success",
            {
              p_subscription_id: r.subscription_id,
              p_paid_amount_xof: r.amount_xof,
              p_paystack_ref: reference,
            },
          );
          if (renewErr) {
            console.error("[renew] success rpc:", renewErr);
            errors.push(`renew_success(${r.subscription_id}): ${renewErr.message}`);
            failed++;
          } else {
            success++;
          }
        } else {
          // Paiement refusé (carte expirée, fonds insuffisants, etc.)
          await svc.rpc("renew_subscription_failed", {
            p_subscription_id: r.subscription_id,
            p_reason: result.data.gateway_response || result.data.status,
          });
          failed++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[renew] paystack:", msg);
        // Marquer comme échoué pour déclencher la notif et éviter de re-tenter
        // dans les 12h (anti-spam dans list_subscriptions_to_renew).
        await svc.rpc("renew_subscription_failed", {
          p_subscription_id: r.subscription_id,
          p_reason: msg.slice(0, 200),
        });
        errors.push(`charge(${r.subscription_id}): ${msg.slice(0, 100)}`);
        failed++;
      }
    }

    return jsonResponse({
      ok: true,
      scanned: toRenew.length,
      success,
      failed,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error("[renew] fatal:", err);
    return jsonResponse({ error: "Erreur interne" }, 500);
  }
});

// Référence non utilisée mais importée pour le lint Deno bundler
void SUPABASE_URL;
