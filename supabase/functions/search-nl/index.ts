// ============================================================================
// search-nl — recherche sémantique de venues en langage naturel.
// ============================================================================
//
// Pipeline :
//   1. Auth JWT (réutilise le pattern getAuthUser des autres fonctions)
//   2. Parse le `query` utilisateur via Claude Haiku → JSON structuré
//      { category, max_price_xof, max_distance_km, open_now,
//        commune, ambiance_keywords, summary }
//   3. Appelle `search_venues_nearby` (RPC PostGIS, migration 0021) avec
//      les params extraits. Si pas de lat/lng fourni → centre par défaut
//      Abidjan (5.348 N, 4.026 W).
//   4. Filtre supplémentaire côté JS pour `max_price_xof` et `commune`
//      (la RPC ne supporte que category/radius/open_now nativement).
//   5. Retourne { interpretation, results, raw_query }.
//
// Self-contained : pas d'import relatif _shared/ pour faciliter un déploiement
// via Dashboard Supabase (le Dashboard ne déploie qu'un seul fichier).
//
// Secrets requis (déjà partagés avec la fonction chatbot) :
//   ANTHROPIC_API_KEY = sk-ant-...
//   ANTHROPIC_MODEL   = claude-haiku-4-5 (optionnel, défaut)
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-haiku-4-5";
const MAX_TOKENS = 600;
const MAX_QUERY_LEN = 500;
// Centre d'Abidjan utilisé quand le client n'envoie pas sa position.
const FALLBACK_LAT = 5.348;
const FALLBACK_LNG = -4.026;
const DEFAULT_RADIUS_KM = 50;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getAuthUser(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

// ----------------------------------------------------------------------------
// Catégories valides (miroir de l'enum venue_category après migrations
// 0001 + 0013 + 0033). Si Claude renvoie une autre valeur, on l'ignore.
// ----------------------------------------------------------------------------
const VALID_CATEGORIES = new Set([
  // 0001 + 0013
  "maquis", "restaurant", "hotel", "club", "sport", "cafe", "event_space",
  "bar", "lounge", "beach",
  // 0033
  "fast_food", "patisserie",
  "residence_meublee", "villa", "resort", "auberge",
  "piscine", "cinema", "casino", "centre_loisirs", "parc",
  "salle_sport", "terrain_football", "multisports", "fitness",
  "mall", "supermarche", "boutique",
  "maternelle", "primaire", "college", "lycee", "universite",
  "grande_ecole", "formation", "bibliotheque", "residence_universitaire",
  "hopital", "clinique", "pharmacie", "laboratoire",
  "banque", "assurance", "immobilier", "voyage", "comptable", "juridique",
  "site_touristique", "musee", "monument", "reserve_naturelle", "attraction",
  "entreprise", "autre",
]);

// ----------------------------------------------------------------------------
// Prompt système pour Claude : extraction stricte en JSON.
// ----------------------------------------------------------------------------
const SYSTEM_PROMPT = `Tu es un parseur d'intention pour Soutra-Explore (Côte d'Ivoire).
À partir de la requête naturelle de l'utilisateur, retourne UNIQUEMENT un objet JSON (pas de markdown, pas de texte hors JSON) avec les clés suivantes :

{
  "category": string | null,        // une valeur de l'enum venue_category (voir liste ci-dessous), ou null si non spécifié
  "max_price_xof": number | null,    // budget max par personne en FCFA, null si non spécifié
  "max_distance_km": number | null,  // rayon max en km, null si non spécifié
  "open_now": boolean | null,        // true si l'utilisateur veut « ouvert maintenant », sinon null
  "commune": string | null,          // commune d'Abidjan (Cocody, Yopougon, Marcory, Plateau, Treichville, Adjamé, Abobo, Attécoubé, Koumassi, Port-Bouët, Bingerville…) ou ville (Bassam, Yamoussoukro…), null si non spécifié
  "ambiance_keywords": string[] | null,  // mots-clés d'ambiance/style (romantique, festif, chill, sportif, familial, gastronomique…), null si non spécifié
  "summary": string                   // courte phrase FR récapitulant l'intention détectée (max 100 caractères)
}

Catégories valides (utilise EXACTEMENT ces valeurs en snake_case ou null) :
maquis, restaurant, hotel, club, sport, cafe, event_space, bar, lounge, beach,
fast_food, patisserie, residence_meublee, villa, resort, auberge,
piscine, cinema, casino, centre_loisirs, parc, salle_sport, terrain_football,
multisports, fitness, mall, supermarche, boutique, maternelle, primaire, college,
lycee, universite, grande_ecole, formation, bibliotheque, residence_universitaire,
hopital, clinique, pharmacie, laboratoire, banque, assurance, immobilier, voyage,
comptable, juridique, site_touristique, musee, monument, reserve_naturelle,
attraction, entreprise, autre

Règles :
- Ne JAMAIS inventer une catégorie hors de la liste ci-dessus.
- Pour « pas cher », interprète max_price_xof entre 5 000 et 10 000.
- Pour « moins de 10 minutes », interprète max_distance_km = 5.
- Pour « tout près », interprète max_distance_km = 2.
- Si l'utilisateur dit « ouvert » / « maintenant » / « ce soir » → open_now=true.
- Si la requête est ambiguë ou hors-sujet (pas un lieu), retourne tout à null et summary="Requête non interprétée."
- Pas de prose, pas de markdown, juste le JSON.`;

type ParsedIntent = {
  category: string | null;
  max_price_xof: number | null;
  max_distance_km: number | null;
  open_now: boolean | null;
  commune: string | null;
  ambiance_keywords: string[] | null;
  summary: string;
};

const EMPTY_INTENT: ParsedIntent = {
  category: null,
  max_price_xof: null,
  max_distance_km: null,
  open_now: null,
  commune: null,
  ambiance_keywords: null,
  summary: "Requête non interprétée.",
};

function safeParseIntent(text: string): ParsedIntent {
  // Claude renvoie parfois du texte autour du JSON. On extrait le premier objet
  // équilibré en accolades. Si parsing échoue, on retombe sur EMPTY_INTENT.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) return EMPTY_INTENT;
  try {
    const obj = JSON.parse(text.slice(start, end + 1));
    return {
      category: (typeof obj.category === "string" && VALID_CATEGORIES.has(obj.category)) ? obj.category : null,
      max_price_xof: (typeof obj.max_price_xof === "number" && obj.max_price_xof > 0) ? Math.round(obj.max_price_xof) : null,
      max_distance_km: (typeof obj.max_distance_km === "number" && obj.max_distance_km > 0 && obj.max_distance_km <= 200) ? obj.max_distance_km : null,
      open_now: typeof obj.open_now === "boolean" ? obj.open_now : null,
      commune: (typeof obj.commune === "string" && obj.commune.length > 0 && obj.commune.length < 80) ? obj.commune : null,
      ambiance_keywords: Array.isArray(obj.ambiance_keywords) ? obj.ambiance_keywords.filter((s: unknown) => typeof s === "string" && s.length > 0 && s.length < 40).slice(0, 6) : null,
      summary: (typeof obj.summary === "string" && obj.summary.length > 0) ? obj.summary.slice(0, 140) : EMPTY_INTENT.summary,
    };
  } catch {
    return EMPTY_INTENT;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return jsonResponse({ ok: true }, 200);
  if (req.method !== "POST") return jsonResponse({ error: "Méthode non autorisée" }, 405);

  const user = await getAuthUser(req);
  if (!user) return jsonResponse({ error: "Authentification requise" }, 401);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    console.error("[search-nl] ANTHROPIC_API_KEY non configuré");
    return jsonResponse({ error: "La recherche IA n'est pas encore configurée côté serveur." }, 503);
  }
  const model = Deno.env.get("ANTHROPIC_MODEL") || DEFAULT_MODEL;

  // ---- Body parse + validation ----
  let body: { query?: string; lat?: number; lng?: number } | null = null;
  try { body = await req.json(); } catch { /* noop */ }
  const query = (body?.query ?? "").toString().trim();
  if (!query) return jsonResponse({ error: "Requête vide" }, 400);
  if (query.length > MAX_QUERY_LEN) return jsonResponse({ error: "Requête trop longue (500 caractères max)" }, 400);
  const lat = typeof body?.lat === "number" && Number.isFinite(body!.lat) ? body!.lat : FALLBACK_LAT;
  const lng = typeof body?.lng === "number" && Number.isFinite(body!.lng) ? body!.lng : FALLBACK_LNG;

  // ---- Étape 1 : extraction d'intention via Claude ----
  let intent: ParsedIntent = EMPTY_INTENT;
  try {
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
        messages: [{ role: "user", content: query }],
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error("[search-nl] Anthropic error", res.status, errText);
      // En cas d'échec parsing IA on continue avec EMPTY_INTENT -> recherche
      // dégénère vers « tout autour de moi ». UX dégradée mais utile.
    } else {
      const data = await res.json();
      const text = Array.isArray(data.content)
        ? data.content.filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("\n").trim()
        : "";
      intent = safeParseIntent(text);
    }
  } catch (err) {
    console.error("[search-nl] Anthropic fetch fatal:", err);
  }

  // ---- Étape 2 : recherche géographique via RPC ----
  // Si Claude n'a pas trouvé de rayon, on prend 50 km (couvre Abidjan large).
  const radiusKm = intent.max_distance_km ?? DEFAULT_RADIUS_KM;

  const supabaseService = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  type VenueRow = {
    id: string;
    name: string;
    slug: string;
    category: string;
    cover_url: string | null;
    district: string | null;
    city: string | null;
    avg_price_xof: number | null;
    rating_avg: number | null;
    rating_count: number | null;
    lat: number | null;
    lng: number | null;
    distance_km: number | null;
    is_open_now: boolean | null;
  };

  const { data: rpcData, error: rpcError } = await supabaseService.rpc("search_venues_nearby", {
    p_lat: lat,
    p_lng: lng,
    p_radius_km: radiusKm,
    p_category: intent.category, // null = toutes
    p_open_now: intent.open_now === true, // RPC attend boolean
  });
  if (rpcError) {
    console.error("[search-nl] search_venues_nearby error:", rpcError);
    return jsonResponse({ error: "Recherche géographique indisponible" }, 502);
  }

  let results = (rpcData ?? []) as VenueRow[];

  // ---- Étape 3 : filtres supplémentaires côté JS ----
  // (la RPC ne sait pas filtrer prix/commune nativement)
  if (intent.max_price_xof != null) {
    results = results.filter((v) => v.avg_price_xof == null || v.avg_price_xof <= intent.max_price_xof!);
  }
  if (intent.commune) {
    const needle = intent.commune.toLowerCase();
    results = results.filter((v) =>
      (v.district ?? "").toLowerCase().includes(needle) ||
      (v.city ?? "").toLowerCase().includes(needle),
    );
  }

  // Limite hard à 100 résultats pour borner la charge réseau.
  results = results.slice(0, 100);

  return jsonResponse({
    interpretation: intent,
    results,
    raw_query: query,
    used_lat: lat,
    used_lng: lng,
    used_radius_km: radiusKm,
    model: model,
  });
});
