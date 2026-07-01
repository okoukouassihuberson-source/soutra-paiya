// ============================================================================
// Helpers Supabase pour les Edge Functions.
// ============================================================================
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Client service role : contourne la RLS. Réservé au code serveur.
export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

// Client agissant AU NOM d'un utilisateur (JWT propagé). À utiliser pour
// appeler les RPC PostgreSQL qui s'appuient sur `auth.uid()` — le service
// role JWT n'a pas de champ `sub`, donc `auth.uid()` y renvoie NULL et les
// RPC comme get_room_booking_payment_info raisent NOT_AUTHENTICATED.
export function userClient(jwt: string): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    },
  );
}

// Extrait le JWT (sans le préfixe Bearer) du header Authorization d'une
// requête. Retourne null si absent. Utile pour construire un userClient.
export function extractJwt(req: Request): string | null {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, "");
  return token || null;
}

// Identifie l'utilisateur appelant à partir de son JWT (header Authorization).
// Renvoie null si le token est absent ou invalide.
export async function getAuthUser(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return null;

  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
