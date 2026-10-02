// ============================================================================
// tourism-assistant — assistant voyage / activités / promotions, propulsé par Claude.
//
// JWT requis. Boucle d'outils en lecture seule (voir _shared/assistant.ts) :
// le modèle interroge les données publiées, la réponse est accompagnée des fiches
// (liens) issues des résultats d'outils — pas du texte généré.
// Plafond quotidien par utilisateur (assistant_consume, 0094).
//
// Secrets : ANTHROPIC_API_KEY (obligatoire), ANTHROPIC_MODEL (défaut claude-haiku-4-5),
//           ASSISTANT_DAILY_LIMIT (défaut 30)
// ============================================================================
import { extractJwt, getAuthUser, jsonResponse, userClient } from "../_shared/supabase.ts";
import { dedupeItems, MAX_TOOL_ROUNDS, runTool, sanitizeMessages, systemPrompt, TOOLS, type AssistantItem } from "../_shared/assistant.ts";

const ANTHROPIC_URL = Deno.env.get("ANTHROPIC_API_URL") || "https://api.anthropic.com/v1/messages";   // surcharge : tests
const DEFAULT_MODEL = "claude-haiku-4-5";

// deno-lint-ignore no-explicit-any
type Block = any;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return jsonResponse({ ok: true }, 200);
  if (req.method !== "POST") return jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405);

  const user = await getAuthUser(req);
  const jwt = extractJwt(req);
  if (!user || !jwt) return jsonResponse({ error: "NOT_AUTHENTICATED" }, 401);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return jsonResponse({ error: "NOT_CONFIGURED" }, 503);
  const model = Deno.env.get("ANTHROPIC_MODEL") || DEFAULT_MODEL;

  let body: { messages?: unknown; locale?: string } | null = null;
  try { body = await req.json(); } catch { /* noop */ }
  const messages = sanitizeMessages(body?.messages);
  if (!messages) return jsonResponse({ error: "INVALID_MESSAGES" }, 400);
  const locale = body?.locale === "en" ? "en" : "fr";

  const db = userClient(jwt);
  const limit = Number(Deno.env.get("ASSISTANT_DAILY_LIMIT") ?? 30) || 30;
  const { data: remaining, error: limErr } = await db.rpc("assistant_consume", { p_limit: limit });
  if (limErr) {
    if (String(limErr.message).includes("RATE_LIMITED")) return jsonResponse({ error: "RATE_LIMITED" }, 429);
    console.error("[tourism-assistant] consume", limErr);
    return jsonResponse({ error: "UNAVAILABLE" }, 503);
  }

  const refund = async () => { try { await db.rpc("assistant_refund"); } catch { /* noop */ } };
  const convo: { role: string; content: string | Block[] }[] = [...messages];
  const items: AssistantItem[] = [];
  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const res = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model, max_tokens: 700, system: systemPrompt(locale), messages: convo,
          // Les définitions d'outils restent présentes (exigées si l'historique contient des tool_use) ;
          // au dernier tour on interdit d'en appeler un nouveau : le modèle doit conclure.
          tools: TOOLS, ...(round >= MAX_TOOL_ROUNDS ? { tool_choice: { type: "none" } } : {}),
        }),
      });
      if (!res.ok) {
        console.error("[tourism-assistant] anthropic", res.status, await res.text());
        await refund();
        return jsonResponse({ error: res.status === 429 ? "BUSY" : "ENGINE_ERROR" }, res.status === 429 ? 429 : 502);
      }
      const data = await res.json();
      const content: Block[] = Array.isArray(data.content) ? data.content : [];
      const uses = content.filter((b) => b.type === "tool_use");
      if (data.stop_reason === "tool_use" && uses.length > 0 && round < MAX_TOOL_ROUNDS) {
        convo.push({ role: "assistant", content });
        const results: Block[] = [];
        for (const u of uses) {
          const r = await runTool(db, u.name, u.input ?? {});
          items.push(...r.items);
          results.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(r.data).slice(0, 6000) });
        }
        convo.push({ role: "user", content: results });
        continue;
      }
      const reply = content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
      if (!reply) { await refund(); return jsonResponse({ error: "ENGINE_ERROR" }, 502); }
      return jsonResponse({ reply, items: dedupeItems(items), remaining });
    }
    await refund();
    return jsonResponse({ error: "ENGINE_ERROR" }, 502);
  } catch (e) {
    console.error("[tourism-assistant] fatal", e);
    await refund();
    return jsonResponse({ error: "ENGINE_ERROR" }, 502);
  }
});
