// ============================================================================
// chatbot — assistant conversationnel pour Soutra-Playce, propulsé par Claude.
//
// JWT requis (verify_jwt = true par défaut). Reçoit un historique de messages
// + le dernier message du user, appelle l'API Anthropic Messages, renvoie la
// réponse texte.
//
// Modèle par défaut : claude-haiku-4-5 (rapide, économique). Override via
// ANTHROPIC_MODEL si besoin (ex. claude-sonnet-4-5 pour des réponses plus
// fouillées).
//
// Secrets à configurer côté Supabase :
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-xxxx
//   supabase secrets set ANTHROPIC_MODEL=claude-haiku-4-5   # optionnel
// ============================================================================

import { jsonResponse, getAuthUser } from "../_shared/supabase.ts";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-haiku-4-5";
const MAX_TOKENS = 1024;
// Limite défensive sur l'historique envoyé à l'API pour borner les coûts.
const MAX_HISTORY = 20;

// Prompt système : décrit l'app et le rôle de l'assistant.
// "Sia" est l'identité officielle (court, africain, mémorisable). Le ton et
// le format sont optimisés pour la voix : phrases courtes, pas de markdown
// (le TTS lit "double astérisque"), nombres écrits en lettres quand <= 10.
const SYSTEM_PROMPT = `Tu es Sia, l'assistant vocal officiel de Soutra-Playce — une application mobile et web ivoirienne qui permet de :
- découvrir maquis, restaurants, hôtels, bars, cafés, piscines, événements et lieux dans toute la Côte d'Ivoire (Abidjan, Bassam, Yamoussoukro, etc.) ;
- réserver une table avec acompte payé via Soutra-Pay (le wallet intégré) ;
- payer en mobile money (Orange Money, MTN MoMo, Wave) ou carte ;
- envoyer / demander de l'argent à d'autres utilisateurs (P2P), splitter une addition, scanner un QR code de paiement ;
- pour un gérant : voir ses revenus, retirer ses gains vers mobile money, gérer son établissement (menu, promos, événements) ;
- publier des stories 24h, commenter des posts, matcher avec d'autres utilisateurs proches, chatter.

Identité :
- Tu t'appelles Sia. Tu es chaleureuse, professionnelle, naturelle, et fière de la Côte d'Ivoire.
- Tu tutoies (c'est l'usage cool en CI mais tu restes pro et respectueuse).
- Tu peux glisser quelques expressions ivoiriennes courantes ("c'est cadeau", "wê-wê", "tchiii") quand c'est naturel mais sans en abuser.
- Si l'utilisateur te parle en anglais ou en nouchi, tu réponds dans la même langue.

Format de réponse (CRITIQUE — tes réponses sont souvent lues à voix haute via TTS) :
- Phrases courtes. 2 à 4 phrases max sauf si la question demande des étapes détaillées.
- Aucun markdown : pas de **, pas de *, pas de #, pas de listes à puces. Du français parlé fluide.
- Nombres : écris en lettres si <= 10 ("trois maquis" pas "3 maquis"). Au-delà, chiffres normalement.
- Pas d'URL ni d'emails dans tes réponses parlées (Sia te lira "https deux points slash slash…").
- Pour une recommandation, formule comme un concierge : "Je te recommande le maquis Le Mékaféba à Cocody, ouvert ce soir, environ 5 000 FCFA par personne" plutôt que "Voici une liste : ...".

Garde-fous :
- Ne jamais inventer un tarif, un horaire d'établissement, un partenariat ou une promo qui n'existe pas — ces données viennent de la base, pas de toi. Si tu n'as pas l'info, dis "Je vais vérifier dans l'app" ou invite l'utilisateur à ouvrir la fiche.
- N'évoque aucune fonctionnalité qui n'est pas dans la liste ci-dessus (pas de "Soutra Premium", pas de "Soutra Pro+" inventés).
- Pour les questions sensibles (litige, fraude, perte d'argent) : invite à contacter le support (mention "contact le support Soutra-Playce", sans donner l'email à voix haute).
- Pour réserver, payer, ou ajouter une promo en tant que gérant : explique la marche à suivre mais ne prétends pas exécuter l'action toi-même tant que ce n'est pas branché côté code (V1 actuelle : tu peux conseiller, pas encore agir).`;

type Msg = { role: "user" | "assistant"; content: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return jsonResponse({ ok: true }, 200);
  if (req.method !== "POST") {
    return jsonResponse({ error: "Méthode non autorisée" }, 405);
  }

  // Auth. `getAuthUser` retourne l'objet User ou null — pas un wrapper
  // `{ user, error }`. Toutes les autres Edge Functions suivent ce pattern.
  const user = await getAuthUser(req);
  if (!user) {
    return jsonResponse({ error: "Authentification requise" }, 401);
  }

  // Secret check.
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    console.error("[chatbot] ANTHROPIC_API_KEY non configuré");
    return jsonResponse({ error: "L'assistant n'est pas encore configuré côté serveur." }, 503);
  }
  const model = Deno.env.get("ANTHROPIC_MODEL") || DEFAULT_MODEL;

  // Body parse + validation.
  let body: { messages?: Msg[] } | null = null;
  try { body = await req.json(); } catch { /* noop */ }
  const messages = Array.isArray(body?.messages) ? body!.messages : [];
  if (messages.length === 0) {
    return jsonResponse({ error: "Aucun message fourni" }, 400);
  }
  // Validation par message.
  for (const m of messages) {
    if (!m || typeof m.content !== "string" || (m.role !== "user" && m.role !== "assistant")) {
      return jsonResponse({ error: "Format de message invalide" }, 400);
    }
    if (m.content.length > 4000) {
      return jsonResponse({ error: "Message trop long (4000 caractères max)" }, 400);
    }
  }
  if (messages[messages.length - 1].role !== "user") {
    return jsonResponse({ error: "Le dernier message doit être de l'utilisateur" }, 400);
  }
  // Garde-fou taille d'historique.
  const trimmed = messages.slice(-MAX_HISTORY);

  // Appel Anthropic.
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
        messages: trimmed,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[chatbot] Anthropic error", res.status, errText);
      if (res.status === 401) {
        return jsonResponse({ error: "Clé API invalide côté serveur" }, 503);
      }
      if (res.status === 429) {
        return jsonResponse({ error: "Trop de requêtes, réessaie dans quelques secondes" }, 429);
      }
      return jsonResponse({ error: "Le moteur de l'assistant a renvoyé une erreur" }, 502);
    }

    const data = await res.json();
    // Format réponse Anthropic : { content: [{ type, text }], usage: {...} }
    const text = Array.isArray(data.content)
      ? data.content.filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("\n").trim()
      : "";
    if (!text) {
      return jsonResponse({ error: "Réponse vide du moteur" }, 502);
    }

    return jsonResponse({
      reply: text,
      usage: data.usage ?? null,
      model: data.model ?? model,
    });
  } catch (err) {
    console.error("[chatbot] fatal:", err);
    return jsonResponse({ error: "Impossible de contacter le moteur de l'assistant" }, 502);
  }
});
