// ============================================================================
// cinetpay-webhook — réception des notifications CinetPay.
//
// Configuration : `verify_jwt = false` côté `supabase/config.toml` (CinetPay
// l'appelle directement). L'authenticité est garantie par :
//   1. La signature HMAC-SHA256 sur les champs cpm_* (cf. _shared/cinetpay.ts)
//   2. La double-vérification du statut via /payment/check côté serveur
//      (le webhook seul n'est jamais une source de vérité 100% fiable)
//
// CinetPay POST form-data (pas JSON). On parse via FormData.
//
// Le routing est identique à paystack-webhook : on classifie la référence
// par préfixe (sp-tp- / sp-dep- / sp-wd- / sp-vp-) et on appelle le bon RPC.
// ============================================================================
import { jsonResponse, serviceClient } from "../_shared/supabase.ts";
import {
  verifyWebhookSignature,
  checkTransaction,
  classifyReference,
} from "../_shared/cinetpay.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Méthode non autorisée", { status: 405 });
  }

  // CinetPay envoie en application/x-www-form-urlencoded
  const formText = await req.text();
  const params = new URLSearchParams(formText);
  const body: Record<string, string> = {};
  for (const [k, v] of params.entries()) body[k] = v;

  // ── 1. Vérification signature HMAC ──
  const xToken = req.headers.get("x-token");
  if (!verifyWebhookSignature(body, xToken)) {
    console.error("[cinetpay-webhook] Signature invalide");
    return new Response("Signature invalide", { status: 401 });
  }

  const reference = body.cpm_trans_id ?? "";
  const kind = classifyReference(reference);
  if (kind === "unknown") {
    console.warn(`[cinetpay-webhook] Référence inconnue : ${reference}`);
    return jsonResponse({ received: true, ignored: "unknown_ref" });
  }

  try {
    // ── 2. Vérification serveur du statut (anti-spoofing webhook) ──
    const check = await checkTransaction(reference);
    const checkData = check.data;
    const cinetpayStatus = checkData?.status ?? "PENDING";
    const amountFromCinetpay = Number(checkData?.amount ?? body.cpm_amount ?? 0);

    const svc = serviceClient();

    // ── 3. Routing par type de référence ──
    if (kind === "topup" || kind === "deposit") {
      // Encaissement → settle_payment_charge (alias 0047 forward Paystack)
      // Note : settle_payment_charge attend des subunit (XOF × 100) car
      // forwarde vers paystack_settle_charge. On multiplie.
      if (cinetpayStatus === "ACCEPTED") {
        const { data: outcome, error } = await svc.rpc("settle_payment_charge", {
          p_reference: reference,
          p_paid_subunit: amountFromCinetpay * 100,
        });
        if (error) console.error("[cinetpay-webhook] settle_charge:", error);
        else console.log(`[cinetpay-webhook] ${kind} ACCEPTED ${reference} → ${outcome}`);
      } else if (cinetpayStatus === "REFUSED" || cinetpayStatus === "WAITING_FOR_CUSTOMER") {
        // Marqué failed → la transaction reste pending si l'user peut retenter
        if (cinetpayStatus === "REFUSED") {
          await svc.from("transactions").update({
            status: "failed",
            completed_at: new Date().toISOString(),
          }).eq("provider_ref", reference);
          console.log(`[cinetpay-webhook] ${kind} REFUSED ${reference}`);
        }
      }
    } else if (kind === "withdraw" || kind === "venue_payout") {
      // Transfer sortant. CinetPay envoie le webhook avec cpm_result :
      //   "00" = OK / "01"+ = échec / autres = pending
      const outcome = cinetpayStatus === "ACCEPTED" || body.cpm_result === "00"
        ? "success"
        : (cinetpayStatus === "REFUSED" || (body.cpm_result && body.cpm_result !== "00"))
          ? "failed"
          : null;
      if (outcome) {
        if (kind === "venue_payout") {
          const { data: result, error } = await svc.rpc("settle_venue_payout", {
            p_reference: reference,
            p_outcome: outcome,
            p_failure_reason: outcome === "failed"
              ? (body.cpm_error_message || cinetpayStatus)
              : null,
            p_metadata_patch: { webhook_provider: "cinetpay", webhook_status: cinetpayStatus },
          });
          if (error) console.error("[cinetpay-webhook] settle_venue_payout:", error);
          else console.log(`[cinetpay-webhook] venue_payout ${outcome} ${reference} → ${result}`);
        } else {
          // wallet user withdraw
          const { data: result, error } = await svc.rpc("settle_payment_transfer", {
            p_reference: reference,
            p_outcome: outcome,
          });
          if (error) console.error("[cinetpay-webhook] settle_transfer:", error);
          else console.log(`[cinetpay-webhook] withdraw ${outcome} ${reference} → ${result}`);
        }
      }
    }
  } catch (err) {
    // Toujours 200 pour éviter le rejeu CinetPay. L'incident est loggé.
    console.error("[cinetpay-webhook] fatal:", err);
  }

  return jsonResponse({ received: true }, 200);
});
