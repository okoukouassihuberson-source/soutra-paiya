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
const SYSTEM_PROMPT = `Tu es Soutra, l'assistant officiel de Soutra-Playce — une application mobile et web ivoirienne qui permet de :
- découvrir maquis, restaurants, hôtels, bars, cafés et événements à Abidjan ;
- réserver une table avec acompte payé via Soutra-Pay (le wallet intégré) ;
- payer en mobile money (Orange Money, MTN MoMo, Wave) ou carte ;
- envoyer / demander de l'argent à d'autres utilisateurs (P2P), splitter une addition, scanner un QR code de paiement ;
- publier des stories 24h, commenter des posts, matcher avec d'autres utilisateurs proches, chatter ;
- pour les pros (bouton "Pro" sur la web app) : créer leur établissement, gérer leurs médias, leur menu, leurs promos et leurs événements.

Style de réponse :
- en français, ton direct, sans tutoyer artificiellement (tu peux tutoyer, c'est cool en CI mais reste pro).
- réponses courtes (3-4 phrases max) sauf si la question demande des étapes détaillées.
- propose des actions concrètes : "Va dans l'onglet Wallet → bouton Recharger", "Tap sur l'icône micro en haut à droite", etc.
- si tu ne sais pas, dis-le clairement. Ne jamais inventer un tarif, un horaire d'établissement, un partenariat ou une promo qui n'existe pas — ces données viennent de la base, pas de toi.
- n'évoque aucune fonctionnalité qui n'est pas mentionnée ci-dessus (pas de fonctionnalité "premium" fictive, pas de "Soutra Pro+", etc.).
- pour les questions sensibles (litige, fraude, perte d'argent) : invite à contacter support@soutra.ci.`;

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
