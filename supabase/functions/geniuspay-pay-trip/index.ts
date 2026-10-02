// ============================================================================
// geniuspay-pay-trip — démarre un paiement GeniusPay pour une réservation de
// voyage groupé (acompte, solde ou paiement intégral).
//
// Miroir de geniuspay-pay-booking. Le montant vient UNIQUEMENT de la RPC
// get_trip_booking_payment_info (jamais du client). Au retour, geniuspay-verify /
// le webhook appellent geniuspay_settle_charge → purpose='trip_booking' →
// geniuspay_settle_trip_booking (trip_payments + statut + reçu).
// ============================================================================
import {
  corsHeaders,
  extractJwt,
  getAuthUser,
  jsonResponse,
  serviceClient,
  userClient,
} from "../_shared/supabase.ts";
import { initializePayment } from "../_shared/geniuspay.ts";

const DEFAULT_CALLBACK_URL = "https://soutra-paiya.vercel.app/geniuspay/callback";
const MIN_XOF = 200;
const KINDS = ["deposit", "balance", "full"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Méthode non autorisée" }, 405);

  try {
    const user = await getAuthUser(req);
    if (!user) return jsonResponse({ error: "Non authentifié" }, 401);
    const jwt = extractJwt(req);
    if (!jwt) return jsonResponse({ error: "Non authentifié" }, 401);

    const body = await req.json().catch(() => null);
    const bookingId = body?.booking_id;
    const kind = body?.kind ?? "full";
    if (!bookingId || typeof bookingId !== "string") {
      return jsonResponse({ error: "booking_id requis" }, 400);
    }
    if (typeof kind !== "string" || !KINDS.includes(kind)) {
      return jsonResponse({ error: "kind invalide" }, 400);
    }

    // La RPC utilise auth.uid() → appelée avec le JWT de l'utilisateur.
    const { data: info, error: infoErr } = await userClient(jwt).rpc(
      "get_trip_booking_payment_info",
      { p_booking_id: bookingId, p_kind: kind },
    );
    if (infoErr || !info) {
      console.error("[gp-pay-trip] info:", infoErr);
      return jsonResponse({ error: "Réservation introuvable" }, 404);
    }
    const p = info as {
      payable: boolean; reason?: string; booking_id: string; reference: string;
      trip_id: string; trip_title: string; amount_xof: number;
    };
    if (!p.payable) {
      return jsonResponse({ error: "Cette réservation n'est pas payable", reason: p.reason }, 409);
    }
    const amountXof = Number(p.amount_xof);
    if (!Number.isInteger(amountXof) || amountXof < MIN_XOF) {
      return jsonResponse({ error: `Montant invalide (minimum ${MIN_XOF} XOF)` }, 400);
    }

    const svc = serviceClient();
    const { data: profile } = await svc
      .from("profiles").select("email, full_name, phone").eq("id", user.id).maybeSingle();
    const email = (profile as { email?: string } | null)?.email || user.email ||
      `${user.id}@users.soutra-paiya.app`;
    const name = (profile as { full_name?: string } | null)?.full_name ?? undefined;
    const phone = (profile as { phone?: string } | null)?.phone ?? undefined;

    // Préfixe sp-trp- : dispatché par la page /geniuspay/callback (flow web).
    const reference = `sp-trp-${crypto.randomUUID()}`;
    const label = kind === "deposit" ? "Acompte" : kind === "balance" ? "Solde" : "Paiement";
    const description = `${label} voyage ${p.reference} — ${p.trip_title}`;

    const { data: tx, error: txErr } = await svc
      .from("transactions")
      .insert({
        user_id: user.id,
        type: "payment",
        amount_xof: amountXof,
        status: "pending",
        provider: "geniuspay",
        provider_ref: reference,
        description,
        metadata: {
          purpose: "trip_booking",
          kind,
          booking_id: p.booking_id,
          booking_reference: p.reference,
          trip_id: p.trip_id,
        },
      })
      .select("id")
      .single();
    if (txErr || !tx) {
      console.error("[gp-pay-trip] insert tx:", txErr);
      return jsonResponse({ error: "Impossible de créer la transaction" }, 500);
    }

    const callbackUrl = Deno.env.get("GENIUSPAY_CALLBACK_URL") ?? DEFAULT_CALLBACK_URL;
    const q = `reference=${encodeURIComponent(reference)}&booking=${encodeURIComponent(p.booking_id)}`;
    try {
      const init = await initializePayment({
        amount: amountXof,
        currency: "XOF",
        description,
        customer: { name, email, phone, country: "CI" },
        success_url: `${callbackUrl}?${q}`,
        error_url: `${callbackUrl}?${q}&status=failed`,
        metadata: {
          purpose: "trip_booking",
          kind,
          user_id: user.id,
          transaction_id: tx.id,
          booking_id: p.booking_id,
          soutra_reference: reference,
        },
      });
      if (!init.data?.checkout_url) throw new Error("Réponse GeniusPay sans checkout_url");
      return jsonResponse({
        ok: true,
        checkout_url: init.data.checkout_url,
        reference,
        amount_xof: amountXof,
        booking_id: p.booking_id,
      });
    } catch (err) {
      console.error("[gp-pay-trip] geniuspay:", err);
      await svc.from("transactions")
        .update({ status: "failed", completed_at: new Date().toISOString() })
        .eq("id", tx.id);
      return jsonResponse({ error: "Le fournisseur de paiement a refusé la demande" }, 502);
    }
  } catch (err) {
    console.error("[gp-pay-trip] fatal:", err);
    return jsonResponse({ error: "Erreur interne" }, 500);
  }
});
