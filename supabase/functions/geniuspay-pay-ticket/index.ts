// ============================================================================
// geniuspay-pay-ticket — démarre un paiement GeniusPay pour un billet
// d'événement.
//
// Pattern miroir de geniuspay-pay-order/geniuspay-pay-booking :
//   1. Auth check
//   2. RPC initialize_ticket_purchase (JWT utilisateur) → réserve la
//      capacité sur le palier ET renvoie le prix faisant autorité
//   3. Crée tx pending metadata={purpose:'ticket_purchase', event_id, tier_name}
//   4. GeniusPay POST /payments (checkout page)
//   5. Retourne checkout_url
//
// ticket_status n'a pas de valeur 'pending' : la ligne `tickets` n'est créée
// qu'au règlement (geniuspay_settle_ticket_purchase, dispatché depuis
// geniuspay_settle_charge). Si la création de la transaction ou l'appel
// GeniusPay échoue après la réservation, on libère explicitement la capacité
// ici — en plus de la libération asynchrone côté webhook pour le cas où
// l'échec survient après le retour du checkout_url.
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
    const eventId = body?.event_id;
    const tierName = body?.tier_name;
    if (!eventId || typeof eventId !== "string") {
      return jsonResponse({ error: "event_id requis" }, 400);
    }
    if (!tierName || typeof tierName !== "string") {
      return jsonResponse({ error: "tier_name requis" }, 400);
    }

    const svc = serviceClient();

    // initialize_ticket_purchase utilise auth.uid() → doit être appelée avec
    // le JWT de l'utilisateur, pas le service role (cf. geniuspay-pay-order).
    const jwt = extractJwt(req);
    if (!jwt) {
      return jsonResponse({ error: "Non authentifié" }, 401);
    }
    const userSvc = userClient(jwt);
    const { data: info, error: infoErr } = await userSvc.rpc(
      "initialize_ticket_purchase",
      { p_event_id: eventId, p_tier_name: tierName, p_quantity: 1 },
    );
    if (infoErr || !info) {
      const reason = infoErr?.message ?? "";
      const map: Record<string, { status: number; message: string }> = {
        EVENT_NOT_FOUND: { status: 404, message: "Événement introuvable" },
        EVENT_NOT_PUBLISHED: { status: 409, message: "Cet événement n'est plus disponible" },
        EVENT_PAST: { status: 409, message: "Cet événement est déjà passé" },
        TIER_NOT_FOUND: { status: 404, message: "Ce tarif n'existe plus" },
        SOLD_OUT: { status: 409, message: "Il n'y a plus de billets disponibles pour ce tarif" },
        QUANTITY_NOT_SUPPORTED: { status: 400, message: "Un seul billet par achat pour l'instant" },
        NOT_AUTHENTICATED: { status: 401, message: "Non authentifié" },
      };
      const matched = Object.keys(map).find((code) => reason.includes(code));
      const { status, message } = matched
        ? map[matched]
        : { status: 502, message: "Impossible d'initier l'achat du billet" };
      console.error("[gp-pay-ticket] info:", infoErr);
      return jsonResponse({ error: message }, status);
    }
    const ticketInfo = info as {
      event_id: string;
      tier_name: string;
      price_xof: string | number;
      quantity: number;
    };
    const amountXof = Number(ticketInfo.price_xof);

    const { data: event } = await svc
      .from("events")
      .select("title")
      .eq("id", eventId)
      .maybeSingle();
    const { data: profile } = await svc
      .from("profiles")
      .select("email, full_name, phone")
      .eq("id", user.id)
      .maybeSingle();
    const email = (profile as { email?: string } | null)?.email ||
      user.email || `${user.id}@users.soutra-paiya.app`;
    const name = (profile as { full_name?: string } | null)?.full_name ?? undefined;
    const phone = (profile as { phone?: string } | null)?.phone ?? undefined;
    const eventTitle = (event as { title?: string } | null)?.title ?? "Événement";
    const description = `Billet ${tierName} — ${eventTitle}`;

    // Préfixe sp-tkt- : nouveau, distinct de sp-/sp-ord-/sp-wd-/sp-vp-/sp-bkg-.
    const reference = `sp-tkt-${crypto.randomUUID()}`;

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
          purpose: "ticket_purchase",
          event_id: eventId,
          tier_name: tierName,
          quantity: 1,
        },
      })
      .select("id")
      .single();

    if (txErr || !tx) {
      console.error("[gp-pay-ticket] insert tx:", txErr);
      // La capacité a déjà été réservée par initialize_ticket_purchase :
      // la libérer immédiatement puisqu'aucune transaction ne pourra jamais
      // la référencer.
      await svc.rpc("release_ticket_capacity", {
        p_event_id: eventId,
        p_tier_name: tierName,
      });
      return jsonResponse({ error: "Impossible de créer la transaction" }, 500);
    }

    const callbackUrl = Deno.env.get("GENIUSPAY_CALLBACK_URL") ?? DEFAULT_CALLBACK_URL;
    const successUrl = `${callbackUrl}?reference=${encodeURIComponent(reference)}`;
    const errorUrl = `${callbackUrl}?reference=${encodeURIComponent(reference)}&status=failed`;

    try {
      const init = await initializePayment({
        amount: amountXof,
        currency: "XOF",
        description,
        customer: { name, email, phone, country: "CI" },
        success_url: successUrl,
        error_url: errorUrl,
        metadata: {
          purpose: "ticket_purchase",
          user_id: user.id,
          transaction_id: tx.id,
          event_id: eventId,
          tier_name: tierName,
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
        event_id: eventId,
      });
    } catch (err) {
      console.error("[gp-pay-ticket] geniuspay:", err);
      await svc
        .from("transactions")
        .update({ status: "failed", completed_at: new Date().toISOString() })
        .eq("id", tx.id);
      // Échec synchrone : GeniusPay n'a jamais été contacté avec succès,
      // aucun webhook ne viendra donc jamais libérer la capacité — le faire
      // ici directement (en plus de la libération asynchrone côté webhook
      // pour le cas où l'échec survient après le retour du checkout_url).
      await svc.rpc("release_ticket_capacity", {
        p_event_id: eventId,
        p_tier_name: tierName,
      });
      return jsonResponse(
        { error: "Le fournisseur de paiement a refusé la demande" },
        502,
      );
    }
  } catch (err) {
    console.error("[gp-pay-ticket] fatal:", err);
    return jsonResponse({ error: "Erreur interne" }, 500);
  }
});
