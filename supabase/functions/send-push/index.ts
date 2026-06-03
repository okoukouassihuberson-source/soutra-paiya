// ============================================================================
// send-push — déclenche des notifications push (Expo Push API).
//
// Appelée par les Database Webhooks Supabase à chaque INSERT/UPDATE pertinent.
// Configuration : `verify_jwt = false` côté `supabase/config.toml`.
// L'authenticité est garantie par le header `Authorization: Bearer <service-role-key>`
// vérifié ci-dessous (toute autre source est rejetée).
//
// Événements UTILISATEUR (sans check de préférences, comportement historique) :
//   - messages              -> « X t'a envoyé un message »
//   - payment_requests      -> « X te demande Y FCFA »
//   - transactions (transfer P2P)  -> « Tu as reçu Y FCFA de X »
//   - profile_likes         -> « C'est un match avec X ! »
//   - post_comments         -> « X a commenté ton post »
//   - reservations confirmées (UPDATE) -> « Ta réservation chez X est confirmée »
//
// Événements PRO (avec check is_notification_enabled, migration 0045) :
//   - reservations (INSERT pending)        -> owner : « Nouvelle réservation »
//   - transactions (UPDATE success payment/split sur résa du venue)
//                                          -> owner : « Paiement reçu »
//   - venue_payouts (UPDATE pending→final) -> owner : « Retrait XOF : ✅/❌ »
//   - revenue_milestones_reached (INSERT)  -> owner : « Jalon XOF atteint 🎉 »
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

  // ═════════════════════════════════════════════════════════════════════════
  // EVENTS PRO (migration 0045) — chaque bloc appelle is_notification_enabled
  // avant de pousser. Le helper retourne true par défaut si l'owner n'a pas
  // encore créé sa row de préférences.
  // ═════════════════════════════════════════════════════════════════════════

  // ─── new_reservation : INSERT sur reservations (status='pending') ───────
  if (table === "reservations" && !oldRecord) {
    const r = record as { id?: string; venue_id?: string; user_id?: string; status?: string; date_time?: string; party_size?: number };
    if (r.status !== "pending" || !r.venue_id) return out;
    const { data: venue } = await svc
      .from("venues")
      .select("name, owner_id")
      .eq("id", r.venue_id)
      .maybeSingle();
    const ownerId = (venue as { owner_id?: string } | null)?.owner_id;
    if (!ownerId || ownerId === r.user_id) return out; // pas de notif au gérant qui réserve chez lui
    if (!(await isNotifEnabled(svc, ownerId, "new_reservation"))) return out;
    const date = r.date_time
      ? new Date(r.date_time).toLocaleDateString("fr-FR", {
          day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
        })
      : "à une date à confirmer";
    const partyTxt = r.party_size ? `${r.party_size} pers.` : "réservation";
    out.push({
      user_id: ownerId,
      title: "Nouvelle réservation 📅",
      body: `${partyTxt} ${date ? "le " + date : ""} chez ${(venue as { name?: string } | null)?.name || "ton établissement"}.`,
      data: { route: "/pro" },
    });
    return out;
  }

  // ─── payment_received : UPDATE transactions (status→success, type pay/split,
  //                       liée à une résa d'un venue dont je suis owner) ────
  if (table === "transactions" && oldRecord) {
    const r = record as { id?: string; type?: string; status?: string; amount_xof?: number; reservation_id?: string | null };
    const old = oldRecord as { status?: string };
    if (r.status !== "success" || old.status === "success") return out;
    if (r.type !== "payment" && r.type !== "split") return out;
    if (!r.reservation_id) return out;
    const { data: resa } = await svc
      .from("reservations")
      .select("venue_id")
      .eq("id", r.reservation_id)
      .maybeSingle();
    const venueId = (resa as { venue_id?: string } | null)?.venue_id;
    if (!venueId) return out;
    const { data: venue } = await svc
      .from("venues")
      .select("name, owner_id")
      .eq("id", venueId)
      .maybeSingle();
    const ownerId = (venue as { owner_id?: string } | null)?.owner_id;
    if (!ownerId) return out;
    if (!(await isNotifEnabled(svc, ownerId, "payment_received"))) return out;
    out.push({
      user_id: ownerId,
      title: "Paiement reçu 💳",
      body: `${fmtXof(r.amount_xof || 0)} encaissés pour ${(venue as { name?: string } | null)?.name || "ton établissement"}.`,
      data: { route: "/pro?tab=finances" },
    });
    return out;
  }

  // ─── payout_settled : UPDATE venue_payouts (status pending → final) ─────
  if (table === "venue_payouts" && oldRecord) {
    const r = record as { id?: string; venue_id?: string; owner_id?: string; amount_xof?: number; status?: string; failure_reason?: string | null };
    const old = oldRecord as { status?: string };
    if (old.status !== "pending") return out;
    if (r.status !== "success" && r.status !== "failed") return out;
    if (!r.owner_id) return out;
    if (!(await isNotifEnabled(svc, r.owner_id, "payout_settled"))) return out;
    const isOk = r.status === "success";
    const venueName = r.venue_id
      ? ((await svc.from("venues").select("name").eq("id", r.venue_id).maybeSingle()).data as { name?: string } | null)?.name
      : undefined;
    out.push({
      user_id: r.owner_id,
      title: isOk ? "Retrait validé ✅" : "Retrait échoué ❌",
      body: isOk
        ? `${fmtXof(r.amount_xof || 0)} ont été envoyés sur ton compte mobile money${venueName ? ` (${venueName})` : ""}.`
        : `Ton retrait de ${fmtXof(r.amount_xof || 0)} a échoué — le solde a été restauré${r.failure_reason ? `. ${r.failure_reason}` : "."}`,
      data: { route: r.venue_id ? `/venue-payout?venueId=${r.venue_id}` : "/pro?tab=finances" },
    });
    return out;
  }

  // ─── revenue_milestone : INSERT revenue_milestones_reached ──────────────
  if (table === "revenue_milestones_reached" && !oldRecord) {
    const r = record as { venue_id?: string; milestone_xof?: number; total_xof_at_trigger?: number; year_month?: string };
    if (!r.venue_id || !r.milestone_xof) return out;
    const { data: venue } = await svc
      .from("venues")
      .select("name, owner_id")
      .eq("id", r.venue_id)
      .maybeSingle();
    const ownerId = (venue as { owner_id?: string } | null)?.owner_id;
    if (!ownerId) return out;
    if (!(await isNotifEnabled(svc, ownerId, "revenue_milestone"))) return out;
    out.push({
      user_id: ownerId,
      title: "Jalon atteint 🎉",
      body: `${(venue as { name?: string } | null)?.name || "Ton établissement"} a atteint ${fmtXof(r.milestone_xof)} de revenus ce mois.`,
      data: { route: "/pro?tab=finances" },
    });
    return out;
  }

  return out;
}

// Helper : check préférences via RPC SECURITY DEFINER (migration 0045).
// Retourne true en cas d'erreur (fail open) pour ne pas bloquer une notif
// à cause d'un problème de DB transitoire.
async function isNotifEnabled(
  svc: ReturnType<typeof serviceClient>,
  userId: string,
  eventType: string,
): Promise<boolean> {
  try {
    const { data, error } = await svc.rpc("is_notification_enabled", {
      p_user_id: userId,
      p_event_type: eventType,
    });
    if (error) {
      console.error("[send-push] is_notification_enabled:", error);
      return true; // fail open
    }
    return Boolean(data ?? true);
  } catch (err) {
    console.error("[send-push] is_notification_enabled fatal:", err);
    return true;
  }
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
