// ============================================================================
// Adaptateurs de canaux pour notify-dispatch (migration 0089).
// Chaque adaptateur renvoie { status, error? } :
//   sent    : remis au fournisseur
//   skipped : canal non configuré / pas de destination (pas de nouvelle tentative)
//   failed  : erreur transitoire (la file réessaie avec attente exponentielle)
// ============================================================================

export interface OutboxRow {
  outbox_id: number;
  notification_id: string;
  user_id: string;
  channel: "push" | "webpush" | "email" | "sms" | "whatsapp";
  attempts: number;
  title: string;
  body: string | null;
  route: string | null;
  meta: Record<string, unknown> | null;
  email: string | null;
  phone: string | null;
}

export interface Result {
  status: "sent" | "skipped" | "failed";
  error?: string;
}

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Lien web sûr : chemin interne uniquement (jamais d'URL externe, ni de route mobile « /(tabs)… »). */
export function webLink(route: string | null, siteUrl: string): string | null {
  if (!route || !route.startsWith("/") || route.startsWith("//") || route.startsWith("/(")) return null;
  return siteUrl.replace(/\/$/, "") + route;
}

export function buildEmail(row: OutboxRow, siteUrl: string): { subject: string; html: string } {
  const link = webLink(row.route, siteUrl);
  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#f6f4f0;font-family:Arial,Helvetica,sans-serif;color:#111">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" style="max-width:520px;background:#fff;border-radius:16px;padding:28px">
<tr><td><p style="margin:0 0 4px;font-size:13px;color:#EA580C;font-weight:700">Soutra-Playce</p>
<h1 style="margin:0 0 12px;font-size:20px">${escapeHtml(row.title)}</h1>
${row.body ? `<p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#333">${escapeHtml(row.body)}</p>` : ""}
${link ? `<a href="${escapeHtml(link)}" style="display:inline-block;background:#FF6B1A;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:12px">Ouvrir</a>` : ""}
<p style="margin:24px 0 0;font-size:12px;color:#888">Vous recevez cet email car les notifications sont activées sur votre compte. Gérez vos préférences dans « Notifications » de votre espace.</p>
</td></tr></table></td></tr></table></body></html>`;
  return { subject: row.title, html };
}

export async function sendEmail(row: OutboxRow, siteUrl: string): Promise<Result> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return { status: "skipped", error: "RESEND_API_KEY manquante" };
  if (!row.email) return { status: "skipped", error: "pas d'adresse email" };
  const from = Deno.env.get("RESEND_FROM") || "Soutra-Playce <noreply@soutra-paiya.com>";
  const { subject, html } = buildEmail(row, siteUrl);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [row.email], subject, html }),
    });
    if (res.ok) return { status: "sent" };
    const t = (await res.text()).slice(0, 200);
    // 4xx (hors 429) : définitif, inutile de réessayer
    return { status: res.status >= 400 && res.status < 500 && res.status !== 429 ? "skipped" : "failed", error: `${res.status} ${t}` };
  } catch (e) {
    return { status: "failed", error: e instanceof Error ? e.message : String(e) };
  }
}

// deno-lint-ignore no-explicit-any
type Svc = any;

export async function sendExpoPush(svc: Svc, row: OutboxRow): Promise<Result> {
  const { data: tokens } = await svc.from("push_tokens").select("token").eq("user_id", row.user_id);
  const list = ((tokens ?? []) as { token: string }[]).map((t) => t.token).filter((t) => t.startsWith("ExponentPushToken") || t.startsWith("ExpoPushToken"));
  if (list.length === 0) return { status: "skipped", error: "aucun jeton push" };
  const messages = list.map((to) => ({
    to, title: row.title, body: row.body ?? "", sound: "default",
    data: { route: row.route, notification_id: row.notification_id },
  }));
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(messages),
    });
    if (!res.ok) return { status: res.status >= 500 || res.status === 429 ? "failed" : "skipped", error: `Expo ${res.status}` };
    // Nettoyage des jetons invalides (appareil désinstallé).
    const json = await res.json().catch(() => null) as { data?: { status: string; details?: { error?: string } }[] } | null;
    const dead: string[] = [];
    json?.data?.forEach((d, i) => { if (d.status === "error" && d.details?.error === "DeviceNotRegistered") dead.push(list[i]); });
    if (dead.length) await svc.from("push_tokens").delete().in("token", dead);
    return { status: "sent" };
  } catch (e) {
    return { status: "failed", error: e instanceof Error ? e.message : String(e) };
  }
}

export async function sendWebPush(svc: Svc, row: OutboxRow, siteUrl: string): Promise<Result> {
  const pub = Deno.env.get("VAPID_PUBLIC_KEY");
  const priv = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!pub || !priv) return { status: "skipped", error: "clés VAPID manquantes" };
  const { data: subs } = await svc.from("web_push_subscriptions").select("endpoint, p256dh, auth").eq("user_id", row.user_id);
  const list = (subs ?? []) as { endpoint: string; p256dh: string; auth: string }[];
  if (list.length === 0) return { status: "skipped", error: "aucun abonnement navigateur" };
  const webpush = (await import("npm:web-push@3.6.7")).default;
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") || "mailto:contact@soutra-paiya.com", pub, priv);
  const payload = JSON.stringify({ title: row.title, body: row.body ?? "", url: webLink(row.route, siteUrl) ? row.route : "/notifications", id: row.notification_id });
  let sent = 0; let lastErr = "";
  for (const s of list) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 24 });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await svc.from("web_push_subscriptions").delete().eq("endpoint", s.endpoint);
      else lastErr = e instanceof Error ? e.message : String(e);
    }
  }
  if (sent > 0) return { status: "sent" };
  return lastErr ? { status: "failed", error: lastErr } : { status: "skipped", error: "abonnements expirés" };
}

/** SMS / WhatsApp : canaux prévus par l'architecture, fournisseur à brancher (aucun envoi réel). */
export function sendUnconfigured(row: OutboxRow): Result {
  return { status: "skipped", error: `canal ${row.channel} : fournisseur non configuré` };
}
