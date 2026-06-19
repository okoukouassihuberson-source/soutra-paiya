// ============================================================================
// paystack-pay-booking — démarre un paiement Paystack pour un room_booking.
//
// Appelée depuis mobile (/hotel-bookings) après création d'un booking pending.
// Pattern miroir de paystack-pay-order :
//   1. Auth check
//   2. RPC get_room_booking_payment_info (RLS owner) → infos authoritatives
//   3. Crée tx pending metadata={purpose:'room_booking', booking_id}
//   4. Paystack initialize avec channels mobile + card
//   5. Retourne authorization_url
//
// Au retour, paystack-verify appelle paystack_settle_charge → dispatch sur
// purpose='room_booking' → paystack_settle_room_booking → booking.payment_status=
// 'paid' + status='confirmed'.
// ============================================================================
import {
  corsHeaders,
  getAuthUser,
  jsonResponse,
  serviceClient,
} from "../_shared/supabase.ts";
import { initializeTransaction, toSubunit } from "../_shared/paystack.ts";

const DEFAULT_CALLBACK_URL = "https://soutra-playce.vercel.app/paystack/callback";

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

    const { data: info, error: infoErr } = await svc.rpc(
      "get_room_booking_payment_info",
      { p_booking_id: bookingId },
    );
    if (infoErr || !info) {
      console.error("[pay-booking] info:", infoErr);
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
        { error: "Cette réservation n'est pas payable (déjà payée ou annulée)" },
        409,
      );
    }
    const amountXof = Number(bookingInfo.total_xof);
    if (!Number.isInteger(amountXof) || amountXof < 100) {
      return jsonResponse({ error: "Montant invalide" }, 400);
    }

    const { data: profile } = await svc
      .from("profiles")
      .select("email")
      .eq("id", user.id)
      .maybeSingle();
    const email =
      (profile as { email?: string } | null)?.email ||
      user.email ||
      `${user.id}@users.soutra-playce.app`;

    // Préfixe sp-bkg- pour distinguer des autres flux côté /paystack/callback.
    const reference = `sp-bkg-${crypto.randomUUID()}`;

    const { data: tx, error: txErr } = await svc
      .from("transactions")
      .insert({
        user_id: user.id,
        type: "payment",
        amount_xof: amountXof,
        status: "pending",
        provider: "paystack",
        provider_ref: reference,
        description: `Réservation ${bookingInfo.booking_number} chez ${bookingInfo.venue_name} (${bookingInfo.nights_count} nuit${bookingInfo.nights_count > 1 ? "s" : ""})`,
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
      console.error("[pay-booking] insert tx:", txErr);
      return jsonResponse({ error: "Impossible de créer la transaction" }, 500);
    }

    const callbackUrl =
      Deno.env.get("PAYSTACK_CALLBACK_URL") ?? DEFAULT_CALLBACK_URL;

    try {
      const init = await initializeTransaction({
        email,
        amount: toSubunit(amountXof),
        currency: "XOF",
        reference,
        callback_url: callbackUrl,
        channels: [
          "card",
          "mobile_money",
          "bank",
          "ussd",
          "qr",
          "apple_pay",
          "google_pay",
        ],
        metadata: {
          purpose: "room_booking",
          user_id: user.id,
          transaction_id: tx.id,
          booking_id: bookingInfo.booking_id,
          booking_number: bookingInfo.booking_number,
          venue_id: bookingInfo.venue_id,
        },
      });

      return jsonResponse({
        ok: true,
        authorization_url: init.data.authorization_url,
        reference,
        amount_xof: amountXof,
        booking_id: bookingInfo.booking_id,
        booking_number: bookingInfo.booking_number,
      });
    } catch (err) {
      console.error("[pay-booking] paystack:", err);
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
    console.error("[pay-booking] fatal:", err);
    return jsonResponse({ error: "Erreur interne" }, 500);
  }
});
