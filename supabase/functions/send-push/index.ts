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
    const r = record as { type?: string; user_id?: string; counterparty_id?: string; amount_xof?: number; status?: string };
    if (r.type !== "transfer" || r.status !== "success" || !r.counterparty_id || !r.user_id) return out;
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

  return out;
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
