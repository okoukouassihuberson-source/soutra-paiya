// ============================================================================
// cinetpay-initialize — démarre un paiement CinetPay.
//
// Remplace paystack-initialize. Appelée par le mobile pour :
//   • recharger le wallet (purpose='topup')
//   • payer un acompte de réservation (purpose='reservation_deposit')
//
// Crée une transaction `pending` en DB puis renvoie la `payment_url` CinetPay
// que le mobile ouvre dans un WebBrowser. Au retour (via deep link), le
// mobile appelle cinetpay-verify (ou attend simplement le webhook).
// ============================================================================
import {
  corsHeaders,
  getAuthUser,
  jsonResponse,
  serviceClient,
} from "../_shared/supabase.ts";
import {
  initializeTransaction,
  cinetpayMode,
} from "../_shared/cinetpay.ts";

const MIN_XOF = 100;
const MAX_XOF = 5_000_000;

// URL de retour : page web Soutra-Playce qui redirige vers le deep link mobile.
// (Voir apps/web/app/cinetpay/callback/page.tsx)
const RETURN_URL = "https://soutra-paiya.vercel.app/cinetpay/callback";

// Webhook : Edge function publique (verify_jwt=false dans config.toml)
const NOTIFY_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/cinetpay-webhook`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Méthode non autorisée" }, 405);

  try {
    const user = await getAuthUser(req);
    if (!user) return jsonResponse({ error: "Non authentifié" }, 401);

    const body = await req.json().catch(() => null);
    const purpose = body?.purpose;
    if (purpose !== "topup" && purpose !== "reservation_deposit") {
      return jsonResponse({ error: "purpose invalide" }, 400);
    }

    const svc = serviceClient();

    // Récupère info user pour CinetPay (name/email obligatoires)
    const { data: profile } = await svc
      .from("profiles")
      .select("full_name, phone, email")
      .eq("id", user.id)
      .maybeSingle();
    const fullName = (profile as { full_name?: string } | null)?.full_name || "Utilisateur";
    const [firstName, ...rest] = fullName.split(" ");
    const lastName = rest.join(" ") || firstName;
    const phone = (profile as { phone?: string } | null)?.phone || "";
    const email = (profile as { email?: string } | null)?.email
      || `${user.id.slice(0, 8)}@soutra-playce.local`;

    if (purpose === "topup") {
      const amountXof = Number(body?.amount_xof);
      if (!Number.isInteger(amountXof) || amountXof < MIN_XOF || amountXof > MAX_XOF) {
        return jsonResponse({ error: `Montant invalide (${MIN_XOF}-${MAX_XOF} FCFA)` }, 400);
      }
      // Référence avec préfixe sp-tp- (= topup) pour le routing webhook
      const reference = `sp-tp-${crypto.randomUUID()}`;
      const { error: txErr } = await svc.from("transactions").insert({
        user_id: user.id,
        type: "topup",
        amount_xof: amountXof,
        status: "pending",
        provider: "cinetpay",
        provider_ref: reference,
        description: "Recharge wallet via CinetPay",
        metadata: { mode: cinetpayMode() },
      });
      if (txErr) return jsonResponse({ error: txErr.message }, 500);

      const init = await initializeTransaction({
        transaction_id: reference,
        amount: amountXof,
        currency: "XOF",
        description: `Recharge wallet ${amountXof} FCFA`,
        return_url: RETURN_URL,
        notify_url: NOTIFY_URL,
        customer_name: firstName.slice(0, 50) || "User",
        customer_surname: lastName.slice(0, 50) || "Soutra",
        customer_email: email,
        customer_phone_number: phone,
        customer_country: "CI",
        customer_city: "Abidjan",
        customer_state: "CI",
        customer_zip_code: "00000",
        customer_address: "N/A",
        channels: "ALL",
        metadata: reference.slice(0, 100),
      });
      return jsonResponse({
        payment_url: init.data?.payment_url,
        payment_token: init.data?.payment_token,
        reference,
      });
    }

    // purpose === "reservation_deposit"
    const reservationId = String(body?.reservation_id ?? "");
    if (!reservationId) return jsonResponse({ error: "reservation_id requis" }, 400);

    const { data: resa, error: resaErr } = await svc
      .from("reservations")
      .select("id, user_id, venue_id, deposit_xof, status, escrow_tx_id")
      .eq("id", reservationId)
      .maybeSingle();
    if (resaErr) return jsonResponse({ error: resaErr.message }, 500);
    if (!resa) return jsonResponse({ error: "Réservation introuvable" }, 404);
    const r = resa as { id: string; user_id: string; venue_id: string; deposit_xof: number; status: string; escrow_tx_id: string | null };
    if (r.user_id !== user.id) return jsonResponse({ error: "Pas tes droits" }, 403);
    if (r.escrow_tx_id) return jsonResponse({ error: "Acompte déjà payé" }, 409);
    if (!r.deposit_xof || r.deposit_xof < MIN_XOF) {
      return jsonResponse({ error: "Acompte invalide" }, 400);
    }

    const reference = `sp-dep-${crypto.randomUUID()}`;
    const { data: tx, error: txErr } = await svc.from("transactions").insert({
      user_id: user.id,
      type: "payment",
      amount_xof: r.deposit_xof,
      status: "pending",
      provider: "cinetpay",
      provider_ref: reference,
      description: `Acompte réservation`,
      reservation_id: r.id,
      metadata: { mode: cinetpayMode() },
    }).select("id").single();
    if (txErr || !tx) return jsonResponse({ error: "Insert tx échoué" }, 500);

    const init = await initializeTransaction({
      transaction_id: reference,
      amount: r.deposit_xof,
      currency: "XOF",
      description: `Acompte ${r.deposit_xof} FCFA`,
      return_url: RETURN_URL,
      notify_url: NOTIFY_URL,
      customer_name: firstName.slice(0, 50) || "User",
      customer_surname: lastName.slice(0, 50) || "Soutra",
      customer_email: email,
      customer_phone_number: phone,
      customer_country: "CI",
      customer_city: "Abidjan",
      customer_state: "CI",
      customer_zip_code: "00000",
      customer_address: "N/A",
      channels: "ALL",
      metadata: reference.slice(0, 100),
    });
    return jsonResponse({
      payment_url: init.data?.payment_url,
      payment_token: init.data?.payment_token,
      reference,
    });
  } catch (err) {
    console.error("[cinetpay-initialize] fatal:", err);
    const msg = err instanceof Error ? err.message : "Erreur interne";
    return jsonResponse({ error: msg }, 500);
  }
});
