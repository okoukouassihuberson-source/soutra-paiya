// ============================================================================
// paystack-webhook — source de vérité des paiements.
// Déployée SANS vérification JWT (cf. supabase/config.toml) : Paystack
// l'appelle directement. L'authenticité est garantie par la signature
// HMAC-SHA512 du corps brut.
// ============================================================================
import { jsonResponse, serviceClient } from "../_shared/supabase.ts";
import { verifyWebhookSignature } from "../_shared/paystack.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Méthode non autorisée", { status: 405 });
  }

  // Le corps BRUT est requis pour vérifier la signature : ne pas le re-sérialiser.
  const rawBody = await req.text();
  const signature = req.headers.get("x-paystack-signature");
  if (!verifyWebhookSignature(rawBody, signature)) {
    return new Response("Signature invalide", { status: 401 });
  }

  let event: { event?: string; data?: Record<string, unknown> };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Corps invalide", { status: 400 });
  }

  const type = event.event ?? "";
  const data = event.data ?? {};
  const reference = typeof data.reference === "string"
    ? data.reference
    : undefined;

  try {
    const svc = serviceClient();

    if (type === "charge.success" && reference) {
      const { data: outcome, error } = await svc.rpc("paystack_settle_charge", {
        p_reference: reference,
        p_paid_subunit: Number(data.amount ?? 0),
      });
      if (error) console.error("[webhook] settle_charge:", error);
      else console.log(`[webhook] charge.success ${reference} -> ${outcome}`);
    } else if (
      (type === "transfer.success" || type === "transfer.failed" ||
        type === "transfer.reversed") && reference
    ) {
      const outcome = type === "transfer.success" ? "success" : "failed";
      // Dispatch par préfixe de référence :
      //   sp-vp-<uuid> = venue payout (migration 0044)
      //   sp-wd-<uuid> = wallet user withdraw (migration 0007)
      if (reference.startsWith("sp-vp-")) {
        const { data: result, error } = await svc.rpc(
          "settle_venue_payout",
          {
            p_reference: reference,
            p_outcome: outcome,
            p_failure_reason: outcome === "failed"
              ? (typeof data.reason === "string" ? data.reason : null)
              : null,
            p_metadata_patch: { webhook_event: type },
          },
        );
        if (error) console.error("[webhook] settle_venue_payout:", error);
        else console.log(`[webhook] ${type} ${reference} (venue) -> ${result}`);
      } else {
        const { data: result, error } = await svc.rpc(
          "paystack_settle_transfer",
          { p_reference: reference, p_outcome: outcome },
        );
        if (error) console.error("[webhook] settle_transfer:", error);
        else console.log(`[webhook] ${type} ${reference} (wallet) -> ${result}`);
      }
    } else {
      console.log(`[webhook] événement ignoré : ${type}`);
    }
  } catch (err) {
    // On logue mais on répond 200 : le verify (encaissements) sert de filet
    // de sécurité et les fonctions de règlement sont idempotentes.
    console.error("[webhook] fatal:", err);
  }

  // Paystack attend un 200 rapide pour ne pas renvoyer l'événement en boucle.
  return jsonResponse({ received: true }, 200);
});
