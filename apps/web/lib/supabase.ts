import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@soutra/shared/src/types/database';

// Config Supabase publique. La clé `anon` est conçue pour être exposée côté
// client (sécurité assurée par les RLS) — elle figure déjà dans app.json.
// Les variables d'environnement, si définies, restent prioritaires.
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://pjtmmzxcitbcwbbgtpdj.supabase.co';

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqdG1tenhjaXRiY3diYmd0cGRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4NjU5MDgsImV4cCI6MjA5NDQ0MTkwOH0.x3HmW32Bu9GgIVrLbhlcAVdm3YLYSyp292NRarC2WFI';

export function supabaseBrowser() {
  return createBrowserClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
}
