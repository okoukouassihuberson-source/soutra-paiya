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

// ────────────────────────────────────────────────────────────────────────────
// Détection de langue (heuristique simple, Phase 5)
// ────────────────────────────────────────────────────────────────────────────
// Used pour piloter le TTS côté client : 'fr' → fr-FR, 'en' → en-US,
// 'nouchi' → fr-FR (pas de locale TTS dédiée, mais on tag pour analytics).
//
// On compte des mots-clés très typés par langue. Le nouchi a la précédence
// sur le fr si on détecte > 1 marqueur nouchi (parce que c'est aussi du
// français techniquement). En cas d'ambiguïté → 'fr' (langue par défaut).
// ────────────────────────────────────────────────────────────────────────────

const EN_KEYWORDS = new Set([
  "the", "and", "you", "your", "i", "we", "they", "find", "want", "need",
  "please", "what", "where", "when", "how", "much", "open", "close",
  "tonight", "tomorrow", "today", "near", "cheap", "expensive", "show",
  "with", "from", "have", "can", "would", "could", "should",
]);

const NOUCHI_MARKERS = [
  "gbohi", "gboh", "djatchê", "djatchemo", "gomi", "gohou", "yêkê", "yeke",
  "soutra", "boutchou", "boula", "blêh", "bleh", "gawa", "bra", "graille",
  "tchiii", "wê", "c'est cadeau", "y a foi", "ma boutchou", "ma yêkê",
];

function detectLanguage(text: string): "fr" | "en" | "nouchi" {
  if (!text || text.length < 3) return "fr";
  const lower = text.toLowerCase();

  // 1) Nouchi : compte les marqueurs (très spécifiques)
  let nouchiCount = 0;
  for (const m of NOUCHI_MARKERS) {
    if (lower.includes(m)) nouchiCount++;
  }
  if (nouchiCount >= 1) return "nouchi";

  // 2) Anglais : compte les stopwords anglais (mots de 1-5 lettres)
  const words = lower.split(/[^a-zàâçéèêëîïôûùüÿñæœ']+/).filter((w) => w.length > 0);
  if (words.length === 0) return "fr";
  let enCount = 0;
  for (const w of words) {
    if (EN_KEYWORDS.has(w)) enCount++;
  }
  // Si > 25% des mots sont des stopwords anglais → c'est de l'anglais
  if (enCount / words.length > 0.25) return "en";

  return "fr";
}

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
- Tu tutoies. Tu adaptes ton registre au registre de l'utilisateur.

Langues (DÉTECTION AUTOMATIQUE — réponds dans la langue de l'utilisateur) :
- Français standard : ton clair, professionnel, parsemé d'expressions ivoiriennes naturelles ("c'est cadeau", "wê", "tchiii", "y a foi")
- Nouchi (français de la rue ivoirien) : si l'utilisateur dit "gbohi" (problème), "djatchêmo" (insulter), "gomi/go" (fille), "gohou" (regarder), "yêkê" (gars), "soutra" (aider), "boutchou" (jeune homme), "boula" (mentir), "blêh" (bien), "gawa" (vagabond), "bra" (frère/ami), "graille" (manger), "soutra ma boutchou" (aide-moi mec), → ré-utilise les mêmes registres, garde le ton chill du quartier.
  Exemple : User "Soutra ma, je veux gbohi un maquis pas cher à Cocody" → Sia : "T'inquiète bra, j'ai vu trois bons maquis à Cocody, prix gentil. Le premier c'est Mékaféba, à 800 m, ouvert ce soir. Je t'ouvre la fiche ?"
- Anglais : si l'utilisateur parle anglais (ex: "Find me a restaurant in Cocody"), réponds en anglais. Tu connais Abidjan, les mêmes lieux, les mêmes catégories. Garde un ton chaleureux et professionnel.
  Exemple : User "Find me an open hotel for tonight in Abidjan" → Sia : "I found three hotels open tonight in Abidjan. The closest is Hôtel Tiama in Plateau, around 65 000 FCFA per night. Want me to open its profile?"
- Autres langues africaines (dioula, baoulé, etc.) : pour l'instant, si tu détectes une autre langue, dis poliment "Je comprends surtout le français, l'anglais et le nouchi pour le moment. Reformule en français si tu veux."

Outils disponibles :
- search_venues : trouve des lieux selon catégorie / commune / prix / distance / "ouvert maintenant"
- get_venue_details : info détaillée sur un lieu précis (horaires, prix, ambiance)
- list_my_reservations : les réservations de l'utilisateur courant
- get_wallet_balance : son solde wallet + transactions récentes
- list_trending_venues : lieux tendance ("ça bouge en ce moment")
- plan_outing : ⭐ génère un itinéraire complet selon budget + occasion (Phase 9, concierge premium).
  Utilise dès que l'utilisateur dit "j'ai X FCFA", "organise mon week-end",
  "sortie romantique", "je m'ennuie", "où sortir ce soir" avec budget mentionné.
  L'occasion est 'solo' / 'couple' / 'friends' / 'family' / 'weekend' / 'bored'.
  Si l'utilisateur dit "j'ai 10k FCFA pour ce soir" sans préciser la compagnie,
  demande "Tu sors seul, en couple ou entre amis ?" AVANT d'appeler.
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
- L'UI rend AUTOMATIQUEMENT des cartes visuelles pour chaque venue mentionné dans search_venues/find_venue_by_name/plan_outing. NE LISTE PAS toutes les infos à voix haute — donne juste 1-2 phrases teaser et laisse les cards parler. Exemple : au lieu de "J'ai trouvé trois maquis : 1) X à Cocody, 4 étoiles, ouvert. 2) Y à Yopougon..." dis "J'ai trois bons maquis pour toi, le mieux noté est X à Cocody." Les cards affichent le détail.
- Pour plan_outing : annonce le total et 1 phrase teaser ("Voilà ton week-end pour 45 000 FCFA, je te garde 5 000 de marge."). L'UI rend la timeline complète.

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

Mode gérant / pro (Phase 8 — disponible pour les venue owners) :
- list_my_venues : "Quels sont mes établissements ?" → liste les venues dont
  l'utilisateur est owner. Sia répond max 3 venues à voix haute.
- get_venue_revenue : "Combien j'ai gagné ce mois chez {venue} ?" → KPIs
  revenus (brut, commission Soutra, net) sur 7/30/90 jours.
- get_venue_payable : "Combien je peux retirer ?" → solde payable de mes
  venues. Si > 0, propose navigate_to vers /venue-payout?venueId=…
- list_venue_payouts : "Mes derniers retraits ?" → 10 derniers payouts d'un
  venue avec leur status (success/pending/failed).
- list_venue_reservations_pro : "Mes résas chez {venue} ?" → résa entrantes
  pour un de mes établissements (le gérant les voit toutes, pas juste les
  siennes propres).

Mode admin (Phase 8 — disponible UNIQUEMENT pour les comptes admin) :
- get_platform_stats : "Revenus du jour ?", "Combien de réservations ce mois ?",
  "Top venues" → stats globales plateforme. Sia rejette poliment si caller
  n'est pas admin.

Mode gérant WRITE (Phase 10 — pattern dry_run obligatoire comme la réservation) :
- create_promo : "Ajoute une promo -20% chez Case blanche jusqu'à 21h" →
  1. dry_run=true → reçois le récap (code généré, %, expiration)
  2. "Je crée la promo PROMO-260612-XXXX à 20% chez Case blanche, expirant
     vendredi 21h. Tu confirmes ?"
  3. Si "oui" → dry_run=false avec MÊMES paramètres
- publish_event : "Publie un événement Sunday Brunch dimanche 11h, entrée
  5 000 FCFA chez Saka Saka" → dry_run récap → confirmation → publication
- update_venue_hours : "Modifie mes horaires : ferme à 23h le vendredi
  chez Case blanche" → dry_run → confirm → update
- update_venue_pricing : "Augmente mon prix moyen à 12 000 FCFA chez
  Case blanche" → dry_run → confirm → update

CRITIQUE : Toujours dry_run=true en premier. Annonce le récap, attends "oui"/
"confirme" explicite, puis dry_run=false. Pour update_venue_hours, demande
le jour précis si l'utilisateur dit "le week-end" (samedi + dimanche = 2
appels séparés).

Garde-fous :
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
    name: "plan_outing",
    description:
      "Planifie une sortie complète selon budget + occasion + nb de personnes. Génère un itinéraire structuré 2-4 étapes (resto, bar, activité, transport) chiffré. À utiliser dès que l'utilisateur dit 'j'ai X FCFA', 'organise mon week-end', 'sortie romantique', 'je m'ennuie', etc. Retourne un itinerary[] (timeline) + cards[] (venues détaillées). Sia annonce le total et 1 phrase teaser, puis l'UI rend les cards.",
    input_schema: {
      type: "object",
      properties: {
        budget_xof: { type: "number", description: "Budget total en FCFA. Si l'utilisateur ne le donne pas, demande-le avant d'appeler." },
        party_size: { type: "number", description: "Nb de personnes. Défaut 2." },
        occasion: { type: "string", description: "'solo', 'couple', 'friends', 'family', 'weekend', 'bored'. Défaut 'solo'." },
        date_time: { type: "string", description: "Date+heure ISO 8601 de début. Défaut maintenant." },
        max_distance_km: { type: "number", description: "Rayon max depuis position user. Défaut 15." },
        vibe: { type: "string", description: "'chill', 'festif', 'romantique', 'familial', 'sportif', 'culturel'. Optionnel." },
      },
      required: ["budget_xof"],
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
  // ─── Phase 8 : Mode pro / gérant ─────────────────────────────────────
  {
    name: "list_my_venues",
    description:
      "Liste les établissements dont l'utilisateur courant est propriétaire (owner). À utiliser quand un gérant demande 'mes établissements', 'mes lieux', ou avant d'appeler get_venue_revenue/get_venue_payable s'il a plusieurs venues. Tableau vide si l'utilisateur n'est pas gérant.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_venue_revenue",
    description:
      "KPIs revenus d'un venue (gérant only) : brut, commission Soutra-Playce, net, frais facturés, variation vs période précédente. Période en jours : 7, 30 ou 90. RLS vérifie ownership.",
    input_schema: {
      type: "object",
      properties: {
        venue_id: { type: "string", description: "UUID du venue (issu de list_my_venues)." },
        days: { type: "number", description: "Fenêtre temporelle en jours (7, 30 ou 90). Défaut 30." },
      },
      required: ["venue_id"],
    },
  },
  {
    name: "get_venue_payable",
    description:
      "Solde payable d'un venue (gérant only) : ce qui peut être retiré immédiatement via mobile money. Retourne { gross, commission, net, pending, paid, payable }. Si payable > 0, propose navigate_to(/venue-payout?venueId=…).",
    input_schema: {
      type: "object",
      properties: {
        venue_id: { type: "string", description: "UUID du venue." },
      },
      required: ["venue_id"],
    },
  },
  {
    name: "list_venue_payouts",
    description:
      "Liste les 10 derniers payouts d'un venue (gérant only) avec status, montant, opérateur, date. Utile pour 'mes derniers retraits', 'mon historique de virements'.",
    input_schema: {
      type: "object",
      properties: {
        venue_id: { type: "string", description: "UUID du venue." },
      },
      required: ["venue_id"],
    },
  },
  {
    name: "list_venue_reservations_pro",
    description:
      "Liste les réservations ENTRANTES sur un de mes venues (vue gérant — toutes les résas, pas juste les miennes). À utiliser pour 'mes réservations chez {venue}', 'qui vient ce soir', 'mes prochaines résas'.",
    input_schema: {
      type: "object",
      properties: {
        venue_id: { type: "string", description: "UUID du venue (doit être un de mes venues)." },
        status: { type: "string", description: "Filtre optionnel : pending, confirmed, arrived, no_show, cancelled." },
        upcoming_only: { type: "boolean", description: "Si true, ne retourne que les résas à date future. Défaut false." },
      },
      required: ["venue_id"],
    },
  },
  // ─── Phase 8 : Mode admin (réservé aux comptes role='admin') ─────────
  {
    name: "get_platform_stats",
    description:
      "Statistiques globales de la plateforme (ADMIN ONLY). Sources : monetization_revenue_log (revenus Soutra), reservations (count), venue_revenue_summary view (top venues). Refusé si caller n'est pas admin.",
    input_schema: {
      type: "object",
      properties: {
        scope: { type: "string", description: "'today', 'week', 'month' — la fenêtre temporelle. Défaut 'today'." },
        top_venues: { type: "boolean", description: "Si true, inclut le top 5 des venues par revenus. Défaut false." },
      },
      required: [],
    },
  },
  // ─── Phase 10 : Mode pro WRITE (création/édition vocale) ────────────
  {
    name: "create_promo",
    description:
      "Crée un code promo pour un de mes venues (gérant only). Pattern dry_run obligatoire : dry_run=true pour récap + confirmation orale, dry_run=false pour persister. RLS vérifie ownership.",
    input_schema: {
      type: "object",
      properties: {
        venue_id: { type: "string", description: "UUID du venue (obtenu via list_my_venues)." },
        discount_pct: { type: "number", description: "Pourcentage de réduction (1-100). Ex: 20 pour -20%." },
        code: { type: "string", description: "Code promo (2-32 chars). Si absent, auto-généré (PROMO-YYMMDD-NNNN)." },
        valid_until: { type: "string", description: "ISO 8601 date d'expiration. Ex: 2026-06-10T21:00:00+00:00 pour 'jusqu'à 21h ce vendredi'. Null = pas d'expiration." },
        max_uses: { type: "number", description: "Nb max d'utilisations. Null = illimité." },
        dry_run: { type: "boolean", description: "True = simule sans écrire / False = crée vraiment." },
      },
      required: ["venue_id", "discount_pct", "dry_run"],
    },
  },
  {
    name: "publish_event",
    description:
      "Publie un événement pour un de mes venues (gérant only). Pattern dry_run obligatoire. Status sera 'published' direct. Si price_xof fourni, crée un tier billet 'Standard'.",
    input_schema: {
      type: "object",
      properties: {
        venue_id: { type: "string", description: "UUID du venue." },
        title: { type: "string", description: "Titre de l'événement (3-120 chars)." },
        starts_at: { type: "string", description: "ISO 8601 début. Ex: 2026-06-15T20:00:00+00:00." },
        duration_hours: { type: "number", description: "Durée en heures (calcule ends_at = starts_at + h). Défaut 4." },
        capacity: { type: "number", description: "Nb max de places. Optionnel." },
        price_xof: { type: "number", description: "Prix d'un billet en FCFA. Si null/0, événement gratuit." },
        description: { type: "string", description: "Description (max 1000 chars). Optionnel." },
        dry_run: { type: "boolean", description: "True = simule / False = publie vraiment." },
      },
      required: ["venue_id", "title", "starts_at", "dry_run"],
    },
  },
  {
    name: "update_venue_hours",
    description:
      "Met à jour les horaires d'ouverture d'un de mes venues pour un jour précis. Pattern dry_run.",
    input_schema: {
      type: "object",
      properties: {
        venue_id: { type: "string", description: "UUID du venue." },
        day: { type: "string", description: "'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'." },
        opens: { type: "string", description: "Heure d'ouverture HH:MM. Ex: '12:00'." },
        closes: { type: "string", description: "Heure de fermeture HH:MM. Ex: '23:00' (ou '02:00' pour 2h du matin = jour suivant)." },
        closed: { type: "boolean", description: "Si true, marque ce jour comme fermé (ignore opens/closes)." },
        dry_run: { type: "boolean", description: "True = simule / False = applique." },
      },
      required: ["venue_id", "day", "dry_run"],
    },
  },
  {
    name: "update_venue_pricing",
    description:
      "Met à jour le prix moyen par personne d'un de mes venues. Affecte le calcul d'acompte des réservations futures. Pattern dry_run.",
    input_schema: {
      type: "object",
      properties: {
        venue_id: { type: "string", description: "UUID du venue." },
        avg_price_xof: { type: "number", description: "Nouveau prix moyen par personne en FCFA (≥ 500)." },
        dry_run: { type: "boolean", description: "True = simule / False = applique." },
      },
      required: ["venue_id", "avg_price_xof", "dry_run"],
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
  /**
   * Header Authorization du caller (Bearer ...) — utilisé pour ouvrir un
   * client user-auth quand un tool a besoin de auth.uid() côté SQL
   * (RPCs assert_venue_owner_or_admin, is_admin, etc.).
   */
  authHeader: string | null;
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

// Phase 9 — Cards premium retournées avec la réponse Sia. Le client les rend
// inline entre les bulles texte (chaque card = composant SiaVenueCard).
interface VenueCard {
  id: string;
  kind: "venue";
  venue_id: string;
  name: string;
  category?: string | null;
  city?: string | null;
  district?: string | null;
  cover_url?: string | null;
  avg_price_xof?: number | null;
  rating_avg?: number | null;
  rating_count?: number | null;
  distance_km?: number | null;
  is_open_now?: boolean | null;
  /** Badges (Promo, Tendance, Ouvert, etc.) — affichage card */
  badges?: Array<{ label: string; tone: "primary" | "success" | "amber" | "danger" }>;
}

// Phase 9 — Itinéraire structuré pour plan_outing
interface ItineraryStep {
  order: number;
  time?: string;        // ex: "19h00"
  kind: string;         // ex: "Dîner", "Bar", "Activité", "Transport"
  activity_label: string;
  venue_id?: string | null;
  venue_name?: string | null;
  est_cost_xof: number;
  notes?: string;
}

interface Itinerary {
  occasion: string;
  party_size: number;
  budget_xof: number;
  total_estimated_xof: number;
  remaining_xof: number;
  steps: ItineraryStep[];
}

interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  action?: ServerAction;
  /** Phase 9 : cards venues à rendre inline dans la conversation */
  cards?: VenueCard[];
  /** Phase 9 : itinéraire structuré (plan_outing) */
  itinerary?: Itinerary;
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
          city: string | null; cover_url: string | null;
          avg_price_xof: number | null;
          rating_avg: number | null; rating_count: number | null;
          distance_km: number | null;
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

        // Phase 9 : génère des cards à rendre inline dans la convo
        const cards: VenueCard[] = results.map((v) => {
          const badges: VenueCard["badges"] = [];
          if (v.is_open_now === true) badges.push({ label: "Ouvert", tone: "success" });
          if ((v.rating_avg ?? 0) >= 4.5) badges.push({ label: "Top noté", tone: "primary" });
          return {
            id: `venue-${v.id}`,
            kind: "venue",
            venue_id: v.id,
            name: v.name,
            category: v.category,
            city: v.city,
            district: v.district,
            cover_url: v.cover_url,
            avg_price_xof: v.avg_price_xof,
            rating_avg: v.rating_avg,
            rating_count: v.rating_count,
            distance_km: v.distance_km,
            is_open_now: v.is_open_now,
            badges,
          };
        });

        return {
          success: true,
          data: { count: results.length, venues: results },
          cards,
        };
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

      case "plan_outing": {
        const budgetXof = Math.max(0, Number(input.budget_xof ?? 0));
        if (budgetXof <= 0) return { success: false, error: "budget_xof requis" };
        const partySize = Math.max(1, Math.min(20, Number(input.party_size ?? 2)));
        const occasion = String(input.occasion ?? "solo");
        const maxDistanceKm = Math.max(1, Math.min(50, Number(input.max_distance_km ?? 15)));
        const baseTime = input.date_time
          ? new Date(String(input.date_time))
          : new Date();

        // Templates par occasion : catégories + fractions de budget allouées
        type Step = { kind: string; cat: string; budget_frac: number; time_offset_min: number };
        const TEMPLATES: Record<string, Step[]> = {
          solo: [
            { kind: "Dîner", cat: "restaurant", budget_frac: 0.55, time_offset_min: 0 },
            { kind: "Bar / Lounge", cat: "bar", budget_frac: 0.25, time_offset_min: 90 },
            { kind: "Transport", cat: "transport", budget_frac: 0.15, time_offset_min: 180 },
          ],
          couple: [
            { kind: "Dîner romantique", cat: "restaurant", budget_frac: 0.5, time_offset_min: 0 },
            { kind: "Cocktails", cat: "lounge", budget_frac: 0.25, time_offset_min: 90 },
            { kind: "Activité", cat: "centre_loisirs", budget_frac: 0.1, time_offset_min: 180 },
            { kind: "Transport", cat: "transport", budget_frac: 0.1, time_offset_min: 240 },
          ],
          friends: [
            { kind: "Maquis / Resto", cat: "maquis", budget_frac: 0.4, time_offset_min: 0 },
            { kind: "Club / Lounge", cat: "club", budget_frac: 0.35, time_offset_min: 120 },
            { kind: "Transport", cat: "transport", budget_frac: 0.15, time_offset_min: 240 },
          ],
          family: [
            { kind: "Activité familiale", cat: "centre_loisirs", budget_frac: 0.35, time_offset_min: 0 },
            { kind: "Repas en famille", cat: "restaurant", budget_frac: 0.45, time_offset_min: 120 },
            { kind: "Transport", cat: "transport", budget_frac: 0.15, time_offset_min: 240 },
          ],
          weekend: [
            { kind: "Vendredi soir — dîner", cat: "restaurant", budget_frac: 0.2, time_offset_min: 0 },
            { kind: "Vendredi soir — bar", cat: "lounge", budget_frac: 0.1, time_offset_min: 120 },
            { kind: "Samedi — déjeuner", cat: "restaurant", budget_frac: 0.15, time_offset_min: 1080 },
            { kind: "Samedi — activité", cat: "centre_loisirs", budget_frac: 0.15, time_offset_min: 1200 },
            { kind: "Samedi — sortie", cat: "club", budget_frac: 0.15, time_offset_min: 1440 },
            { kind: "Dimanche — brunch", cat: "cafe", budget_frac: 0.1, time_offset_min: 2520 },
          ],
          bored: [
            { kind: "Sortie immédiate", cat: "maquis", budget_frac: 0.5, time_offset_min: 0 },
            { kind: "Café / dessert", cat: "cafe", budget_frac: 0.25, time_offset_min: 90 },
            { kind: "Transport", cat: "transport", budget_frac: 0.15, time_offset_min: 150 },
          ],
        };
        const template = TEMPLATES[occasion] ?? TEMPLATES.solo;

        // Pour chaque étape avec catégorie venue (pas transport), recherche
        // un venue proche dans le budget de l'étape.
        const steps: ItineraryStep[] = [];
        const cards: VenueCard[] = [];
        let totalAllocated = 0;

        for (let i = 0; i < template.length; i++) {
          const step = template[i];
          const stepBudget = Math.round(budgetXof * step.budget_frac);
          const stepTime = new Date(baseTime.getTime() + step.time_offset_min * 60_000);
          const timeLabel = stepTime.toLocaleString("fr-FR", {
            weekday: "short",
            hour: "2-digit",
            minute: "2-digit",
          });

          if (step.cat === "transport") {
            steps.push({
              order: i + 1,
              time: timeLabel,
              kind: step.kind,
              activity_label: "Taxi / VTC",
              est_cost_xof: stepBudget,
              notes: undefined,
            });
            totalAllocated += stepBudget;
            continue;
          }

          // Cherche un venue de la catégorie ciblée dans le budget step
          const maxPxPerPerson = Math.round(stepBudget / partySize);
          const { data: rows } = await ctx.svc.rpc("search_venues_nearby", {
            p_lat: ctx.userLat,
            p_lng: ctx.userLng,
            p_radius_km: maxDistanceKm,
            p_category: step.cat,
            p_open_now: false,
          });
          const list = (rows ?? []) as Array<{
            id: string; name: string; category: string; district: string | null;
            city: string | null; cover_url: string | null;
            avg_price_xof: number | null;
            rating_avg: number | null; rating_count: number | null;
            distance_km: number | null;
            is_open_now: boolean | null;
          }>;
          // Filtre prix puis prend le mieux noté
          const eligible = list
            .filter((v) => v.avg_price_xof == null || v.avg_price_xof <= maxPxPerPerson)
            .sort((a, b) => (b.rating_avg ?? 0) - (a.rating_avg ?? 0));
          const chosen = eligible[0] ?? list.sort((a, b) => (b.rating_avg ?? 0) - (a.rating_avg ?? 0))[0];

          if (chosen) {
            steps.push({
              order: i + 1,
              time: timeLabel,
              kind: step.kind,
              activity_label: chosen.name,
              venue_id: chosen.id,
              venue_name: chosen.name,
              est_cost_xof: stepBudget,
              notes: chosen.district ?? chosen.city ?? undefined,
            });
            cards.push({
              id: `step-${i + 1}-${chosen.id}`,
              kind: "venue",
              venue_id: chosen.id,
              name: chosen.name,
              category: chosen.category,
              city: chosen.city,
              district: chosen.district,
              cover_url: chosen.cover_url,
              avg_price_xof: chosen.avg_price_xof,
              rating_avg: chosen.rating_avg,
              rating_count: chosen.rating_count,
              distance_km: chosen.distance_km,
              is_open_now: chosen.is_open_now,
              badges: [{ label: `Étape ${i + 1}`, tone: "primary" }],
            });
            totalAllocated += stepBudget;
          } else {
            steps.push({
              order: i + 1,
              time: timeLabel,
              kind: step.kind,
              activity_label: "À choisir",
              est_cost_xof: stepBudget,
              notes: "Aucun lieu trouvé dans ce budget",
            });
            totalAllocated += stepBudget;
          }
        }

        const itinerary: Itinerary = {
          occasion,
          party_size: partySize,
          budget_xof: budgetXof,
          total_estimated_xof: totalAllocated,
          remaining_xof: Math.max(0, budgetXof - totalAllocated),
          steps,
        };

        return {
          success: true,
          data: {
            occasion, party_size: partySize, budget_xof: budgetXof,
            steps_count: steps.length, total_xof: totalAllocated,
            next_step: "Annonce le total et 1 phrase teaser. L'UI rend les cards + timeline. Pas besoin de lister chaque étape à voix haute.",
          },
          cards,
          itinerary,
        };
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

      // ──────────────────────────────────────────────────────────────────
      // Phase 8 — Mode pro / gérant
      // Les RPCs `list_my_pro_venues`, `get_pro_revenue_summary`,
      // `get_venue_payable_balance`, `list_venue_payouts` vérifient
      // ownership côté SQL (assert_venue_owner_or_admin).
      // ──────────────────────────────────────────────────────────────────

      case "list_my_venues": {
        // list_my_pro_venues utilise auth.uid() côté SQL — on doit l'appeler
        // avec un client user-authenticated (pas service_role).
        const userClient = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_ANON_KEY")!,
          {
            auth: { persistSession: false, autoRefreshToken: false },
            global: { headers: { Authorization: ctx.authHeader ?? "" } },
          },
        );
        const { data, error } = await userClient.rpc("list_my_pro_venues");
        if (error) return { success: false, error: error.message };
        return {
          success: true,
          data: { count: (data ?? []).length, venues: data ?? [] },
        };
      }

      case "get_venue_revenue": {
        const venueId = String(input.venue_id ?? "");
        const days = Math.max(1, Math.min(180, Number(input.days ?? 30)));
        if (!venueId) return { success: false, error: "venue_id requis" };
        const from = new Date(Date.now() - days * 86400000).toISOString();
        const to = new Date().toISOString();
        const userClient = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_ANON_KEY")!,
          {
            auth: { persistSession: false, autoRefreshToken: false },
            global: { headers: { Authorization: ctx.authHeader ?? "" } },
          },
        );
        const { data, error } = await userClient.rpc("get_pro_revenue_summary", {
          p_venue_id: venueId, p_from: from, p_to: to,
        });
        if (error) {
          const raw = error.message ?? "";
          if (raw.includes("NOT_OWNER")) return { success: false, error: "Ce venue n'est pas un de tes établissements" };
          if (raw.includes("NOT_AUTHENTICATED")) return { success: false, error: "Authentification requise" };
          return { success: false, error: raw };
        }
        return { success: true, data: { ...((data as object) ?? {}), period_days: days } };
      }

      case "get_venue_payable": {
        const venueId = String(input.venue_id ?? "");
        if (!venueId) return { success: false, error: "venue_id requis" };
        const userClient = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_ANON_KEY")!,
          {
            auth: { persistSession: false, autoRefreshToken: false },
            global: { headers: { Authorization: ctx.authHeader ?? "" } },
          },
        );
        const { data, error } = await userClient.rpc("get_venue_payable_balance", { p_venue_id: venueId });
        if (error) {
          const raw = error.message ?? "";
          if (raw.includes("NOT_OWNER")) return { success: false, error: "Ce venue n'est pas un de tes établissements" };
          return { success: false, error: raw };
        }
        return { success: true, data };
      }

      case "list_venue_payouts": {
        const venueId = String(input.venue_id ?? "");
        if (!venueId) return { success: false, error: "venue_id requis" };
        const userClient = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_ANON_KEY")!,
          {
            auth: { persistSession: false, autoRefreshToken: false },
            global: { headers: { Authorization: ctx.authHeader ?? "" } },
          },
        );
        const { data, error } = await userClient.rpc("list_venue_payouts", {
          p_venue_id: venueId, p_limit: 10,
        });
        if (error) {
          const raw = error.message ?? "";
          if (raw.includes("NOT_OWNER")) return { success: false, error: "Ce venue n'est pas un de tes établissements" };
          return { success: false, error: raw };
        }
        return { success: true, data: { count: (data ?? []).length, payouts: data ?? [] } };
      }

      case "list_venue_reservations_pro": {
        const venueId = String(input.venue_id ?? "");
        if (!venueId) return { success: false, error: "venue_id requis" };
        const upcomingOnly = input.upcoming_only === true;
        const statusFilter = typeof input.status === "string" ? input.status : null;

        // Vérification ownership : on liste mes venues d'abord
        const userClient = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_ANON_KEY")!,
          {
            auth: { persistSession: false, autoRefreshToken: false },
            global: { headers: { Authorization: ctx.authHeader ?? "" } },
          },
        );
        const { data: myVenues } = await userClient.rpc("list_my_pro_venues");
        const owned = (myVenues as Array<{ id: string }> | null)?.some((v) => v.id === venueId);
        if (!owned) {
          return { success: false, error: "Ce venue n'est pas un de tes établissements" };
        }

        // Lecture via service_role pour bypass la RLS user-only sur reservations
        let q = ctx.svc
          .from("reservations")
          .select("id, user_id, date_time, party_size, deposit_xof, status, notes, created_at")
          .eq("venue_id", venueId)
          .order("date_time", { ascending: false })
          .limit(20);
        if (statusFilter) q = q.eq("status", statusFilter);
        if (upcomingOnly) q = q.gte("date_time", new Date().toISOString());
        const { data, error } = await q;
        if (error) return { success: false, error: error.message };
        return { success: true, data: { count: (data ?? []).length, reservations: data ?? [] } };
      }

      // ──────────────────────────────────────────────────────────────────
      // Phase 8 — Mode admin (vérifie role='admin' côté serveur via is_admin)
      // ──────────────────────────────────────────────────────────────────

      case "get_platform_stats": {
        // Vérifie le rôle admin via la fonction SQL is_admin() qui regarde
        // profiles.role.
        const userClient = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_ANON_KEY")!,
          {
            auth: { persistSession: false, autoRefreshToken: false },
            global: { headers: { Authorization: ctx.authHeader ?? "" } },
          },
        );
        const { data: adminCheck } = await userClient.rpc("is_admin");
        if (adminCheck !== true) {
          return { success: false, error: "Réservé aux administrateurs Soutra-Playce" };
        }

        const scope = String(input.scope ?? "today");
        const includeTop = input.top_venues === true;
        let since: Date;
        const now = new Date();
        switch (scope) {
          case "week":  since = new Date(now.getTime() - 7 * 86400000); break;
          case "month": since = new Date(now.getTime() - 30 * 86400000); break;
          default:      since = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // today 00:00
        }

        // Revenus Soutra (commissions) + count réservations en parallèle
        const [revRes, resaRes] = await Promise.all([
          ctx.svc
            .from("monetization_revenue_log")
            .select("amount_xof", { count: "exact" })
            .gte("ts", since.toISOString()),
          ctx.svc
            .from("reservations")
            .select("id", { count: "exact", head: true })
            .gte("created_at", since.toISOString()),
        ]);
        const revenueRows = (revRes.data as Array<{ amount_xof: number }> | null) ?? [];
        const totalRevenueXof = revenueRows.reduce((s, r) => s + (r.amount_xof ?? 0), 0);
        const reservationCount = resaRes.count ?? 0;

        const result: Record<string, unknown> = {
          scope,
          since: since.toISOString(),
          revenue_events_count: revRes.count ?? 0,
          total_revenue_xof: totalRevenueXof,
          reservation_count: reservationCount,
        };

        if (includeTop) {
          // venue_revenue_summary view (migration 0042) — déjà agrégée
          const { data: top } = await ctx.svc
            .from("venue_revenue_summary")
            .select("venue_id, venue_name, category, city, total_xof, event_count, last_event_at")
            .order("total_xof", { ascending: false })
            .limit(5);
          result.top_venues = top ?? [];
        }

        return { success: true, data: result };
      }

      // ──────────────────────────────────────────────────────────────────
      // Phase 10 — Mode pro WRITE (création/édition vocale)
      // Tous les tools ci-dessous utilisent un client user-auth. Les RLS
      // sur promo_codes / events / venues vérifient déjà ownership via
      // owner_id = auth.uid() (cf. migrations 0001/0002/0015) — pas
      // besoin de double check inline.
      // ──────────────────────────────────────────────────────────────────

      case "create_promo": {
        const venueId = String(input.venue_id ?? "");
        const discountPct = Math.round(Number(input.discount_pct ?? 0));
        const dryRun = input.dry_run !== false;
        if (!venueId) return { success: false, error: "venue_id requis" };
        if (!Number.isInteger(discountPct) || discountPct < 1 || discountPct > 100) {
          return { success: false, error: "discount_pct entre 1 et 100" };
        }
        const validUntil = typeof input.valid_until === "string" ? String(input.valid_until) : null;
        const maxUses = typeof input.max_uses === "number" ? Math.max(1, Math.round(input.max_uses)) : null;
        let code = typeof input.code === "string" ? input.code.trim().toUpperCase() : "";
        if (!code) {
          // Auto-générée : PROMO-YYMMDD-XXXX
          const d = new Date();
          const yymmdd = `${String(d.getUTCFullYear()).slice(-2)}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
          const rand = Math.floor(1000 + Math.random() * 9000);
          code = `PROMO-${yymmdd}-${rand}`;
        }
        if (code.length < 2 || code.length > 32) {
          return { success: false, error: "code doit faire 2-32 chars" };
        }

        // Validation venue name pour confirmation orale (RLS appliquée via
        // service_role-bypass mais on lit juste le nom — public)
        const { data: venue } = await ctx.svc
          .from("venues")
          .select("id, name, owner_id, status")
          .eq("id", venueId)
          .maybeSingle();
        if (!venue) return { success: false, error: "Établissement introuvable" };
        const v = venue as { id: string; name: string; owner_id: string; status: string };
        if (v.owner_id !== ctx.userId) return { success: false, error: "Ce venue n'est pas un de tes établissements" };

        if (dryRun) {
          return {
            success: true,
            data: {
              dry_run: true,
              venue_id: v.id,
              venue_name: v.name,
              code,
              discount_pct: discountPct,
              valid_until: validUntil,
              max_uses: maxUses,
              next_step: "Demande confirmation orale. Si oui, rappelle create_promo avec dry_run=false et MÊMES paramètres (notamment le code généré).",
            },
          };
        }

        // Écriture via user-auth client (RLS = INSERT autorisé pour owner)
        const userClient = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_ANON_KEY")!,
          {
            auth: { persistSession: false, autoRefreshToken: false },
            global: { headers: { Authorization: ctx.authHeader ?? "" } },
          },
        );
        const { data: created, error: insertErr } = await userClient
          .from("promo_codes")
          .insert({
            venue_id: v.id,
            code,
            discount_pct: discountPct,
            valid_until: validUntil,
            max_uses: maxUses,
            active: true,
          })
          .select("id, code, discount_pct, valid_until, max_uses")
          .single();
        if (insertErr) {
          if (insertErr.message.includes("ux_promo_codes_venue_code")) {
            return { success: false, error: `Le code "${code}" existe déjà pour ce venue` };
          }
          return { success: false, error: insertErr.message };
        }
        return {
          success: true,
          data: {
            dry_run: false,
            promo_id: (created as { id: string }).id,
            venue_name: v.name,
            ...created,
            next_step: "Promo créée. Annonce le code à l'utilisateur et propose navigate_to(/pro?tab=marketing) pour voir la liste.",
          },
        };
      }

      case "publish_event": {
        const venueId = String(input.venue_id ?? "");
        const title = String(input.title ?? "").trim();
        const startsAt = String(input.start_at ?? input.starts_at ?? "");
        const durationHours = Math.max(0.5, Math.min(24, Number(input.duration_hours ?? 4)));
        const capacity = typeof input.capacity === "number" ? Math.max(1, Math.round(input.capacity)) : null;
        const priceXof = typeof input.price_xof === "number" ? Math.max(0, Math.round(input.price_xof)) : 0;
        const description = typeof input.description === "string" ? input.description.slice(0, 1000) : null;
        const dryRun = input.dry_run !== false;

        if (!venueId) return { success: false, error: "venue_id requis" };
        if (title.length < 3 || title.length > 120) {
          return { success: false, error: "title doit faire 3-120 chars" };
        }
        const startsTs = Date.parse(startsAt);
        if (Number.isNaN(startsTs)) {
          return { success: false, error: "starts_at invalide (ISO 8601 attendu)" };
        }
        if (startsTs < Date.now() - 60 * 60 * 1000) {
          return { success: false, error: "L'événement est dans le passé" };
        }
        const endsAt = new Date(startsTs + durationHours * 60 * 60 * 1000).toISOString();

        // Validation venue
        const { data: venue } = await ctx.svc
          .from("venues")
          .select("id, name, owner_id, city")
          .eq("id", venueId)
          .maybeSingle();
        if (!venue) return { success: false, error: "Établissement introuvable" };
        const v = venue as { id: string; name: string; owner_id: string; city: string };
        if (v.owner_id !== ctx.userId) return { success: false, error: "Ce venue n'est pas un de tes établissements" };

        if (dryRun) {
          return {
            success: true,
            data: {
              dry_run: true,
              venue_id: v.id,
              venue_name: v.name,
              title,
              starts_at: new Date(startsTs).toISOString(),
              ends_at: endsAt,
              capacity,
              price_xof: priceXof,
              ticket_kind: priceXof > 0 ? "paid" : "free",
              next_step: "Demande confirmation orale. Si oui, rappelle publish_event avec dry_run=false ET les mêmes paramètres.",
            },
          };
        }

        // Slug : titre slugifié + timestamp suffix pour unicité
        const slug = (
          title.toLowerCase()
            .normalize("NFD").replace(/[̀-ͯ]/g, "")
            .replace(/[^a-z0-9]+/g, "-").replace(/(^-+|-+$)/g, "")
          + "-" + String(startsTs).slice(-6)
        ).slice(0, 80);

        const ticketTiers = priceXof > 0
          ? [{ name: "Standard", price_xof: priceXof, qty: capacity ?? 100, sold: 0 }]
          : [];

        const userClient = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_ANON_KEY")!,
          {
            auth: { persistSession: false, autoRefreshToken: false },
            global: { headers: { Authorization: ctx.authHeader ?? "" } },
          },
        );
        const { data: created, error: insertErr } = await userClient
          .from("events")
          .insert({
            organizer_id: ctx.userId,
            venue_id: v.id,
            title,
            slug,
            description,
            starts_at: new Date(startsTs).toISOString(),
            ends_at: endsAt,
            capacity,
            ticket_tiers: ticketTiers,
            status: "published",
            city: v.city ?? "Abidjan",
          })
          .select("id, title, slug, starts_at, ends_at, status")
          .single();
        if (insertErr) {
          if (insertErr.message.toLowerCase().includes("unique") && insertErr.message.includes("slug")) {
            return { success: false, error: "Un événement avec un slug similaire existe déjà — change le titre" };
          }
          return { success: false, error: insertErr.message };
        }
        return {
          success: true,
          data: {
            dry_run: false,
            event_id: (created as { id: string }).id,
            venue_name: v.name,
            ...created,
            next_step: "Événement publié. Propose navigate_to(/pro?tab=events).",
          },
        };
      }

      case "update_venue_hours": {
        const venueId = String(input.venue_id ?? "");
        const day = String(input.day ?? "").toLowerCase();
        const opens = typeof input.opens === "string" ? input.opens : "";
        const closes = typeof input.closes === "string" ? input.closes : "";
        const closed = input.closed === true;
        const dryRun = input.dry_run !== false;

        if (!venueId) return { success: false, error: "venue_id requis" };
        const validDays = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
        if (!validDays.includes(day)) {
          return { success: false, error: "day doit être mon/tue/wed/thu/fri/sat/sun" };
        }
        const hourRe = /^([01]?\d|2[0-3]):[0-5]\d$/;
        if (!closed) {
          if (!hourRe.test(opens)) return { success: false, error: "opens doit être au format HH:MM" };
          if (!hourRe.test(closes)) return { success: false, error: "closes doit être au format HH:MM" };
        }

        const { data: venue } = await ctx.svc
          .from("venues")
          .select("id, name, owner_id, opening_hours")
          .eq("id", venueId)
          .maybeSingle();
        if (!venue) return { success: false, error: "Établissement introuvable" };
        const v = venue as { id: string; name: string; owner_id: string; opening_hours: Record<string, unknown> | null };
        if (v.owner_id !== ctx.userId) return { success: false, error: "Ce venue n'est pas un de tes établissements" };

        const newHours = { ...(v.opening_hours ?? {}) } as Record<string, unknown>;
        if (closed) {
          newHours[day] = null;
        } else {
          newHours[day] = [opens, closes];
        }

        if (dryRun) {
          return {
            success: true,
            data: {
              dry_run: true,
              venue_name: v.name,
              day,
              new_value: closed ? "Fermé" : `${opens} → ${closes}`,
              next_step: "Demande confirmation orale puis rappelle avec dry_run=false.",
            },
          };
        }

        const userClient = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_ANON_KEY")!,
          {
            auth: { persistSession: false, autoRefreshToken: false },
            global: { headers: { Authorization: ctx.authHeader ?? "" } },
          },
        );
        const { error: updErr } = await userClient
          .from("venues")
          .update({ opening_hours: newHours })
          .eq("id", v.id);
        if (updErr) return { success: false, error: updErr.message };

        return {
          success: true,
          data: {
            dry_run: false,
            venue_name: v.name,
            day,
            new_value: closed ? "Fermé" : `${opens}-${closes}`,
            next_step: "Horaire modifié. Annonce-le brièvement.",
          },
        };
      }

      case "update_venue_pricing": {
        const venueId = String(input.venue_id ?? "");
        const avgPriceXof = Math.round(Number(input.avg_price_xof ?? 0));
        const dryRun = input.dry_run !== false;

        if (!venueId) return { success: false, error: "venue_id requis" };
        if (avgPriceXof < 500 || avgPriceXof > 500000) {
          return { success: false, error: "avg_price_xof doit être entre 500 et 500 000 FCFA" };
        }

        const { data: venue } = await ctx.svc
          .from("venues")
          .select("id, name, owner_id, avg_price_xof")
          .eq("id", venueId)
          .maybeSingle();
        if (!venue) return { success: false, error: "Établissement introuvable" };
        const v = venue as { id: string; name: string; owner_id: string; avg_price_xof: number | null };
        if (v.owner_id !== ctx.userId) return { success: false, error: "Ce venue n'est pas un de tes établissements" };

        if (dryRun) {
          return {
            success: true,
            data: {
              dry_run: true,
              venue_name: v.name,
              old_price_xof: v.avg_price_xof,
              new_price_xof: avgPriceXof,
              next_step: "Demande confirmation orale puis rappelle avec dry_run=false.",
            },
          };
        }

        const userClient = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_ANON_KEY")!,
          {
            auth: { persistSession: false, autoRefreshToken: false },
            global: { headers: { Authorization: ctx.authHeader ?? "" } },
          },
        );
        const { error: updErr } = await userClient
          .from("venues")
          .update({ avg_price_xof: avgPriceXof })
          .eq("id", v.id);
        if (updErr) return { success: false, error: updErr.message };

        return {
          success: true,
          data: {
            dry_run: false,
            venue_name: v.name,
            new_price_xof: avgPriceXof,
            next_step: "Prix mis à jour. Annonce-le brièvement.",
          },
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
    authHeader: req.headers.get("Authorization"),
  };

  // Actions, cards et itinerary accumulés au fil des tool_use → transmis client.
  const actions: ServerAction[] = [];
  const allCards: VenueCard[] = [];
  let bestItinerary: Itinerary | null = null;

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
            if (out.cards && out.cards.length > 0) allCards.push(...out.cards);
            if (out.itinerary) bestItinerary = out.itinerary; // dernière itinerary gagne
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

    // Détection langue de la réponse de Sia (pour piloter le TTS côté client).
    // On détecte sur le reply, pas le user message — car on veut speaker dans
    // la langue dans laquelle Sia A REPONDU (peut différer si Sia choisit
    // d'inviter à reformuler en français).
    const detectedLanguage = detectLanguage(finalText);

    // Dédoublonne les cards par venue_id (un venue peut être trouvé via
    // plusieurs tools ; on garde la 1re occurrence avec son badge).
    const dedupedCards: VenueCard[] = [];
    const seen = new Set<string>();
    for (const card of allCards) {
      if (seen.has(card.venue_id)) continue;
      seen.add(card.venue_id);
      dedupedCards.push(card);
    }

    return jsonResponse({
      reply: finalText,
      actions: actions.length > 0 ? actions : undefined,
      cards: dedupedCards.length > 0 ? dedupedCards : undefined,
      itinerary: bestItinerary ?? undefined,
      detected_language: detectedLanguage,
      iterations,
      usage: lastUsage,
      model: lastModel,
    });
  } catch (err) {
    console.error("[chatbot] fatal:", err);
    return jsonResponse({ error: "Impossible de contacter le moteur de l'assistant" }, 502);
  }
});
