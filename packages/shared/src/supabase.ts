import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types/database';

export type Db = Database;
export type SupabaseDb = SupabaseClient<Database>;

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  storage?: any;     // AsyncStorage (mobile) ou undefined (web par défaut)
  autoRefreshToken?: boolean;
  persistSession?: boolean;
  detectSessionInUrl?: boolean;
}

export function createSupabase(config: SupabaseConfig): SupabaseDb {
  return createClient<Database>(config.url, config.anonKey, {
    auth: {
      storage: config.storage,
      autoRefreshToken: config.autoRefreshToken ?? true,
      persistSession: config.persistSession ?? true,
      detectSessionInUrl: config.detectSessionInUrl ?? false,
    },
  });
}
