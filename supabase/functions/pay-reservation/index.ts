// ============================================================================
// pay-reservation — règle l'acompte d'une réservation depuis le wallet.
//
// Appelée par le mobile (Phase 4 assistant vocal Sia) après que l'utilisateur :
//   1. ait créé sa résa via la voix (Phase 3 → status='pending', escrow_tx_id null)
//   2. ait confirmé l'autorisation orale ("oui paye-la")
//   3. ait validé son identité localement (biométrie ou PIN modal)
//   4. ait saisi son PIN (envoyé ici dans le body)
//
// La RPC pay_reservation_from_wallet (migration 0046) fait tout atomiquement :
// vérif PIN bcrypt, ownership, solde, statut, debit + insert tx + escrow_tx_id.
// ============================================================================
import {
  corsHeaders,
  getAuthUser,
  jsonResponse,
} from "../_shared/supabase.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Mappe les codes d'erreur SQL vers des messages clairs pour l'UI.
function mapRpcError(raw: string): { status: number; message: string } {
  if (raw.includes("NOT_AUTHENTICATED")) {
    return { status: 401, message: "Authentification requise" };
  }
  if (raw.includes("INVALID_PIN_FORMAT")) {
    return { status: 400, message: "PIN invalide (4 chiffres attendus)" };
  }
  if (raw.includes("PIN_NOT_SET")) {
    return { status: 400, message: "Aucun PIN défini. Configure-le dans Sécurité." };
  }
  if (raw.includes("PIN_WRONG")) {
    return { status: 401, message: "PIN incorrect" };
  }
  if (raw.includes("RESERVATION_NOT_FOUND")) {
    return { status: 404, message: "Réservation introuvable" };
  }
  if (raw.includes("NOT_OWNER")) {
    return { status: 403, message: "Cette réservation ne t'appartient pas" };
  }
  if (raw.includes("ALREADY_PAID")) {
    return { status: 409, message: "Réservation déjà payée" };
  }
  if (raw.includes("INVALID_RESERVATION_STATUS")) {
    return { status: 409, message: "Cette réservation ne peut plus être payée (annulée ou expirée)" };
  }
  if (raw.includes("NO_DEPOSIT_REQUIRED")) {
    return { status: 400, message: "Aucun acompte n'est requis pour cette réservation" };
  }
  if (raw.includes("INSUFFICIENT_FUNDS")) {
    return { status: 400, message: "Solde wallet insuffisant. Recharge d'abord." };
  }
  return { status: 500, message: "Paiement impossible — réessaie dans un instant" };
}

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
    const reservationId = String(body?.reservation_id ?? "").trim();
    const pin = String(body?.pin ?? "").trim();

    if (!reservationId) {
      return jsonResponse({ error: "reservation_id requis" }, 400);
    }
    if (!/^[0-9]{4}$/.test(pin)) {
      return jsonResponse({ error: "PIN invalide (4 chiffres attendus)" }, 400);
    }

    // Client user-authenticated : la RPC utilise auth.uid() pour identifier le caller
    // (le service_role n'a pas auth.uid()).
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          headers: { Authorization: req.headers.get("Authorization") ?? "" },
        },
      },
    );

    const { data, error } = await userClient.rpc("pay_reservation_from_wallet", {
      p_reservation_id: reservationId,
      p_pin: pin,
    });

    if (error) {
      const mapped = mapRpcError(error.message ?? "");
      return jsonResponse({ error: mapped.message }, mapped.status);
    }

    return jsonResponse({
      ok: true,
      reservation_id: (data as { reservation_id?: string })?.reservation_id,
      transaction_id: (data as { transaction_id?: string })?.transaction_id,
      amount_paid_xof: (data as { amount_paid_xof?: number })?.amount_paid_xof,
      new_balance_xof: (data as { new_balance_xof?: number })?.new_balance_xof,
    });
  } catch (err) {
    console.error("[pay-reservation] fatal:", err);
    return jsonResponse({ error: "Erreur interne" }, 500);
  }
});
