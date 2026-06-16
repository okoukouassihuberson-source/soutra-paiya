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
          : `Crédit sur ton wallet — merci pour ta fidélité Soutra-Playce.`,
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

  return out;
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
    const notifs = await buildNotifications(svc, table, record, oldRecord);
    if (notifs.length === 0) {
      return jsonResponse({ ignored: true });
    }

    // Récupère les jetons de tous les destinataires.
    const userIds = Array.from(new Set(notifs.map((n) => n.user_id)));
    const { data: tokens } = await svc
      .from("push_tokens")
      .select("token, user_id")
      .in("user_id", userIds);
    if (!tokens || tokens.length === 0) {
      return jsonResponse({ sent: 0, reason: "no_tokens" });
    }

    const tokensByUser = new Map<string, string[]>();
    for (const t of tokens as Array<{ token: string; user_id: string }>) {
      const arr = tokensByUser.get(t.user_id) || [];
      arr.push(t.token);
      tokensByUser.set(t.user_id, arr);
    }

    // Construit une liste de messages aplatie (un par token).
    const messages = notifs.flatMap((n) => {
      const userTokens = tokensByUser.get(n.user_id) || [];
      return userTokens.map((tok) => ({
        to: tok,
        title: n.title,
        body: n.body.slice(0, 240), // Expo limite ~240 chars
        sound: "default",
        priority: "high",
        data: n.data || {},
      }));
    });

    if (messages.length === 0) {
      return jsonResponse({ sent: 0, reason: "no_tokens_for_targets" });
    }

    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(messages),
    });
    if (!res.ok) {
      console.error("[send-push] Expo:", res.status, await res.text());
    }
    return jsonResponse({ sent: messages.length, table });
  } catch (err) {
    // 200 pour éviter les renvois en boucle du webhook ; l'incident est loggé.
    console.error("[send-push] fatal:", err);
    return jsonResponse({ error: "interne" });
  }
});
