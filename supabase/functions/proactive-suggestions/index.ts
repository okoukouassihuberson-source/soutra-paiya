// ============================================================================
// proactive-suggestions — IA proactive de Sia (Phase 7).
//
// Calcule jusqu'à 3 suggestions contextuelles pertinentes pour l'utilisateur
// courant, sans qu'il ait à demander. Sources analysées :
//   1. Payable balance gérant > 5000 XOF → "Tu peux retirer X de revenus"
//   2. Promo flash active à < 5km → "Promo Happy Hour à 800m"
//   3. Event qui démarre dans les 24h à < 10km → "Concert ce soir près de toi"
//   4. Dernière résa "arrived" > 30j → "Tu veux retourner chez {venue} ?"
//
// Chaque suggestion contient :
//   { id, kind, icon, title, body, action }
// où action est soit { type: 'navigate', route } soit
// { type: 'ask_sia', prompt } (pré-remplit un message dans le modal vocal).
//
// Endpoint REST simple (pas un tool Claude) : le mobile l'appelle au mount
// de l'écran assistant et affiche les cards en haut.
// ============================================================================
import {
  corsHeaders,
  getAuthUser,
  jsonResponse,
  serviceClient,
} from "../_shared/supabase.ts";

const FALLBACK_LAT = 5.348;
const FALLBACK_LNG = -4.026;
const MAX_SUGGESTIONS = 3;
const MIN_PAYABLE_XOF = 5000;
const RENEWAL_AFTER_DAYS = 30;
const RENEWAL_MAX_DAYS = 180;

interface Suggestion {
  id: string;
  kind: "payout" | "promo" | "event" | "renewal";
  icon: string;
  title: string;
  body: string;
  action: { type: "navigate"; route: string } | { type: "ask_sia"; prompt: string };
  priority: number; // tri décroissant ; au-delà de MAX_SUGGESTIONS on tronque
}

function fmtXof(n: number): string {
  return Number(n).toLocaleString("fr-FR") + " FCFA";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Méthode non autorisée" }, 405);
  }

  try {
    const user = await getAuthUser(req);
    if (!user) return jsonResponse({ error: "Non authentifié" }, 401);

    const body = await req.json().catch(() => null);
    const lat = typeof body?.lat === "number" && Number.isFinite(body.lat) ? body.lat : FALLBACK_LAT;
    const lng = typeof body?.lng === "number" && Number.isFinite(body.lng) ? body.lng : FALLBACK_LNG;

    const svc = serviceClient();
    const suggestions: Suggestion[] = [];

    // ── 1. Payable balance gérant ──────────────────────────────────────
    // Récupère la liste des venues dont l'user est owner, puis pour chacun
    // récupère le payable. On retourne la suggestion seulement si >= 5000 XOF.
    try {
      const { data: ownedVenues } = await svc
        .from("venues")
        .select("id, name")
        .eq("owner_id", user.id)
        .eq("status", "active")
        .limit(5); // hard cap pour éviter d'exploser les RPC

      if (Array.isArray(ownedVenues) && ownedVenues.length > 0) {
        // Sum payable across all owned venues (pour le titre agrégé)
        let totalPayable = 0;
        let bestVenue: { id: string; name: string; payable: number } | null = null;
        for (const v of ownedVenues as Array<{ id: string; name: string }>) {
          const { data: bal } = await svc.rpc("get_venue_payable_balance", { p_venue_id: v.id });
          const payable = ((bal as { payable_xof?: number } | null)?.payable_xof) ?? 0;
          totalPayable += payable;
          if (!bestVenue || payable > bestVenue.payable) {
            bestVenue = { id: v.id, name: v.name, payable };
          }
        }
        if (bestVenue && totalPayable >= MIN_PAYABLE_XOF) {
          suggestions.push({
            id: `payout-${bestVenue.id}`,
            kind: "payout",
            icon: "💸",
            title: "Retire tes revenus",
            body: ownedVenues.length === 1
              ? `Tu peux retirer ${fmtXof(bestVenue.payable)} de revenus de ${bestVenue.name}.`
              : `Tu as ${fmtXof(totalPayable)} retirables (${ownedVenues.length} établissements).`,
            action: { type: "navigate", route: `/venue-payout?venueId=${bestVenue.id}` },
            priority: 100, // priorité haute : c'est de l'argent
          });
        }
      }
    } catch (err) {
      console.warn("[proactive] payout source:", err);
    }

    // ── 2. Promo flash active à < 5 km ─────────────────────────────────
    try {
      const { data: promos } = await svc.rpc("get_active_promotions", {
        p_limit: 5,
        p_lat: lat,
        p_lng: lng,
        p_radius_km: 5,
      });
      if (Array.isArray(promos) && promos.length > 0) {
        // Prend la promo la plus proche
        const sorted = (promos as Array<{
          id?: string; code?: string; discount_pct?: number;
          venue_id?: string; venue_name?: string;
          distance_km?: number; kind?: string;
        }>).filter((p) => p.venue_id && p.discount_pct)
          .sort((a, b) => (a.distance_km ?? 999) - (b.distance_km ?? 999));
        const top = sorted[0];
        if (top) {
          const dist = top.distance_km
            ? top.distance_km < 1
              ? `à ${Math.round(top.distance_km * 1000)}m`
              : `à ${top.distance_km.toFixed(1)}km`
            : "près de toi";
          suggestions.push({
            id: `promo-${top.id ?? top.venue_id}`,
            kind: "promo",
            icon: "🏷️",
            title: `Promo -${top.discount_pct}% ${dist}`,
            body: `${top.venue_name ?? "Un lieu"} a une réduction active. Code : ${top.code ?? "—"}.`,
            action: { type: "navigate", route: `/venue/${top.venue_id}` },
            priority: 80,
          });
        }
      }
    } catch (err) {
      console.warn("[proactive] promo source:", err);
    }

    // ── 3. Event qui démarre dans les 24h à proximité ──────────────────
    try {
      const { data: events } = await svc.rpc("get_current_events", {
        p_limit: 10,
        p_hours_ahead: 24,
      });
      if (Array.isArray(events) && events.length > 0) {
        const ev = (events as Array<{
          id?: string; title?: string; starts_at?: string;
          venue_id?: string; venue_name?: string;
        }>)[0];
        if (ev && ev.id) {
          const when = ev.starts_at
            ? new Date(ev.starts_at).toLocaleString("fr-FR", {
                day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
              })
            : "bientôt";
          suggestions.push({
            id: `event-${ev.id}`,
            kind: "event",
            icon: "🎫",
            title: ev.title ?? "Événement à venir",
            body: ev.venue_name
              ? `${ev.venue_name} · ${when}`
              : `Démarre ${when}`,
            action: ev.venue_id
              ? { type: "navigate", route: `/venue/${ev.venue_id}` }
              : { type: "ask_sia", prompt: `Parle-moi de l'événement ${ev.title ?? ""}` },
            priority: 60,
          });
        }
      }
    } catch (err) {
      console.warn("[proactive] event source:", err);
    }

    // ── 4. Renouvellement d'une résa "arrived" > 30j ───────────────────
    try {
      const cutoff = new Date(Date.now() - RENEWAL_AFTER_DAYS * 86400000).toISOString();
      const recent = new Date(Date.now() - RENEWAL_MAX_DAYS * 86400000).toISOString();
      const { data: pastResa } = await svc
        .from("reservations")
        .select("id, venue_id, date_time, status, venue:venues(name)")
        .eq("user_id", user.id)
        .eq("status", "arrived")
        .lte("date_time", cutoff)
        .gte("date_time", recent)
        .order("date_time", { ascending: false })
        .limit(1);
      const r = (pastResa as Array<{
        id: string; venue_id: string; date_time: string;
        venue: { name?: string } | null;
      }> | null)?.[0];
      if (r && r.venue_id) {
        const venueName = r.venue?.name ?? "ton resto habituel";
        suggestions.push({
          id: `renewal-${r.venue_id}`,
          kind: "renewal",
          icon: "🔁",
          title: `Retourner chez ${venueName} ?`,
          body: `Tu y étais le ${new Date(r.date_time).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}. Réserve par la voix.`,
          action: { type: "ask_sia", prompt: `Réserve chez ${venueName}` },
          priority: 40,
        });
      }
    } catch (err) {
      console.warn("[proactive] renewal source:", err);
    }

    // Tri par priorité décroissante, tronqué à MAX_SUGGESTIONS
    suggestions.sort((a, b) => b.priority - a.priority);
    const top = suggestions.slice(0, MAX_SUGGESTIONS);

    return jsonResponse({
      count: top.length,
      suggestions: top,
    });
  } catch (err) {
    console.error("[proactive-suggestions] fatal:", err);
    return jsonResponse({ error: "Erreur interne" }, 500);
  }
});
