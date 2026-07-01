// ============================================================================
// send-push — déclenche des notifications push (Expo Push API).
//
// Appelée par les Database Webhooks Supabase à chaque INSERT pertinent.
// Configuration : `verify_jwt = false` côté `supabase/config.toml`.
// L'authenticité est garantie par le header `Authorization: Bearer <service-role-key>`
// vérifié ci-dessous (toute autre source est rejetée).
//
// Événements pris en charge :
//   - messages              -> « X t'a envoyé un message »
//   - payment_requests      -> « X te demande Y FCFA »
//   - transactions          -> « Tu as reçu Y FCFA de X » (transferts P2P)
//   - profile_likes         -> « C'est un match avec X ! » (si like mutuel)
//   - post_comments         -> « X a commenté ton post »
//   - reservations (UPDATE) -> « Ta réservation chez X est confirmée »
// ============================================================================

import { jsonResponse, serviceClient } from "../_shared/supabase.ts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

function fmtXof(n: number): string {
  return Number(n).toLocaleString("fr-FR") + " FCFA";
}

// Détermine quoi envoyer à qui, en fonction du record. Renvoie une liste
// (souvent 1, parfois 2 dans le cas du match mutuel) de notifications à pousser.
async function buildNotifications(
  svc: ReturnType<typeof serviceClient>,
  table: string,
  record: Record<string, unknown>,
  oldRecord: Record<string, unknown> | null,
): Promise<Array<{ user_id: string; title: string; body: string; data?: Record<string, unknown> }>> {
  const out: Array<{ user_id: string; title: string; body: string; data?: Record<string, unknown> }> = [];

  if (table === "messages") {
    const r = record as { chat_id: string; sender_id: string };
    // Récupère les autres membres du chat (les destinataires : tout le monde sauf sender).
    const { data: members } = await svc
      .from("chat_members")
      .select("user_id")
      .eq("chat_id", r.chat_id);
    if (!members) return out;
    const { data: sender } = await svc
      .from("profiles")
      .select("full_name, phone")
      .eq("id", r.sender_id)
      .maybeSingle();
    const senderName = sender?.full_name || sender?.phone || "Quelqu'un";
    for (const m of members as Array<{ user_id: string }>) {
      if (m.user_id === r.sender_id) continue;
      out.push({
        user_id: m.user_id,
        title: senderName,
        body: typeof record.body === "string" && record.body ? record.body : "Nouveau message",
        data: { route: "/chat/" + r.chat_id },
      });
    }
    return out;
  }

  if (table === "payment_requests") {
    const r = record as { payer_id?: string; requester_id?: string; amount_xof?: number; status?: string };
    if (r.status !== "pending" || !r.payer_id || !r.requester_id) return out;
    const { data: requester } = await svc
      .from("profiles")
      .select("full_name, phone")
      .eq("id", r.requester_id)
      .maybeSingle();
    out.push({
      user_id: r.payer_id,
      title: "Nouvelle demande d'argent",
      body: `${requester?.full_name || requester?.phone || "Quelqu'un"} te demande ${fmtXof(r.amount_xof || 0)}`,
      data: { route: "/requests" },
    });
    return out;
  }

  if (table === "transactions") {
    const r = record as {
      type?: string;
      user_id?: string;
      counterparty_id?: string;
      amount_xof?: number;
      status?: string;
      metadata?: Record<string, unknown> | null;
    };

    // 1) Transfer P2P reçu → "Argent reçu 💰"
    if (r.type === "transfer" && r.status === "success" && r.counterparty_id && r.user_id) {
      const { data: sender } = await svc
        .from("profiles")
        .select("full_name, phone")
        .eq("id", r.user_id)
        .maybeSingle();
      out.push({
        user_id: r.counterparty_id,
        title: "Argent reçu 💰",
        body: `Tu as reçu ${fmtXof(r.amount_xof || 0)} de ${sender?.full_name || sender?.phone || "un contact"}`,
        data: { route: "/(tabs)/wallet" },
      });
      return out;
    }

    // 2) Cashback automatique (migration 0051) → "+X FCFA cashback ✨"
    //    Le trigger SQL tg_transactions_apply_cashback insère une nouvelle
    //    tx type='cashback' status='success' juste après chaque paiement
    //    marchand confirmé. On notifie le bénéficiaire avec le plan source.
    if (r.type === "cashback" && r.status === "success" && r.user_id) {
      const planCode = typeof r.metadata?.plan_code === "string"
        ? (r.metadata!.plan_code as string)
        : null;
      const planName = await getPlanDisplayName(svc, planCode ?? undefined);
      const bps = typeof r.metadata?.cashback_bps === "number"
        ? (r.metadata!.cashback_bps as number)
        : null;
      const rate = bps != null
        ? `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)} %`
        : null;
      out.push({
        user_id: r.user_id,
        title: `+${fmtXof(r.amount_xof || 0)} cashback ✨`,
        body: rate
          ? `Plan ${planName} (${rate}) crédité sur ton wallet.`
          : `Crédit sur ton wallet — merci pour ta fidélité Soutra-Explore.`,
        data: { route: "/cashback", kind: "cashback_credit" },
      });
      return out;
    }

    return out;
  }

  if (table === "profile_likes") {
    const r = record as { liker_id?: string; liked_id?: string; action?: string };
    if (r.action !== "like" || !r.liker_id || !r.liked_id) return out;
    // Match mutuel ? On vérifie si l'autre nous a aussi liké.
    const { data: reverse } = await svc
      .from("profile_likes")
      .select("action")
      .eq("liker_id", r.liked_id)
      .eq("liked_id", r.liker_id)
      .maybeSingle();
    if (!reverse || reverse.action !== "like") return out; // pas un match
    const { data: profiles } = await svc
      .from("profiles")
      .select("id, full_name, phone")
      .in("id", [r.liker_id, r.liked_id]);
    const byId = new Map((profiles || []).map((p: { id: string }) => [p.id, p]));
    const nameOf = (id: string) => {
      const p = byId.get(id) as { full_name?: string; phone?: string } | undefined;
      return p?.full_name || p?.phone || "quelqu'un";
    };
    out.push({
      user_id: r.liker_id,
      title: "C'est un match ! 🎉",
      body: `Toi et ${nameOf(r.liked_id)} vous êtes likés mutuellement.`,
      data: { route: "/matches" },
    });
    out.push({
      user_id: r.liked_id,
      title: "C'est un match ! 🎉",
      body: `Toi et ${nameOf(r.liker_id)} vous êtes likés mutuellement.`,
      data: { route: "/matches" },
    });
    return out;
  }

  if (table === "post_comments") {
    const r = record as { post_id?: string; user_id?: string };
    if (!r.post_id || !r.user_id) return out;
    const { data: post } = await svc
      .from("posts")
      .select("user_id")
      .eq("id", r.post_id)
      .maybeSingle();
    if (!post || post.user_id === r.user_id) return out; // pas de notif pour soi-même
    const { data: author } = await svc
      .from("profiles")
      .select("full_name, phone")
      .eq("id", r.user_id)
      .maybeSingle();
    out.push({
      user_id: post.user_id,
      title: "Nouveau commentaire",
      body: `${author?.full_name || author?.phone || "Quelqu'un"} a commenté ton post.`,
      data: { route: "/(tabs)/social" },
    });
    return out;
  }

  if (table === "reservations" && oldRecord) {
    const r = record as { id?: string; venue_id?: string; user_id?: string; status?: string; date_time?: string };
    const old = oldRecord as { status?: string };
    if (r.status !== "confirmed" || old.status === "confirmed" || !r.user_id || !r.venue_id) return out;
    const { data: venue } = await svc
      .from("venues")
      .select("name")
      .eq("id", r.venue_id)
      .maybeSingle();
    const date = r.date_time ? new Date(r.date_time).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
    out.push({
      user_id: r.user_id,
      title: "Réservation confirmée ✅",
      body: `${venue?.name || "Le restaurant"} t'attend ${date ? "le " + date : "à la date prévue"}.`,
      data: { route: "/(tabs)/explore" },
    });
    return out;
  }

  // ──────────────────────────────────────────────────────────────────────
  //  ABONNEMENTS
  // ──────────────────────────────────────────────────────────────────────

  // Insert d'un nouvel abonnement actif (paiement Paystack confirmé).
  // Filtre miroir du trigger SQL : status='active' et plan != free.
  if (table === "subscriptions" && !oldRecord) {
    const r = record as {
      id?: string;
      user_id?: string;
      plan_code?: string;
      status?: string;
      billing_period?: string;
      current_period_end?: string;
    };
    if (r.status !== "active" || r.plan_code === "free" || !r.user_id) return out;
    const planName = await getPlanDisplayName(svc, r.plan_code);
    const periodLabel = r.billing_period === "yearly" ? "annuel" : "mensuel";
    out.push({
      user_id: r.user_id,
      title: `Bienvenue dans ${planName} 🎉`,
      body: `Ton abonnement ${planName} (${periodLabel}) est activé. Profite de tes avantages dès maintenant !`,
      data: { route: "/account", kind: "subscribe_success" },
    });
    return out;
  }

  // UPDATE d'une subscription : on notifie sur résiliation (effective ou
  // programmée) et sur réactivation.
  if (table === "subscriptions" && oldRecord) {
    const r = record as {
      id?: string;
      user_id?: string;
      plan_code?: string;
      status?: string;
      cancel_at_period_end?: boolean;
      current_period_end?: string;
    };
    const old = oldRecord as { status?: string; cancel_at_period_end?: boolean };
    if (!r.user_id) return out;
    const planName = await getPlanDisplayName(svc, r.plan_code);
    const endDate = r.current_period_end
      ? new Date(r.current_period_end).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })
      : "";

    if (r.status === "cancelled" && old.status !== "cancelled") {
      out.push({
        user_id: r.user_id,
        title: "Abonnement résilié",
        body: `Ton abonnement ${planName} a été résilié. Tu peux te réabonner à tout moment.`,
        data: { route: "/subscribe", kind: "cancelled" },
      });
      return out;
    }

    if (r.cancel_at_period_end === true && old.cancel_at_period_end !== true && r.status === "active") {
      out.push({
        user_id: r.user_id,
        title: "Résiliation programmée",
        body: `Ton abonnement ${planName} restera actif jusqu'au ${endDate}.`,
        data: { route: "/account", kind: "cancel_scheduled" },
      });
      return out;
    }

    if (r.cancel_at_period_end === false && old.cancel_at_period_end === true) {
      out.push({
        user_id: r.user_id,
        title: "Abonnement réactivé ✨",
        body: `Bon retour ! Ton abonnement ${planName} continue jusqu'au ${endDate}.`,
        data: { route: "/account", kind: "reactivated" },
      });
      return out;
    }
    return out;
  }

  // Payload custom envoyé par l'Edge Function subscription-reminders pour
  // les rappels J-7 / J-1. La forme est :
  //   { table: 'subscription_reminder',
  //     record: { user_id, plan_code, current_period_end, kind: 'expiring_7d'|'expiring_1d' } }
  if (table === "subscription_reminder") {
    const r = record as {
      user_id?: string;
      plan_code?: string;
      current_period_end?: string;
      kind?: string;
    };
    if (!r.user_id || !r.kind) return out;
    const planName = await getPlanDisplayName(svc, r.plan_code);
    const endDate = r.current_period_end
      ? new Date(r.current_period_end).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
      : "bientôt";

    if (r.kind === "expiring_7d") {
      out.push({
        user_id: r.user_id,
        title: "Ton abonnement expire dans 7 jours",
        body: `${planName} se renouvelle le ${endDate}. Garde tes avantages !`,
        data: { route: "/subscribe", kind: "expiring_7d" },
      });
    } else if (r.kind === "expiring_1d") {
      out.push({
        user_id: r.user_id,
        title: "Ton abonnement expire demain ⏰",
        body: `${planName} se termine le ${endDate}. Renouvelle pour conserver ton cashback.`,
        data: { route: "/subscribe", kind: "expiring_1d" },
      });
    }
    return out;
  }

  // ──────────────────────────────────────────────────────────────────────
  //  ORDERS (boutique — migration 0055)
  //  INSERT  → notif au MERCHANT (venue owner) : "Nouvelle commande"
  //  UPDATE  → notif au CLIENT (user_id) : transition de statut
  // ──────────────────────────────────────────────────────────────────────

  if (table === "orders" && !oldRecord) {
    const r = record as {
      id?: string;
      order_number?: string;
      user_id?: string;
      venue_id?: string;
      items_count?: number;
      total_xof?: number;
      delivery_method?: string;
    };
    if (!r.venue_id || !r.id) return out;

    const { data: venue } = await svc
      .from("venues")
      .select("owner_id, name")
      .eq("id", r.venue_id)
      .maybeSingle();
    const ownerId = (venue as { owner_id?: string } | null)?.owner_id;
    if (!ownerId) return out;

    const deliveryIcon = r.delivery_method === "delivery" ? "🚚" : "🏪";
    out.push({
      user_id: ownerId,
      title: `Nouvelle commande ${deliveryIcon}`,
      body: `${r.order_number || ""} · ${r.items_count || 0} article(s) · ${fmtXof(r.total_xof || 0)}`,
      data: { route: "/pro?tab=shop-orders", kind: "new_order", order_id: r.id },
    });
    return out;
  }

  if (table === "orders" && oldRecord) {
    const r = record as {
      id?: string;
      order_number?: string;
      user_id?: string;
      venue_id?: string;
      status?: string;
      total_xof?: number;
    };
    const old = oldRecord as { status?: string };
    if (!r.user_id || !r.id || !r.status) return out;
    // Skip si pas de transition de statut
    if (r.status === old.status) return out;

    const { data: venue } = await svc
      .from("venues")
      .select("name")
      .eq("id", r.venue_id || "")
      .maybeSingle();
    const venueName = (venue as { name?: string } | null)?.name || "Le marchand";

    let title: string | null = null;
    let body: string | null = null;
    switch (r.status) {
      case "confirmed":
        title = "Commande confirmée ✓";
        body = `${venueName} a reçu ton paiement pour ${r.order_number || ""}.`;
        break;
      case "preparing":
        title = "Préparation en cours";
        body = `${venueName} prépare ta commande ${r.order_number || ""}.`;
        break;
      case "ready":
        title = "Commande prête 📦";
        body = `${r.order_number || "Ta commande"} est prête chez ${venueName}.`;
        break;
      case "delivered":
        title = "Commande livrée 🎉";
        body = `Bon usage ! Note ton expérience avec ${venueName}.`;
        break;
      case "cancelled":
        title = "Commande annulée";
        body = `${r.order_number || "Ta commande"} chez ${venueName} a été annulée.`;
        break;
      case "refunded":
        title = "Commande remboursée";
        body = `${fmtXof(r.total_xof || 0)} de ${r.order_number || ""} ont été remboursés.`;
        break;
      default:
        return out;
    }

    out.push({
      user_id: r.user_id,
      title,
      body,
      data: { route: "/orders", kind: "order_status", order_id: r.id, status: r.status },
    });
    return out;
  }

  return out;
}

/* ────────────────────────────────────────────────────────────────────── *
 *  EMAILS — parallèle à buildNotifications, dispatch sur le même payload.
 *  Skip silencieux si RESEND_API_KEY absente.
 * ────────────────────────────────────────────────────────────────────── */

interface EmailJob {
  user_id: string;
  subject: string;
  html: string;
  // Pour anti-doublon via subscription_notifications.
  dedupe_kind?: "subscribe_success";
  dedupe_subscription_id?: string;
}

async function buildEmails(
  svc: ReturnType<typeof serviceClient>,
  table: string,
  record: Record<string, unknown>,
  oldRecord: Record<string, unknown> | null,
): Promise<EmailJob[]> {
  const out: EmailJob[] = [];

  // INSERT subscriptions avec status=active et plan != free → email
  // de confirmation de souscription.
  if (table === "subscriptions" && !oldRecord) {
    const r = record as {
      id?: string;
      user_id?: string;
      plan_code?: string;
      status?: string;
      billing_period?: string;
      current_period_end?: string;
      metadata?: { paid_amount_xof?: number } | null;
    };
    if (r.status !== "active" || r.plan_code === "free" || !r.user_id || !r.id) {
      return out;
    }
    const planName = await getPlanDisplayName(svc, r.plan_code);
    // Récupère le montant payé depuis la transaction Paystack associée
    // (metadata.paid_amount_xof posée par paystack_settle_subscription).
    const paidXof = Number(r.metadata?.paid_amount_xof ?? 0);
    const endIso = r.current_period_end ?? null;

    out.push({
      user_id: r.user_id,
      subject: `Bienvenue dans ${planName} — Confirmation de paiement`,
      html: renderSubscribeSuccessEmail({
        planName,
        billingPeriod: r.billing_period ?? "monthly",
        paidXof,
        currentPeriodEnd: endIso,
      }),
      dedupe_kind: "subscribe_success",
      dedupe_subscription_id: r.id,
    });
    return out;
  }

  return out;
}

const fmtFr = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric", month: "long", year: "numeric",
  });

function renderSubscribeSuccessEmail(p: {
  planName: string;
  billingPeriod: string;
  paidXof: number;
  currentPeriodEnd: string | null;
}): string {
  const periodLabel = p.billingPeriod === "yearly"
    ? "Annuel (365 jours)"
    : "Mensuel (30 jours)";
  const endLine = p.currentPeriodEnd
    ? `Prochain renouvellement le <strong style="color:#fff;">${fmtFr(p.currentPeriodEnd)}</strong>.`
    : "";
  const amountLine = p.paidXof > 0
    ? `<tr><td style="padding:8px 0;color:#9CA3AF;">Montant payé</td><td style="padding:8px 0;text-align:right;color:#fff;font-weight:700;">${fmtXof(p.paidXof)}</td></tr>`
    : "";
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><title>Bienvenue dans ${p.planName}</title></head>
<body style="margin:0;padding:0;background:#0E1116;color:#E5E7EB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#0E1116;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background:#1A1F26;border-radius:16px;padding:32px;">
        <tr><td>
          <h1 style="margin:0 0 8px;font-size:14px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#10b981;">✓ Paiement confirmé</h1>
          <h2 style="margin:0 0 16px;font-size:24px;font-weight:800;color:#fff;">Bienvenue dans ${p.planName} 🎉</h2>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#E5E7EB;">
            Ton abonnement <strong style="color:#fff;">${p.planName}</strong> est activé. Tu peux profiter de tous tes avantages dès maintenant — cashback, accès VVIP, concierge IA et plus.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#0E1116;border-radius:12px;padding:16px 20px;margin:0 0 24px;font-size:14px;">
            <tr><td style="padding:8px 0;color:#9CA3AF;">Plan</td><td style="padding:8px 0;text-align:right;color:#fff;font-weight:700;">${p.planName}</td></tr>
            <tr><td style="padding:8px 0;color:#9CA3AF;">Période</td><td style="padding:8px 0;text-align:right;color:#fff;font-weight:700;">${periodLabel}</td></tr>
            ${amountLine}
          </table>
          <p style="margin:0 0 24px;font-size:14px;line-height:1.5;color:#9CA3AF;">
            ${endLine}
          </p>
          <div style="text-align:center;margin:32px 0;">
            <a href="https://soutra-playce.vercel.app/account" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#FF6B1A,#E5500D);color:#fff;text-decoration:none;font-weight:700;border-radius:999px;font-size:15px;">
              Voir mon compte
            </a>
          </div>
          <p style="margin:24px 0 0;font-size:12px;color:#6B7280;text-align:center;">
            Une question ? Réponds à cet email ou contacte <strong>support@soutra-paiya.com</strong>.
          </p>
          <p style="margin:8px 0 0;font-size:11px;color:#6B7280;text-align:center;">
            Cet email confirme un paiement effectué sur ton compte Soutra-Explore.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function fmtXof(n: number): string {
  return new Intl.NumberFormat("fr-FR").format(Math.round(n)) + " FCFA";
}

/* ────────────────────────────────────────────────────────────────────── *
 *  Resend send helper                                                     *
 * ────────────────────────────────────────────────────────────────────── */

async function sendResendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<{ ok: boolean; error?: string }> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return { ok: false, error: "RESEND_API_KEY_MISSING" };
  const from = Deno.env.get("RESEND_FROM")
    || "Soutra-Explore <noreply@soutra-paiya.com>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      return { ok: false, error: `${res.status} ${errBody.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// Lookup du display_name d'un plan, avec fallback sur le code si manquant.
async function getPlanDisplayName(
  svc: ReturnType<typeof serviceClient>,
  planCode: string | undefined,
): Promise<string> {
  if (!planCode) return "Premium";
  const { data: plan } = await svc
    .from("subscription_plans")
    .select("display_name")
    .eq("code", planCode)
    .maybeSingle();
  return (plan as { display_name?: string } | null)?.display_name || "Premium";
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Méthode non autorisée" }, 405);
  }

  const auth = req.headers.get("Authorization") ?? "";
  if (auth !== `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`) {
    return jsonResponse({ error: "Non autorisé" }, 401);
  }

  const payload = await req.json().catch(() => null);
  const table = payload?.table;
  const record = payload?.record;
  const oldRecord = payload?.old_record ?? null;
  if (!table || !record) {
    return jsonResponse({ ignored: "payload invalide" });
  }

  try {
    const svc = serviceClient();
    const [notifs, emails] = await Promise.all([
      buildNotifications(svc, table, record, oldRecord),
      buildEmails(svc, table, record, oldRecord),
    ]);

    if (notifs.length === 0 && emails.length === 0) {
      return jsonResponse({ ignored: true });
    }

    let pushSent = 0;
    let emailSent = 0;

    // ─────────── PUSH ───────────
    if (notifs.length > 0) {
      const userIds = Array.from(new Set(notifs.map((n) => n.user_id)));
      const { data: tokens } = await svc
        .from("push_tokens")
        .select("token, user_id")
        .in("user_id", userIds);

      if (tokens && tokens.length > 0) {
        const tokensByUser = new Map<string, string[]>();
        for (const t of tokens as Array<{ token: string; user_id: string }>) {
          const arr = tokensByUser.get(t.user_id) || [];
          arr.push(t.token);
          tokensByUser.set(t.user_id, arr);
        }
        const messages = notifs.flatMap((n) => {
          const userTokens = tokensByUser.get(n.user_id) || [];
          return userTokens.map((tok) => ({
            to: tok,
            title: n.title,
            body: n.body.slice(0, 240),
            sound: "default",
            priority: "high",
            data: n.data || {},
          }));
        });
        if (messages.length > 0) {
          const res = await fetch(EXPO_PUSH_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify(messages),
          });
          if (!res.ok) {
            console.error("[send-push] Expo:", res.status, await res.text());
          } else {
            pushSent = messages.length;
          }
        }
      }
    }

    // ─────────── EMAILS via Resend ───────────
    for (const job of emails) {
      // Anti-doublon : enqueue_subscription_notification (migration 0050)
      // utilise un UNIQUE INDEX sur (user_id, subscription_id, kind) —
      // si déjà envoyé, ALREADY_SENT et on skip silencieusement.
      if (job.dedupe_kind && job.dedupe_subscription_id) {
        const { data: dedupeRes } = await svc.rpc(
          "enqueue_subscription_notification",
          {
            p_user_id: job.user_id,
            p_subscription_id: job.dedupe_subscription_id,
            p_kind: job.dedupe_kind,
            p_payload: { channel: "email" },
          },
        );
        if ((dedupeRes as { ok?: boolean } | null)?.ok === false) {
          // Déjà envoyé pour cette subscription — skip.
          continue;
        }
      }

      // Récupère l'email du destinataire.
      const { data: profile } = await svc
        .from("profiles")
        .select("email")
        .eq("id", job.user_id)
        .maybeSingle();
      const email = (profile as { email?: string } | null)?.email;
      if (!email) {
        console.log(`[send-push] no email for user ${job.user_id}, skip email`);
        continue;
      }

      const result = await sendResendEmail(email, job.subject, job.html);
      if (result.ok) {
        emailSent++;
      } else {
        console.error(`[send-push] email error for ${job.user_id}:`, result.error);
      }
    }

    return jsonResponse({
      sent: pushSent,
      email_sent: emailSent,
      table,
      resend_configured: !!Deno.env.get("RESEND_API_KEY"),
    });
  } catch (err) {
    // 200 pour éviter les renvois en boucle du webhook ; l'incident est loggé.
    console.error("[send-push] fatal:", err);
    return jsonResponse({ error: "interne" });
  }
});
