// ============================================================================
// venue-payout-initiate — retrait des revenus d'un venue vers mobile money.
//
// Le gérant déclenche cette fonction depuis son Espace gérant. On délègue à
// la RPC `request_venue_payout` toutes les vérifs métier (owner / KYC / solde
// payable / advisory_lock anti double-spend), puis on enchaîne le transfer
// sortant Paystack.
//
// Référence Paystack = `sp-vp-<uuid>` (vs `sp-wd-<uuid>` pour wallet withdraws).
// Le webhook `cinetpay-webhook` route sur `settle_venue_payout` selon ce préfixe.
// ============================================================================
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  corsHeaders,
  getAuthUser,
  jsonResponse,
  serviceClient,
} from "../_shared/supabase.ts";
import {
  addTransferContact,
  initiateTransfer,
  cinetpayMode,
} from "../_shared/cinetpay.ts";

// Mapping provider Soutra → CinetPay payment_method
const PROVIDER_METHODS: Record<string, "OMCIDIRECT" | "MTNCI" | "MOOVCI" | "WAVECI"> = {
  orange: "OMCIDIRECT",
  mtn: "MTNCI",
  moov: "MOOVCI",
  wave: "WAVECI",
};

const NOTIFY_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/cinetpay-webhook`;

// Mappe les codes d'erreur SQL (RAISE EXCEPTION 'XYZ') vers des messages clairs.
function mapRpcError(raw: string): { status: number; message: string } {
  if (raw.includes("NOT_AUTHENTICATED")) {
    return { status: 401, message: "Authentification requise" };
  }
  if (raw.includes("NOT_OWNER")) {
    return { status: 403, message: "Tu n'es pas le propriétaire de ce lieu" };
  }
  if (raw.includes("VENUE_NOT_FOUND")) {
    return { status: 404, message: "Établissement introuvable" };
  }
  if (raw.includes("KYC_REQUIRED")) {
    return {
      status: 403,
      message: "Vérification d'identité (KYC) requise pour retirer",
    };
  }
  if (raw.includes("AMOUNT_TOO_LOW")) {
    return { status: 400, message: "Montant minimum : 1 000 FCFA" };
  }
  if (raw.includes("AMOUNT_TOO_HIGH")) {
    return { status: 400, message: "Montant maximum : 2 000 000 FCFA" };
  }
  if (raw.includes("PROVIDER_INVALID")) {
    return { status: 400, message: "Opérateur invalide (MTN, Orange ou Wave)" };
  }
  if (raw.includes("PHONE_INVALID")) {
    return { status: 400, message: "Numéro invalide (format +225XXXXXXXXXX)" };
  }
  if (raw.includes("INSUFFICIENT_PAYABLE")) {
    return {
      status: 400,
      message: "Solde payable insuffisant pour ce montant",
    };
  }
  return { status: 500, message: "Impossible de créer la demande de retrait" };
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
    const venueId = String(body?.venue_id ?? "").trim();
    const amountXof = Number(body?.amount_xof);
    const provider = String(body?.provider ?? "").toLowerCase();
    const phone = String(body?.phone ?? "").trim();

    if (!venueId) {
      return jsonResponse({ error: "venue_id requis" }, 400);
    }
    if (!Number.isInteger(amountXof) || amountXof <= 0) {
      return jsonResponse({ error: "Montant invalide" }, 400);
    }

    const svc = serviceClient();

    // ── 1. Crée la demande en base via RPC (verrou + vérifs métier) ──
    // La RPC utilise `auth.uid()` pour identifier le caller : on utilise
    // donc le client anon avec le JWT user en header (pas le service role,
    // qui n'aurait pas auth.uid()).
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

    const { data: reqData, error: reqErr } = await userClient.rpc(
      "request_venue_payout",
      {
        p_venue_id: venueId,
        p_amount: amountXof,
        p_provider: provider,
        p_phone: phone,
      },
    );

    if (reqErr) {
      const mapped = mapRpcError(reqErr.message ?? "");
      return jsonResponse({ error: mapped.message }, mapped.status);
    }

    const reference = (reqData as { reference?: string })?.reference;
    const payoutId = (reqData as { payout_id?: string })?.payout_id;
    if (!reference || !payoutId) {
      return jsonResponse({ error: "Réponse RPC invalide" }, 500);
    }

    // ── 2. Récupère le nom + email du gérant pour le destinataire CinetPay ──
    const { data: profile } = await svc
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .maybeSingle();
    const p = profile as { full_name?: string; email?: string } | null;
    const fullName = p?.full_name || "Gérant Soutra-Playce";
    const [firstName, ...rest] = fullName.split(" ");
    const lastName = rest.join(" ") || firstName;
    const email = p?.email || `${user.id.slice(0, 8)}@soutra-playce.local`;

    // ── 3. Add contact CinetPay + initiate transfer ──
    try {
      const localNumber = phone.replace(/^\+225/, "");
      await addTransferContact({
        prefix: "225",
        phone: localNumber,
        name: firstName.slice(0, 50) || "User",
        surname: lastName.slice(0, 50) || "Soutra",
        email,
      });
      const transfer = await initiateTransfer({
        prefix: "225",
        phone: localNumber,
        amount: amountXof,
        client_transaction_id: reference,
        payment_method: PROVIDER_METHODS[provider],
        notify_url: NOTIFY_URL,
      });
      const transferStatus = transfer.data?.[0]?.treatment_status ?? "NEW";
      const cinetpayTxId = transfer.data?.[0]?.cinetpay_transaction_id;

      await svc
        .from("venue_payouts")
        .update({
          transfer_code: cinetpayTxId ?? null,
          metadata: {
            provider_used: "cinetpay",
            cinetpay_transaction_id: cinetpayTxId,
            treatment_status: transferStatus,
            initial_provider: provider,
            mode: cinetpayMode(),
          },
        })
        .eq("id", payoutId);

      // CinetPay valide les transferts de manière asynchrone (treatment_status
      // passe de NEW → VAL ou REJ). On ne marque PAS success immédiat ici —
      // l'issue arrive via cinetpay-webhook (settle_venue_payout).
      return jsonResponse({
        status: "pending",
        reference,
        payout_id: payoutId,
        treatment_status: transferStatus,
        message: "Retrait CinetPay en cours de traitement",
      });
    } catch (err) {
      // Échec Paystack : on marque le payout en failed (libère le solde
      // puisqu'il n'est plus ni pending ni success).
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("[venue-payout-initiate] cinetpay:", errMsg);
      await svc.rpc("settle_venue_payout", {
        p_reference: reference,
        p_outcome: "failed",
        p_failure_reason: errMsg,
        p_metadata_patch: { settled_by: "edge_error" },
      });
      return jsonResponse(
        { error: "Le transfert a échoué — ton solde a été restauré" },
        502,
      );
    }
  } catch (err) {
    console.error("[venue-payout-initiate] fatal:", err);
    return jsonResponse({ error: "Erreur interne" }, 500);
  }
});
