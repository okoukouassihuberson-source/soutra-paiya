import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@soutra/shared';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** `true` quand les deux variables publiques Supabase sont présentes. */
export const isSupabaseConfigured = Boolean(url && anonKey);

/** Type exact du client retourné par `createBrowserClient` pour notre schéma. */
export type BrowserClient = ReturnType<typeof createBrowserClient<Database>>;

let client: BrowserClient | null = null;

/**
 * Client Supabase navigateur (singleton).
 *
 * À n'appeler que côté navigateur — dans un effet ou un handler — jamais au
 * niveau du corps d'un composant : Next.js prérend les composants client côté
 * serveur au build, et instancier le client à ce moment-là ferait planter
 * `next build` si les variables d'environnement ne sont pas injectées.
 */
export function supabaseBrowser(): BrowserClient {
  if (!url || !anonKey) {
    throw new Error(
      'Supabase non configuré. Définis NEXT_PUBLIC_SUPABASE_URL et ' +
        'NEXT_PUBLIC_SUPABASE_ANON_KEY (apps/web/.env.local en local, ' +
        "variables d'environnement du projet sur Vercel).",
    );
  }
  const existing = client;
  if (existing) return existing;

  const created = createBrowserClient<Database>(url, anonKey);
  client = created;
  return created;
}
