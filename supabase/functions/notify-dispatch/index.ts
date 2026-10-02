// ============================================================================
// notify-dispatch — envoie les notifications en attente vers les canaux externes
// (migration 0089) : push Expo, push navigateur (PWA), email (Resend).
// SMS / WhatsApp : adaptateur prévu, fournisseur non configuré (statut « skipped »).
//
// Déclenchement : pg_cron toutes les 15 min (migration 0089) ou cron externe ;
// peut aussi être appelée par un Database Webhook sur notification_outbox (INSERT)
// pour un envoi quasi immédiat. Chaque appel :
//   1. génère les rappels dus (send_tourism_reminders, idempotent)
//   2. consomme la file par lots (claim_notification_outbox, FOR UPDATE SKIP LOCKED)
// Authentification : Authorization = Bearer <service_role_key> (verify_jwt = false).
// Variables : RESEND_API_KEY, RESEND_FROM (email) ; VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
//             VAPID_SUBJECT (push navigateur) ; SITE_URL (liens des emails).
// ============================================================================
import { jsonResponse, serviceClient } from "../_shared/supabase.ts";
import {
  type OutboxRow,
  type Result,
  sendEmail,
  sendExpoPush,
  sendUnconfigured,
  sendWebPush,
} from "../_shared/notify.ts";

const BATCH = 50;
const MAX_BATCHES = 4; // 200 envois max par appel : le cron suivant reprend le reste

export async function handle(req: Request): Promise<Response> {
  if (req.method !== "POST") return jsonResponse({ error: "Méthode non autorisée" }, 405);
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!key || (req.headers.get("Authorization") ?? "") !== `Bearer ${key}`) {
    return jsonResponse({ error: "Non autorisé" }, 401);
  }

  const svc = serviceClient();
  const siteUrl = Deno.env.get("SITE_URL") || "https://soutra-paiya.vercel.app";
  const stats = { reminders: 0, sent: 0, skipped: 0, failed: 0 };

  const { data: rem, error: remErr } = await svc.rpc("send_tourism_reminders");
  if (remErr) console.error("[notify-dispatch] reminders:", remErr);
  else stats.reminders = Number((rem as { sent?: number } | null)?.sent ?? 0);

  for (let b = 0; b < MAX_BATCHES; b++) {
    const { data, error } = await svc.rpc("claim_notification_outbox", { p_limit: BATCH });
    if (error) { console.error("[notify-dispatch] claim:", error); break; }
    const rows = (data ?? []) as OutboxRow[];
    if (rows.length === 0) break;

    for (const row of rows) {
      let res: Result;
      try {
        res = row.channel === "push" ? await sendExpoPush(svc, row)
          : row.channel === "webpush" ? await sendWebPush(svc, row, siteUrl)
          : row.channel === "email" ? await sendEmail(row, siteUrl)
          : sendUnconfigured(row);
      } catch (e) {
        res = { status: "failed", error: e instanceof Error ? e.message : String(e) };
      }
      stats[res.status]++;
      const { error: doneErr } = await svc.rpc("complete_notification_outbox", {
        p_id: row.outbox_id, p_status: res.status, p_error: res.error ?? null,
      });
      if (doneErr) console.error("[notify-dispatch] complete:", doneErr);
    }
    if (rows.length < BATCH) break;
  }
  return jsonResponse({ ok: true, ...stats });
}

if (import.meta.main) Deno.serve(handle);
