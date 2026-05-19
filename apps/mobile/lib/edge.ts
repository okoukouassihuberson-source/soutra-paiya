// ============================================================================
// Appel des Edge Functions Supabase, avec remontée du message d'erreur serveur.
// ============================================================================
import { supabase } from './supabase';

// Appelle une Edge Function et, en cas d'erreur HTTP, fait remonter le message
// renvoyé par le serveur dans le corps de la réponse ({ error: "..." }).
export async function invokeEdge<T = any>(
  name: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (error) {
    let message = error.message || 'Erreur réseau';
    const ctx = (error as any).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const payload = await ctx.json();
        if (payload?.error) message = String(payload.error);
      } catch {
        // corps non-JSON : on garde le message générique
      }
    }
    throw new Error(message);
  }
  return data as T;
}
