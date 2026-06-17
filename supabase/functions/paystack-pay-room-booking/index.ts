// ============================================================================
// paystack-pay-room-booking — démarre un paiement Paystack pour une room_booking.
// Pattern miroir de paystack-pay-order, adapté aux nuitées (migration 0059).
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
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Méthode non autorisée" }, 405);

  try {
    const user = await getAuthUser(req);
    if (!user) return jsonResponse({ error: "Non authentifié" }, 401);

    const body = await req.json().catch(() => null);
    const bookingId = body?.booking_id;
    if (!bookingId || typeof bookingId !== "string") {
      return jsonResponse({ error: "booking_id requis" }, 400);
    }

    const svc = serviceClient();

    // Authority check via RPC
    const { data: info, error: infoErr } = await svc.rpc(
      "get_room_booking_payment_info",
      { p_booking_id: bookingId },
    );
    if (infoErr || !info) {
      console.error("[pay-room-booking] info:", infoErr);
      return jsonResponse({ error: "Réservation introuvable" }, 404);
    }
    const i = info as {
      booking_id: string;
      venue_id: string;
      venue_name: string;
      room_name: string;
      booking_number: string;
      total_xof: number;
      payable: boolean;
    };
    if (!i.payable) {
      return jsonResponse({ error: "Cette réservation n'est pas payable" }, 409);
    }
    const amountXof = Number(i.total_xof);
    if (!Number.isInteger(amountXof) || amountXof < 100) {
      return jsonResponse({ error: "Montant invalide" }, 400);
    }

    const { data: profile } = await svc
      .from("profiles")
      .select("email")
      .eq("id", user.id)
      .maybeSingle();
    const email = (profile as { email?: string } | null)?.email
      || user.email
      || `${user.id}@users.soutra-playce.app`;

    // Préfixe sp-bkg- pour distinguer côté callback
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
        description: `Réservation ${i.booking_number} · ${i.room_name} chez ${i.venue_name}`,
        metadata: {
          purpose: "room_booking",
          booking_id: i.booking_id,
          booking_number: i.booking_number,
          venue_id: i.venue_id,
        },
      })
      .select("id")
      .single();

    if (txErr || !tx) {
      console.error("[pay-room-booking] insert tx:", txErr);
      return jsonResponse({ error: "Impossible de créer la transaction" }, 500);
    }

    const callbackUrl = Deno.env.get("PAYSTACK_CALLBACK_URL") ?? DEFAULT_CALLBACK_URL;

    try {
      const init = await initializeTransaction({
        email,
        amount: toSubunit(amountXof),
        currency: "XOF",
        reference,
        callback_url: callbackUrl,
        channels: ["card", "mobile_money", "bank", "ussd", "qr", "apple_pay", "google_pay"],
        metadata: {
          purpose: "room_booking",
          user_id: user.id,
          transaction_id: tx.id,
          booking_id: i.booking_id,
          booking_number: i.booking_number,
          venue_id: i.venue_id,
        },
      });

      return jsonResponse({
        ok: true,
        authorization_url: init.data.authorization_url,
        reference,
        amount_xof: amountXof,
        booking_id: i.booking_id,
        booking_number: i.booking_number,
      });
    } catch (err) {
      console.error("[pay-room-booking] paystack:", err);
      await svc
        .from("transactions")
        .update({ status: "failed", completed_at: new Date().toISOString() })
        .eq("id", tx.id);
      return jsonResponse({ error: "Le fournisseur de paiement a refusé la demande" }, 502);
    }
  } catch (err) {
    console.error("[pay-room-booking] fatal:", err);
    return jsonResponse({ error: "Erreur interne" }, 500);
  }
});
