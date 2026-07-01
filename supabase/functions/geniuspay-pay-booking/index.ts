// ============================================================================
// geniuspay-pay-booking — démarre un paiement GeniusPay pour un room_booking.
//
// Miroir de paystack-pay-booking, adapté au contrat GeniusPay :
//   - XOF entier (pas de subunit).
//   - success_url / error_url au lieu de callback_url unique.
//   - checkout_url au lieu de authorization_url.
//
// Au retour, geniuspay-verify appelle geniuspay_settle_charge → dispatch sur
// purpose='room_booking' → geniuspay_settle_room_booking →
// booking.payment_status='paid' + status='confirmed'.
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Méthode non autorisée" }, 405);
  }

  try {
    const user = await getAuthUser(req);
    if (!user) return jsonResponse({ error: "Non authentifié" }, 401);

    const body = await req.json().catch(() => null);
    const bookingId = body?.booking_id;
    if (!bookingId || typeof bookingId !== "string") {
      return jsonResponse({ error: "booking_id requis" }, 400);
    }

    const svc = serviceClient();

    // get_room_booking_payment_info utilise auth.uid() → doit être appelée
    // avec le JWT de l'utilisateur, pas le service role. On construit un
    // userClient dédié le temps de la RPC ; le reste (insert transaction,
    // update en cas d'échec GeniusPay) continue de passer par svc.
    const jwt = extractJwt(req);
    if (!jwt) {
      return jsonResponse({ error: "Non authentifié" }, 401);
    }
    const userSvc = userClient(jwt);
    const { data: info, error: infoErr } = await userSvc.rpc(
      "get_room_booking_payment_info",
      { p_booking_id: bookingId },
    );
    if (infoErr || !info) {
      console.error("[gp-pay-booking] info:", infoErr);
      return jsonResponse({ error: "Réservation introuvable" }, 404);
    }
    const bookingInfo = info as {
      booking_id: string;
      venue_id: string;
      venue_name: string;
      booking_number: string;
      total_xof: number;
      nights_count: number;
      check_in_date: string;
      check_out_date: string;
      status: string;
      payment_status: string;
      payable: boolean;
    };

    if (!bookingInfo.payable) {
      return jsonResponse(
        {
          error: "Cette réservation n'est pas payable (déjà payée ou annulée)",
        },
        409,
      );
    }
    const amountXof = Number(bookingInfo.total_xof);
    if (!Number.isInteger(amountXof) || amountXof < MIN_XOF) {
      return jsonResponse(
        { error: `Montant invalide (minimum ${MIN_XOF} XOF)` },
        400,
      );
    }

    const { data: profile } = await svc
      .from("profiles")
      .select("email, full_name, phone")
      .eq("id", user.id)
      .maybeSingle();
    const email =
      (profile as { email?: string } | null)?.email ||
      user.email ||
      `${user.id}@users.soutra-paiya.app`;
    const name = (profile as { full_name?: string } | null)?.full_name ??
      undefined;
    const phone = (profile as { phone?: string } | null)?.phone ?? undefined;

    // Préfixe sp-bkg- conservé pour dispatch dans le callback web.
    const reference = `sp-bkg-${crypto.randomUUID()}`;

    const nightsLabel = `${bookingInfo.nights_count} nuit${
      bookingInfo.nights_count > 1 ? "s" : ""
    }`;
    const description =
      `Réservation ${bookingInfo.booking_number} chez ${bookingInfo.venue_name} (${nightsLabel})`;

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
          purpose: "room_booking",
          booking_id: bookingInfo.booking_id,
          booking_number: bookingInfo.booking_number,
          venue_id: bookingInfo.venue_id,
        },
      })
      .select("id")
      .single();

    if (txErr || !tx) {
      console.error("[gp-pay-booking] insert tx:", txErr);
      return jsonResponse({ error: "Impossible de créer la transaction" }, 500);
    }

    const callbackUrl =
      Deno.env.get("GENIUSPAY_CALLBACK_URL") ?? DEFAULT_CALLBACK_URL;
    const successUrl = `${callbackUrl}?reference=${
      encodeURIComponent(reference)
    }`;
    const errorUrl = `${callbackUrl}?reference=${
      encodeURIComponent(reference)
    }&status=failed`;

    try {
      const init = await initializePayment({
        amount: amountXof,
        currency: "XOF",
        description,
        customer: { name, email, phone, country: "CI" },
        success_url: successUrl,
        error_url: errorUrl,
        metadata: {
          purpose: "room_booking",
          user_id: user.id,
          transaction_id: tx.id,
          booking_id: bookingInfo.booking_id,
          booking_number: bookingInfo.booking_number,
          venue_id: bookingInfo.venue_id,
          soutra_reference: reference,
        },
      });
      const data = init.data;
      if (!data?.checkout_url) {
        throw new Error("Réponse GeniusPay sans checkout_url");
      }
      return jsonResponse({
        ok: true,
        checkout_url: data.checkout_url,
        reference,
        amount_xof: amountXof,
        booking_id: bookingInfo.booking_id,
        booking_number: bookingInfo.booking_number,
      });
    } catch (err) {
      console.error("[gp-pay-booking] geniuspay:", err);
      await svc
        .from("transactions")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", tx.id);
      return jsonResponse(
        { error: "Le fournisseur de paiement a refusé la demande" },
        502,
      );
    }
  } catch (err) {
    console.error("[gp-pay-booking] fatal:", err);
    return jsonResponse({ error: "Erreur interne" }, 500);
  }
});
