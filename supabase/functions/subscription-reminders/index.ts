// ============================================================================
// subscription-reminders — cron job daily des rappels d'expiration.
//
// Appelée par pg_cron (migration 0050) chaque jour à 09:00 UTC, OU par un cron
// externe (GitHub Actions, etc.). N'accepte que les appels authentifiés
// service_role pour éviter qu'un user externe ne déclenche les notifs.
//
// Flow :
//   1. Appelle list_expiring_subscriptions() → subs qui expirent dans 7 ou 1 j
//      ET qui n'ont pas déjà reçu le rappel correspondant
//   2. Pour chaque sub : log dans subscription_notifications (anti-spam) puis
//      invoque send-push avec un payload custom table='subscription_reminder'
//   3. Optionnel : envoie un email via Resend si RESEND_API_KEY configurée
//
// Retourne un résumé { scanned, sent_push, sent_email, errors }.
// ============================================================================

import { jsonResponse, serviceClient } from "../_shared/supabase.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY"); // optionnel
const RESEND_FROM = Deno.env.get("RESEND_FROM") ||
  "Soutra-Playce <noreply@soutra-paiya.com>";

interface ExpiringRow {
  subscription_id: string;
  user_id: string;
  plan_code: string;
  current_period_end: string;
  days_until: number;
  reminder_kind: "expiring_7d" | "expiring_1d";
}

Deno.serve(async (req) => {
  // Authentification stricte : seul le service_role peut déclencher.
  const auth = req.headers.get("Authorization") ?? "";
  if (auth !== `Bearer ${SERVICE_ROLE}`) {
    return jsonResponse({ error: "Non autorisé" }, 401);
  }

  const svc = serviceClient();

  try {
    // 1) Scan des subs qui expirent
    const { data: rows, error: scanErr } = await svc.rpc(
      "list_expiring_subscriptions",
    );
    if (scanErr) {
      console.error("[reminders] scan error:", scanErr);
      return jsonResponse({ error: "Scan impossible" }, 500);
    }
    const expiring = (rows ?? []) as ExpiringRow[];

    let sentPush = 0;
    let sentEmail = 0;
    let errors = 0;

    for (const r of expiring) {
      // 2) Log dans subscription_notifications (anti-spam dédupliqué)
      const { data: logResult, error: logErr } = await svc.rpc(
        "enqueue_subscription_notification",
        {
          p_user_id: r.user_id,
          p_subscription_id: r.subscription_id,
          p_kind: r.reminder_kind,
          p_payload: {
            plan_code: r.plan_code,
            current_period_end: r.current_period_end,
            days_until: r.days_until,
          },
        },
      );
      if (logErr) {
        console.error("[reminders] enqueue:", logErr);
        errors++;
        continue;
      }
      // Si la notif a déjà été envoyée, on ne renvoie pas.
      if ((logResult as { ok?: boolean })?.ok === false) {
        continue;
      }

      // 3) Push via l'Edge Function send-push
      try {
        const pushRes = await fetch(
          `${SUPABASE_URL}/functions/v1/send-push`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${SERVICE_ROLE}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              table: "subscription_reminder",
              record: {
                user_id: r.user_id,
                plan_code: r.plan_code,
                current_period_end: r.current_period_end,
                kind: r.reminder_kind,
              },
            }),
          },
        );
        if (pushRes.ok) sentPush++;
        else console.error("[reminders] push status:", pushRes.status);
      } catch (err) {
        console.error("[reminders] push error:", err);
        errors++;
      }

      // 4) Email via Resend (optionnel)
      if (RESEND_API_KEY) {
        try {
          // Récupérer l'email de l'utilisateur
          const { data: profile } = await svc
            .from("profiles")
            .select("email, full_name")
            .eq("id", r.user_id)
            .maybeSingle();
          const email = (profile as { email?: string } | null)?.email;
          const fullName =
            (profile as { full_name?: string } | null)?.full_name || "";
          if (!email) continue;

          const { data: plan } = await svc
            .from("subscription_plans")
            .select("display_name")
            .eq("code", r.plan_code)
            .maybeSingle();
          const planName =
            (plan as { display_name?: string } | null)?.display_name ||
            "Premium";
          const endDate = new Date(r.current_period_end).toLocaleDateString(
            "fr-FR",
            { day: "numeric", month: "long", year: "numeric" },
          );
          const subject = r.reminder_kind === "expiring_1d"
            ? `Ton abonnement ${planName} expire demain`
            : `Ton abonnement ${planName} expire dans 7 jours`;
          const html = renderReminderEmail({
            fullName,
            planName,
            endDate,
            kind: r.reminder_kind,
          });

          const emailRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: RESEND_FROM,
              to: [email],
              subject,
              html,
            }),
          });
          if (emailRes.ok) sentEmail++;
          else {
            const errBody = await emailRes.text();
            console.error("[reminders] email error:", emailRes.status, errBody);
          }
        } catch (err) {
          console.error("[reminders] email fatal:", err);
        }
      }
    }

    return jsonResponse({
      ok: true,
      scanned: expiring.length,
      sent_push: sentPush,
      sent_email: sentEmail,
      errors,
      resend_configured: !!RESEND_API_KEY,
    });
  } catch (err) {
    console.error("[reminders] fatal:", err);
    return jsonResponse({ error: "Erreur interne" }, 500);
  }
});

// Template HTML inline pour l'email de rappel. Volontairement simple et
// inline-CSS pour compatibilité maximale (Gmail, Outlook, mobiles).
function renderReminderEmail(p: {
  fullName: string;
  planName: string;
  endDate: string;
  kind: "expiring_7d" | "expiring_1d";
}): string {
  const greeting = p.fullName ? `Salut ${p.fullName.split(" ")[0]},` : "Salut,";
  const headline = p.kind === "expiring_1d"
    ? "Ton abonnement expire demain"
    : "Ton abonnement expire dans 7 jours";
  const cta = "https://soutra-playce.vercel.app/subscribe";
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><title>${headline}</title></head>
<body style="margin:0;padding:0;background:#0E1116;color:#E5E7EB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#0E1116;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background:#1A1F26;border-radius:16px;padding:32px;">
        <tr><td>
          <h1 style="margin:0 0 8px;font-size:14px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#FF6B1A;">Soutra-Playce</h1>
          <h2 style="margin:0 0 16px;font-size:24px;font-weight:800;color:#fff;">${headline}</h2>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#E5E7EB;">
            ${greeting}<br><br>
            Ton abonnement <strong style="color:#fff;">${p.planName}</strong> se termine le <strong style="color:#FF6B1A;">${p.endDate}</strong>.
          </p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.5;color:#9CA3AF;">
            Garde tes avantages — accès VVIP, concierge — en renouvelant ton abonnement en 1 clic.
          </p>
          <div style="text-align:center;margin:32px 0;">
            <a href="${cta}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#FF6B1A,#E5500D);color:#fff;text-decoration:none;font-weight:700;border-radius:999px;font-size:15px;">
              Renouveler maintenant
            </a>
          </div>
          <p style="margin:24px 0 0;font-size:12px;color:#6B7280;text-align:center;">
            Tu reçois cet email parce que tu as un abonnement actif sur Soutra-Playce.<br>
            Si tu n'es pas à l'origine de cet abonnement, ignore ce message.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
