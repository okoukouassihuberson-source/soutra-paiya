// ============================================================================
// geniuspay-webhook — source de vérité des paiements GeniusPay.
// Déployée SANS vérification JWT (cf. supabase/config.toml) : GeniusPay
// l'appelle directement. L'authenticité est garantie par la vérification
// HMAC-SHA256 du header X-Webhook-Signature avec fenêtre anti-replay 5 min.
//
// Événements traités en PR #2 (encaissements) :
//   - payment.success   → geniuspay_settle_charge (dispatch par purpose)
//   - payment.failed    → marque la transaction failed
//   - payment.cancelled → idem failed
//   - payment.expired   → idem failed
//
// Événements ignorés en PR #2 (traités en PR #3/#4) :
//   - subscription.*    → PR #3
//   - payout.*          → PR #4
// ============================================================================
import { jsonResponse, serviceClient } from "../_shared/supabase.ts";
import { verifyWebhookSignature } from "../_shared/geniuspay.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Méthode non autorisée", { status: 405 });
  }

  // Corps BRUT requis pour la vérification de signature. Ne pas re-sérialiser.
  const rawBody = await req.text();
  const signature = req.headers.get("X-Webhook-Signature");
  const timestamp = req.headers.get("X-Webhook-Timestamp");
  if (!verifyWebhookSignature(rawBody, signature, timestamp)) {
    return new Response("Signature invalide", { status: 401 });
  }

  let event: {
    event?: string;
    data?: { object?: string; reference?: string; amount?: number } & Record<
      string,
      unknown
    >;
  };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Corps invalide", { status: 400 });
  }

  const type = event.event ?? "";
  const data = event.data ?? {};
  // GeniusPay renvoie la référence côté data.reference. Elle correspond soit
  // à notre référence Soutra (sp-…, sp-ord-…, sp-bkg-…) qu'on a envoyée en
  // metadata.soutra_reference, soit à la référence GeniusPay (MTX-…). On
  // privilégie la première quand elle est présente.
  const soutraRef = (data as Record<string, unknown>)?.metadata &&
      typeof (data as { metadata: unknown }).metadata === "object"
    ? (((data as { metadata: Record<string, unknown> }).metadata)
      ?.soutra_reference as string | undefined)
    : undefined;
  const reference = soutraRef ??
    (typeof data.reference === "string" ? data.reference : undefined);

  try {
    const svc = serviceClient();

    if (type === "payment.success" && reference) {
      const { data: outcome, error } = await svc.rpc(
        "geniuspay_settle_charge",
        {
          p_reference: reference,
          p_paid_amount_xof: Number(data.amount ?? 0),
        },
      );
      if (error) console.error("[gp-webhook] settle_charge:", error);
      else console.log(`[gp-webhook] payment.success ${reference} -> ${outcome}`);
    } else if (
      (type === "payment.failed" || type === "payment.cancelled" ||
        type === "payment.expired") && reference
    ) {
      // Passe la transaction en failed. Idempotent : ne touche que les tx
      // encore pending.
      const { error } = await svc
        .from("transactions")
        .update({ status: "failed", completed_at: new Date().toISOString() })
        .eq("provider_ref", reference)
        .eq("status", "pending");
      if (error) console.error("[gp-webhook] mark failed:", error);
      else console.log(`[gp-webhook] ${type} ${reference} -> failed`);
    } else if (type === "webhook.test") {
      console.log("[gp-webhook] webhook.test received");
    } else {
      // subscription.* et payout.* seront traités en PR #3/#4.
      console.log(`[gp-webhook] événement ignoré : ${type}`);
    }
  } catch (err) {
    // On logue mais on répond 200 : le verify (côté client) sert de filet de
    // sécurité et les RPC de règlement sont idempotentes.
    console.error("[gp-webhook] fatal:", err);
  }

  return jsonResponse({ received: true }, 200);
});
