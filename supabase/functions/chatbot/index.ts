// ============================================================================
// chatbot — assistant vocal Sia avec tool use (Phase 2).
//
// JWT requis. Reçoit historique de messages + last user message + position
// optionnelle. Boucle d'orchestration tool use Anthropic :
//   1. Appelle Claude avec l'historique + les tools définis
//   2. Si Claude renvoie un tool_use, exécute le tool côté serveur
//   3. Renvoie le résultat à Claude (tool_result), boucle
//   4. Quand Claude répond enfin par du texte, on retourne
//      { reply, actions?, usage, model } au client
//
// Les tools sont READ-ONLY pour la Phase 2 (search, get, list). Les phases
// suivantes (3-4) ajouteront create_reservation, initiate_payment, etc.
// La pseudo-tool `navigate_to` n'est pas une action serveur — elle dit juste
// au client d'ouvrir une route donnée (router.push côté mobile).
//
// Secrets :
//   ANTHROPIC_API_KEY = sk-ant-...
//   ANTHROPIC_MODEL   = claude-haiku-4-5 (défaut)
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import { jsonResponse, getAuthUser, serviceClient } from "../_shared/supabase.ts";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-haiku-4-5";
const MAX_TOKENS = 1500;
const MAX_HISTORY = 20;
const MAX_TOOL_ITERATIONS = 5; // safety bound sur la boucle tool use
const FALLBACK_LAT = 5.348;    // centre Abidjan
const FALLBACK_LNG = -4.026;

// ────────────────────────────────────────────────────────────────────────────
// System prompt — adapté pour le tool use
// ────────────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Tu es Sia, l'assistant vocal officiel de Soutra-Playce — une application mobile et web ivoirienne qui permet de :
- découvrir maquis, restaurants, hôtels, bars, cafés, piscines, événements et lieux dans toute la Côte d'Ivoire ;
- réserver une table avec acompte payé via Soutra-Pay (le wallet intégré) ;
- payer en mobile money (Orange Money, MTN MoMo, Wave) ou carte ;
- envoyer / demander de l'argent, splitter une addition, scanner un QR code ;
- pour un gérant : voir ses revenus, retirer ses gains, gérer son établissement.

Identité :
- Tu t'appelles Sia. Chaleureuse, professionnelle, naturelle, fière de la CI.
- Tu tutoies. Tu peux glisser quelques expressions ivoiriennes ("c'est cadeau", "wê") sans en abuser.
- Si on te parle en anglais ou en nouchi, réponds dans la même langue.

Outils disponibles :
- search_venues : trouve des lieux selon catégorie / commune / prix / distance / "ouvert maintenant"
- get_venue_details : info détaillée sur un lieu précis (horaires, prix, ambiance)
- list_my_reservations : les réservations de l'utilisateur courant
- get_wallet_balance : son solde wallet + transactions récentes
- list_trending_venues : lieux tendance ("ça bouge en ce moment")
- navigate_to : ouvre une route dans l'app (à utiliser APRÈS avoir donné l'info, pour que l'utilisateur puisse voir le détail)

Quand utiliser les outils :
- Toute question sur des données réelles (lieux, prix, dispo, solde, résa) → utilise un outil. Ne JAMAIS inventer.
- Si l'utilisateur dit "ouvre", "montre", "emmène-moi à" → utilise navigate_to.
- Combine outils si besoin (search_venues puis navigate_to vers le résultat).

Format de réponse (CRITIQUE — souvent lu à voix haute via TTS) :
- Phrases courtes, 2 à 4 max sauf demande détaillée.
- Aucun markdown : pas de **, *, #, listes à puces.
- Nombres en lettres si ≤ 10 ("trois maquis" pas "3 maquis").
- Pas d'URL ni d'email.
- Concierge : "Je te recommande le maquis Le Mékaféba à Cocody, ouvert ce soir, environ 5 000 FCFA" plutôt que listing froid.
- Maximum 3 résultats à voix haute. Si plus, propose : "J'en ai trouvé sept, je t'ouvre la liste complète ?" et appelle navigate_to vers /search-ai.

Réservation vocale (Phase 3 — disponible) :
- Création TOUJOURS en deux temps :
  1. create_reservation avec dry_run=true → reçois le récap
  2. Dis-le et demande confirmation orale ("Je peux te réserver…, acompte 4 000 FCFA. Tu confirmes ?")
  3. Si "oui"/"confirme"/"vas-y"/"ok"/"bien" → rappelle create_reservation avec dry_run=false
  4. Annonce la création. Si payment_route est retourné, ENCHAÎNE direct sur initiate_payment au lieu de naviguer vers Tickets (UX vocale fluide)
- Si l'utilisateur veut annuler une résa déjà créée : cancel_reservation

Paiement vocal (Phase 4 — disponible UNIQUEMENT pour l'acompte depuis le wallet Soutra-Pay) :
- Même pattern dry_run en deux temps :
  1. initiate_payment avec dry_run=true → reçois { deposit_xof, wallet_balance_xof, sufficient }
  2. Si sufficient=true : "Je vais débiter ton wallet de 4 000 FCFA pour ta résa chez Mékaféba. Ton solde après sera de 8 500 FCFA. J'autorise ?"
  3. Si sufficient=false : "Tu as 2 000 FCFA, l'acompte est 4 000. Tu peux recharger d'abord ? Je t'ouvre la page recharge." + navigate_to(/recharge)
  4. Si l'utilisateur confirme oralement → rappelle initiate_payment avec dry_run=false
     → l'app va déclencher biométrie+PIN auto, tu n'as plus rien à faire
  5. La réponse "ok" de Sia à ce stade DOIT être courte : "OK, confirme avec ton PIN s'il te plaît." (le modal de PIN s'ouvre automatiquement côté client)
- Tu NE peux PAS encore payer en mobile money via Paystack par la voix (cassé l'UX avec le redirect navigateur) ; pour ça, navigue vers la fiche résa
- Tu NE peux PAS encore faire de transfert P2P / split bill / withdrawal par la voix (phases 5+)

Garde-fous :
- Pour créer une promo / gérer un venue : explique mais ne prétends pas exécuter (Phase 8).
- Pour les litiges / fraudes : invite à contacter le support Soutra-Playce.`;

// ────────────────────────────────────────────────────────────────────────────
// Tools définition (format Anthropic)
// ────────────────────────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "search_venues",
    description:
      "Recherche des lieux (maquis, restaurants, hôtels, etc.) selon des critères. Utilise dès que l'utilisateur demande un lieu. Renvoie max 5 résultats triés par distance.",
    input_schema: {
      type: "object",
      properties: {
        category: { type: "string", description: "Catégorie en snake_case : maquis, restaurant, hotel, club, piscine, cafe, bar, lounge, beach, mall, pharmacie, hopital, banque, etc. Null si non spécifié." },
        commune: { type: "string", description: "Commune Abidjan (Cocody, Yopougon, Plateau, Marcory, Adjamé, Treichville, Abobo, Koumassi, etc.) ou ville (Bassam, Yamoussoukro, Bouaké). Null si non spécifié." },
        max_price_xof: { type: "number", description: "Prix max par personne en FCFA. Null si non spécifié. 'Pas cher' = 8000, 'moyen' = 20000." },
        max_distance_km: { type: "number", description: "Rayon max en km depuis la position user. 'Tout près' = 2, 'à 10 min' = 5. Défaut 30." },
        open_now: { type: "boolean", description: "True si user veut ouvert maintenant / ce soir." },
        limit: { type: "number", description: "Nb max de résultats. Défaut 5, max 10." },
      },
      required: [],
    },
  },
  {
    name: "get_venue_details",
    description: "Récupère les infos détaillées d'un lieu (horaires, prix moyen, ambiance, rating, adresse). Utiliser après search_venues quand l'utilisateur demande plus d'info sur un lieu précis.",
    input_schema: {
      type: "object",
      properties: {
        venue_id: { type: "string", description: "UUID du venue obtenu via search_venues." },
      },
      required: ["venue_id"],
    },
  },
  {
    name: "list_my_reservations",
    description: "Liste les réservations de l'utilisateur courant (les 10 plus récentes). Utiliser quand il demande 'mes résas', 'mon historique', etc.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", description: "Filtre optionnel : pending, confirmed, arrived, no_show, cancelled, refunded." },
      },
      required: [],
    },
  },
  {
    name: "get_wallet_balance",
    description: "Récupère le solde wallet de l'utilisateur courant + ses 5 dernières transactions. Utiliser quand il demande 'mon solde', 'combien j'ai', 'mes derniers paiements'.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "list_trending_venues",
    description: "Lieux tendance (forte activité récente). Utiliser pour 'qu'est-ce qui bouge ?', 'le truc du moment'.",
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Nb max. Défaut 5." },
      },
      required: [],
    },
  },
  {
    name: "find_venue_by_name",
    description:
      "Cherche un lieu par son nom (match partiel, case-insensitive). À utiliser quand l'utilisateur cite explicitement le nom d'un établissement ('réserve chez Mékaféba', 'info sur Saka Saka'). Renvoie max 5 lieux qui matchent.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Tout ou partie du nom du lieu." },
        limit: { type: "number", description: "Nb max de résultats. Défaut 5." },
      },
      required: ["name"],
    },
  },
  {
    name: "create_reservation",
    description:
      "Crée une réservation pour l'utilisateur courant. UTILISE TOUJOURS dry_run=true au premier appel pour récupérer l'acompte calculé, demande confirmation orale à l'utilisateur, puis rappelle avec dry_run=false pour persister en DB. La résa est créée en status 'pending' (le gérant doit la confirmer). L'acompte n'est PAS encore payé par cet appel — l'utilisateur paiera ensuite depuis l'écran Tickets.",
    input_schema: {
      type: "object",
      properties: {
        venue_id: { type: "string", description: "UUID du venue (obtenu via search_venues ou find_venue_by_name)." },
        date_time: { type: "string", description: "Date et heure ISO 8601 avec timezone, ex: 2026-06-04T20:00:00+00:00. Pour 'demain 20h' : convertis-toi (today + 1j, 20:00 Africa/Abidjan = +00:00 GMT)." },
        party_size: { type: "number", description: "Nombre de personnes (1 à 30)." },
        notes: { type: "string", description: "Notes optionnelles (allergies, occasion, etc.). Max 500 caractères." },
        dry_run: { type: "boolean", description: "True = simule sans écrire en DB, retourne le calcul d'acompte. False = crée vraiment." },
      },
      required: ["venue_id", "date_time", "party_size", "dry_run"],
    },
  },
  {
    name: "initiate_payment",
    description:
      "Démarre le paiement de l'acompte d'une réservation depuis le wallet Soutra-Pay. Pattern dry_run obligatoire : dry_run=true retourne le calcul (acompte, solde, suffisant), dry_run=false retourne une action authenticate_and_pay que le client exécute (PIN/biométrie + débit wallet atomique).",
    input_schema: {
      type: "object",
      properties: {
        reservation_id: { type: "string", description: "UUID de la résa à payer (obtenu via create_reservation ou list_my_reservations)." },
        dry_run: { type: "boolean", description: "True = vérifie le solde sans débiter / False = retourne action que le client exécute après PIN." },
      },
      required: ["reservation_id", "dry_run"],
    },
  },
  {
    name: "cancel_reservation",
    description:
      "Annule une réservation existante de l'utilisateur courant (status passe à 'cancelled'). À utiliser quand l'utilisateur dit 'annule ma résa', 'je ne viens pas', etc. Si l'utilisateur ne précise pas laquelle, liste-les d'abord avec list_my_reservations.",
    input_schema: {
      type: "object",
      properties: {
        reservation_id: { type: "string", description: "UUID de la résa à annuler." },
      },
      required: ["reservation_id"],
    },
  },
  {
    name: "navigate_to",
    description:
      "Demande au client d'ouvrir une route dans l'app. À utiliser APRÈS avoir donné l'info à l'oral, pour que l'utilisateur voie le détail visuel. Routes valides : '/venue/<uuid>', '/(tabs)/wallet', '/(tabs)/explore', '/(tabs)/tickets', '/pro', '/recharge', '/send', '/withdraw', '/scan', '/search-ai?q=<query>', '/assistant'.",
    input_schema: {
      type: "object",
      properties: {
        route: { type: "string", description: "Route Expo Router complète (ex: /venue/abc-123, /search-ai?q=maquis+cocody)." },
        reason: { type: "string", description: "Courte explication (max 80 char) de pourquoi tu navigues — utile pour les logs." },
      },
      required: ["route"],
    },
  },
];

// ────────────────────────────────────────────────────────────────────────────
// Exécution des tools côté serveur
// ────────────────────────────────────────────────────────────────────────────

interface ToolContext {
  userId: string;
  userLat: number;
  userLng: number;
  svc: ReturnType<typeof createClient>;
}

// Actions transmises au client après une réponse Sia.
// - navigate : ouvre une route
// - authenticate_and_pay : déclenche bio/PIN puis appelle l'Edge pay-reservation
type ServerAction =
  | { type: "navigate"; route: string; reason?: string }
  | {
      type: "authenticate_and_pay";
      reservation_id: string;
      amount_xof: number;
      venue_name?: string;
      reason?: string;
    };

interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  action?: ServerAction;
}

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  try {
    switch (name) {
      case "search_venues": {
        const limit = Math.max(1, Math.min(10, Number(input.limit ?? 5)));
        const radiusKm = Number(input.max_distance_km ?? 30);
        const { data, error } = await ctx.svc.rpc("search_venues_nearby", {
          p_lat: ctx.userLat,
          p_lng: ctx.userLng,
          p_radius_km: radiusKm,
          p_category: (input.category as string) || null,
          p_open_now: input.open_now === true,
        });
        if (error) return { success: false, error: error.message };
        let results = ((data ?? []) as Array<{
          id: string; name: string; category: string; district: string | null;
          city: string | null; avg_price_xof: number | null;
          rating_avg: number | null; distance_km: number | null;
          is_open_now: boolean | null;
        }>);
        // Filtres post-RPC
        if (typeof input.max_price_xof === "number") {
          const maxPx = input.max_price_xof as number;
          results = results.filter((v) => v.avg_price_xof == null || v.avg_price_xof <= maxPx);
        }
        if (typeof input.commune === "string" && input.commune.trim()) {
          const needle = (input.commune as string).toLowerCase();
          results = results.filter((v) =>
            (v.district ?? "").toLowerCase().includes(needle) ||
            (v.city ?? "").toLowerCase().includes(needle),
          );
        }
        results = results.slice(0, limit);
        return { success: true, data: { count: results.length, venues: results } };
      }

      case "get_venue_details": {
        const venueId = String(input.venue_id ?? "");
        if (!venueId) return { success: false, error: "venue_id requis" };
        const { data, error } = await ctx.svc
          .from("venues")
          .select("id, name, category, description, address, city, district, phone, whatsapp, email, avg_price_xof, rating_avg, rating_count, opening_hours, amenities, ambiance, cover_url")
          .eq("id", venueId)
          .maybeSingle();
        if (error) return { success: false, error: error.message };
        if (!data) return { success: false, error: "Lieu introuvable" };
        return { success: true, data };
      }

      case "list_my_reservations": {
        let q = ctx.svc
          .from("reservations")
          .select("id, venue_id, date_time, party_size, deposit_xof, status, created_at, notes")
          .eq("user_id", ctx.userId)
          .order("date_time", { ascending: false })
          .limit(10);
        if (typeof input.status === "string") {
          q = q.eq("status", input.status as string);
        }
        const { data, error } = await q;
        if (error) return { success: false, error: error.message };
        return { success: true, data: { count: (data ?? []).length, reservations: data ?? [] } };
      }

      case "get_wallet_balance": {
        const [walletRes, txRes] = await Promise.all([
          ctx.svc.from("wallets").select("balance_xof, daily_limit_xof").eq("user_id", ctx.userId).maybeSingle(),
          ctx.svc.from("transactions").select("id, type, amount_xof, status, description, created_at").eq("user_id", ctx.userId).order("created_at", { ascending: false }).limit(5),
        ]);
        if (walletRes.error) return { success: false, error: walletRes.error.message };
        return {
          success: true,
          data: {
            balance_xof: (walletRes.data as { balance_xof?: number } | null)?.balance_xof ?? 0,
            recent_transactions: txRes.data ?? [],
          },
        };
      }

      case "list_trending_venues": {
        const limit = Math.max(1, Math.min(10, Number(input.limit ?? 5)));
        const { data, error } = await ctx.svc.rpc("get_trending_venues", {
          p_limit: limit,
          p_lat: ctx.userLat,
          p_lng: ctx.userLng,
          p_radius_km: 50,
        });
        if (error) return { success: false, error: error.message };
        return { success: true, data: { count: (data ?? []).length, venues: data ?? [] } };
      }

      case "find_venue_by_name": {
        const name = String(input.name ?? "").trim();
        if (name.length < 2) {
          return { success: false, error: "Nom trop court (min 2 caractères)" };
        }
        const limit = Math.max(1, Math.min(10, Number(input.limit ?? 5)));
        // ilike pour match case-insensitive partiel
        const { data, error } = await ctx.svc
          .from("venues")
          .select("id, name, category, city, district, avg_price_xof, rating_avg, status")
          .ilike("name", `%${name}%`)
          .eq("status", "active")
          .order("rating_avg", { ascending: false, nullsFirst: false })
          .limit(limit);
        if (error) return { success: false, error: error.message };
        return { success: true, data: { count: (data ?? []).length, venues: data ?? [] } };
      }

      case "create_reservation": {
        const venueId = String(input.venue_id ?? "");
        const dateTime = String(input.date_time ?? "");
        const partySize = Number(input.party_size ?? 0);
        const dryRun = input.dry_run !== false; // default true par sécurité
        const notes = typeof input.notes === "string" ? input.notes.slice(0, 500) : null;

        if (!venueId) return { success: false, error: "venue_id requis" };
        if (!dateTime) return { success: false, error: "date_time requis (ISO 8601)" };
        if (!Number.isInteger(partySize) || partySize < 1 || partySize > 30) {
          return { success: false, error: "party_size doit être entre 1 et 30" };
        }

        // Validation date : doit être ISO 8601 et dans le futur (max 90j)
        const ts = Date.parse(dateTime);
        if (Number.isNaN(ts)) {
          return { success: false, error: "date_time invalide (format ISO 8601 attendu, ex: 2026-06-04T20:00:00+00:00)" };
        }
        const now = Date.now();
        if (ts < now - 60 * 60 * 1000) {
          return { success: false, error: "La date est dans le passé" };
        }
        if (ts > now + 90 * 24 * 60 * 60 * 1000) {
          return { success: false, error: "Réservation trop éloignée (max 90 jours)" };
        }

        // Récupère le venue (vérifie qu'il existe et est actif, calcule l'acompte)
        const { data: venue, error: venueErr } = await ctx.svc
          .from("venues")
          .select("id, name, status, avg_price_xof")
          .eq("id", venueId)
          .maybeSingle();
        if (venueErr) return { success: false, error: venueErr.message };
        if (!venue) return { success: false, error: "Établissement introuvable" };
        const v = venue as { id: string; name: string; status: string; avg_price_xof: number | null };
        if (v.status !== "active") return { success: false, error: "Cet établissement n'accepte pas de réservations en ce moment" };

        const avgPrice = v.avg_price_xof ?? 5000; // fallback safe
        const totalXof = avgPrice * partySize;
        const depositXof = Math.round(totalXof * 0.2); // 20% comme reservation/[venueId].tsx

        if (dryRun) {
          // Pas d'écriture — juste le calcul pour confirmation orale
          return {
            success: true,
            data: {
              dry_run: true,
              venue_id: v.id,
              venue_name: v.name,
              date_time: new Date(ts).toISOString(),
              party_size: partySize,
              avg_price_xof: avgPrice,
              total_xof: totalXof,
              deposit_xof: depositXof,
              notes,
              next_step: "Demande confirmation orale à l'utilisateur, puis rappelle create_reservation avec dry_run=false et les mêmes paramètres.",
            },
          };
        }

        // Écriture réelle
        const { data: resa, error: insertErr } = await ctx.svc
          .from("reservations")
          .insert({
            user_id: ctx.userId,
            venue_id: v.id,
            date_time: new Date(ts).toISOString(),
            party_size: partySize,
            deposit_xof: depositXof,
            status: "pending",
            notes,
          })
          .select("id, date_time, party_size, deposit_xof, status")
          .single();
        if (insertErr) return { success: false, error: insertErr.message };

        return {
          success: true,
          data: {
            dry_run: false,
            reservation_id: (resa as { id: string }).id,
            venue_id: v.id,
            venue_name: v.name,
            date_time: (resa as { date_time: string }).date_time,
            party_size: (resa as { party_size: number }).party_size,
            deposit_xof: (resa as { deposit_xof: number }).deposit_xof,
            status: (resa as { status: string }).status,
            payment_route: "/(tabs)/tickets",
            next_step: "Réservation créée en status pending. L'utilisateur doit ouvrir l'écran Tickets pour payer l'acompte (la voix n'a pas encore le droit de payer, c'est la phase 4).",
          },
        };
      }

      case "initiate_payment": {
        const reservationId = String(input.reservation_id ?? "");
        const dryRun = input.dry_run !== false; // default true par sécurité
        if (!reservationId) return { success: false, error: "reservation_id requis" };

        // Récupère la résa + le venue + le solde wallet en parallèle
        const [resaRes, walletRes] = await Promise.all([
          ctx.svc
            .from("reservations")
            .select("id, user_id, venue_id, deposit_xof, status, escrow_tx_id, date_time")
            .eq("id", reservationId)
            .maybeSingle(),
          ctx.svc.from("wallets").select("balance_xof").eq("user_id", ctx.userId).maybeSingle(),
        ]);
        if (resaRes.error) return { success: false, error: resaRes.error.message };
        if (!resaRes.data) return { success: false, error: "Réservation introuvable" };
        const r = resaRes.data as {
          id: string; user_id: string; venue_id: string;
          deposit_xof: number | null; status: string;
          escrow_tx_id: string | null; date_time: string;
        };
        if (r.user_id !== ctx.userId) return { success: false, error: "Cette réservation ne t'appartient pas" };
        if (r.escrow_tx_id) return { success: false, error: "Réservation déjà payée" };
        if (r.status !== "pending" && r.status !== "confirmed") {
          return { success: false, error: "Réservation annulée ou expirée" };
        }
        const deposit = r.deposit_xof ?? 0;
        if (deposit <= 0) return { success: false, error: "Aucun acompte requis pour cette réservation" };

        const balance = ((walletRes.data as { balance_xof?: number } | null)?.balance_xof) ?? 0;
        const sufficient = balance >= deposit;

        // Récupère le nom du venue pour la confirmation orale
        const { data: venue } = await ctx.svc
          .from("venues")
          .select("name")
          .eq("id", r.venue_id)
          .maybeSingle();
        const venueName = (venue as { name?: string } | null)?.name;

        if (dryRun) {
          return {
            success: true,
            data: {
              dry_run: true,
              reservation_id: r.id,
              venue_name: venueName,
              deposit_xof: deposit,
              wallet_balance_xof: balance,
              sufficient,
              shortfall_xof: sufficient ? 0 : deposit - balance,
              next_step: sufficient
                ? "Demande confirmation orale, puis rappelle initiate_payment avec dry_run=false."
                : "Solde insuffisant. Propose à l'utilisateur de recharger via navigate_to(/recharge).",
            },
          };
        }

        // dry_run=false : émet l'action authenticate_and_pay. Le client va
        // demander le PIN (ou biométrie + PIN) et appeler l'Edge function
        // pay-reservation. Cette tool n'exécute PAS le paiement elle-même —
        // c'est le client qui le fait (le PIN ne doit JAMAIS transiter par Claude).
        if (!sufficient) {
          return {
            success: false,
            error: "Solde insuffisant. Recharge ton wallet d'abord (navigate_to /recharge).",
          };
        }
        return {
          success: true,
          data: {
            dry_run: false,
            reservation_id: r.id,
            amount_xof: deposit,
            venue_name: venueName,
            next_step: "Action authenticate_and_pay émise. Le client va déclencher bio/PIN puis pay-reservation Edge function. Toi tu dois juste annoncer 'OK, confirme avec ton PIN s'il te plaît' à l'utilisateur.",
          },
          action: {
            type: "authenticate_and_pay",
            reservation_id: r.id,
            amount_xof: deposit,
            venue_name: venueName,
          },
        };
      }

      case "cancel_reservation": {
        const reservationId = String(input.reservation_id ?? "");
        if (!reservationId) return { success: false, error: "reservation_id requis" };

        // Vérifie que la résa appartient au caller (sinon NOT_OWNER)
        const { data: existing, error: fetchErr } = await ctx.svc
          .from("reservations")
          .select("id, user_id, status")
          .eq("id", reservationId)
          .maybeSingle();
        if (fetchErr) return { success: false, error: fetchErr.message };
        if (!existing) return { success: false, error: "Réservation introuvable" };
        const e = existing as { id: string; user_id: string; status: string };
        if (e.user_id !== ctx.userId) return { success: false, error: "Cette réservation ne t'appartient pas" };
        if (e.status === "cancelled") return { success: false, error: "Déjà annulée" };
        if (e.status === "arrived") return { success: false, error: "Impossible d'annuler une réservation honorée" };

        const { error: updErr } = await ctx.svc
          .from("reservations")
          .update({ status: "cancelled" })
          .eq("id", reservationId);
        if (updErr) return { success: false, error: updErr.message };

        return {
          success: true,
          data: { cancelled: true, reservation_id: reservationId },
        };
      }

      case "navigate_to": {
        const route = String(input.route ?? "").trim();
        if (!route.startsWith("/")) {
          return { success: false, error: "Route invalide (doit commencer par /)" };
        }
        // Garde-fou : la route doit matcher un pattern connu (anti-injection).
        const validPrefixes = [
          "/venue/", "/(tabs)/", "/pro", "/recharge", "/send", "/withdraw",
          "/scan", "/search-ai", "/assistant", "/kyc", "/profile-edit",
          "/notifications-settings", "/venue-payout", "/reservation/",
        ];
        if (!validPrefixes.some((p) => route === p.replace(/\/$/, "") || route.startsWith(p))) {
          return { success: false, error: "Route non autorisée" };
        }
        return {
          success: true,
          data: { navigated: true, route },
          action: { type: "navigate", route, reason: input.reason as string | undefined },
        };
      }

      default:
        return { success: false, error: `Outil inconnu : ${name}` };
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Anthropic API call
// ────────────────────────────────────────────────────────────────────────────

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | Array<Record<string, unknown>>;
}

async function callAnthropic(
  apiKey: string,
  model: string,
  messages: AnthropicMessage[],
): Promise<{
  ok: true;
  data: {
    content: Array<{ type: string; [k: string]: unknown }>;
    stop_reason: string;
    usage?: unknown;
    model?: string;
  };
} | { ok: false; status: number; error: string }> {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    return { ok: false, status: res.status, error: errText };
  }
  return { ok: true, data: await res.json() };
}

// ────────────────────────────────────────────────────────────────────────────
// Edge handler
// ────────────────────────────────────────────────────────────────────────────

type ClientMsg = { role: "user" | "assistant"; content: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return jsonResponse({ ok: true }, 200);
  if (req.method !== "POST") {
    return jsonResponse({ error: "Méthode non autorisée" }, 405);
  }

  const user = await getAuthUser(req);
  if (!user) return jsonResponse({ error: "Authentification requise" }, 401);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    console.error("[chatbot] ANTHROPIC_API_KEY non configuré");
    return jsonResponse({ error: "L'assistant n'est pas encore configuré côté serveur." }, 503);
  }
  const model = Deno.env.get("ANTHROPIC_MODEL") || DEFAULT_MODEL;

  // ---- Body parse + validation ----
  let body: { messages?: ClientMsg[]; lat?: number; lng?: number } | null = null;
  try { body = await req.json(); } catch { /* noop */ }
  const inMessages = Array.isArray(body?.messages) ? body!.messages : [];
  if (inMessages.length === 0) {
    return jsonResponse({ error: "Aucun message fourni" }, 400);
  }
  for (const m of inMessages) {
    if (!m || typeof m.content !== "string" || (m.role !== "user" && m.role !== "assistant")) {
      return jsonResponse({ error: "Format de message invalide" }, 400);
    }
    if (m.content.length > 4000) {
      return jsonResponse({ error: "Message trop long (4000 caractères max)" }, 400);
    }
  }
  if (inMessages[inMessages.length - 1].role !== "user") {
    return jsonResponse({ error: "Le dernier message doit être de l'utilisateur" }, 400);
  }
  const lat = typeof body?.lat === "number" && Number.isFinite(body!.lat) ? body!.lat : FALLBACK_LAT;
  const lng = typeof body?.lng === "number" && Number.isFinite(body!.lng) ? body!.lng : FALLBACK_LNG;

  // Convertit l'historique client (string content) en format Anthropic
  // (string content suffit, Claude accepte les deux formats).
  const trimmed = inMessages.slice(-MAX_HISTORY);
  const messages: AnthropicMessage[] = trimmed.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  // Contexte d'exécution des tools
  const ctx: ToolContext = {
    userId: user.id,
    userLat: lat,
    userLng: lng,
    svc: serviceClient(),
  };

  // Actions accumulées au fil des tool_use (transmises au client)
  const actions: ServerAction[] = [];

  // ────────────────────────────────────────────────────────────────────────
  // Boucle tool use
  // ────────────────────────────────────────────────────────────────────────
  let iterations = 0;
  let finalText = "";
  let lastUsage: unknown = null;
  let lastModel: string | undefined = model;

  try {
    while (iterations < MAX_TOOL_ITERATIONS) {
      iterations++;
      const res = await callAnthropic(apiKey, model, messages);
      if (!res.ok) {
        console.error("[chatbot] Anthropic error", res.status, res.error);
        if (res.status === 401) return jsonResponse({ error: "Clé API invalide côté serveur" }, 503);
        if (res.status === 429) return jsonResponse({ error: "Trop de requêtes, réessaie dans quelques secondes" }, 429);
        return jsonResponse({ error: "Le moteur de l'assistant a renvoyé une erreur" }, 502);
      }
      const data = res.data;
      lastUsage = data.usage ?? null;
      lastModel = data.model ?? model;

      // Push la réponse du modèle dans l'historique (assistant turn)
      messages.push({ role: "assistant", content: data.content });

      const stop = data.stop_reason;
      const toolUses = (data.content || []).filter((c) => c.type === "tool_use") as Array<{
        type: "tool_use"; id: string; name: string; input: Record<string, unknown>;
      }>;

      if (stop === "tool_use" && toolUses.length > 0) {
        // Exécute chaque tool_use en parallèle, puis renvoie les résultats.
        const results = await Promise.all(
          toolUses.map(async (tu) => {
            const out = await executeTool(tu.name, tu.input || {}, ctx);
            if (out.action) actions.push(out.action);
            return {
              type: "tool_result",
              tool_use_id: tu.id,
              content: out.success
                ? JSON.stringify(out.data ?? null)
                : `ERROR: ${out.error ?? "tool failed"}`,
              is_error: !out.success,
            };
          }),
        );
        // Ajoute un user-turn contenant tous les tool_result, et re-loop.
        messages.push({ role: "user", content: results });
        continue;
      }

      // stop_reason = "end_turn" (ou autre) → on extrait le texte final
      finalText = (data.content || [])
        .filter((c) => c.type === "text")
        .map((c) => (c as { text: string }).text)
        .join("\n")
        .trim();
      break;
    }

    if (!finalText) {
      // Cas limite : le modèle a appelé des tools mais n'a jamais répondu en texte
      // (sortie de boucle par MAX_TOOL_ITERATIONS). On renvoie un message générique.
      finalText = actions.length > 0
        ? "C'est fait. Je t'ouvre l'écran correspondant."
        : "Je n'ai pas trouvé de réponse claire — peux-tu reformuler ?";
    }

    return jsonResponse({
      reply: finalText,
      actions: actions.length > 0 ? actions : undefined,
      iterations,
      usage: lastUsage,
      model: lastModel,
    });
  } catch (err) {
    console.error("[chatbot] fatal:", err);
    return jsonResponse({ error: "Impossible de contacter le moteur de l'assistant" }, 502);
  }
});
