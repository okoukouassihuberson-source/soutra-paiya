import { supabase } from './supabase';

export type PublicProfile = { id: string; full_name: string | null; avatar_url: string | null };

/**
 * Noms / avatars d'autres utilisateurs via la vue `public_profiles` (migration 0098).
 * La table `profiles` n'est plus lisible pour les autres : plus de jointure `profiles(...)`.
 * Ne remonte jamais téléphone, e-mail ni KYC.
 */
export async function fetchPublicProfiles(ids: Array<string | null | undefined>): Promise<Map<string, PublicProfile>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  const map = new Map<string, PublicProfile>();
  if (unique.length === 0) return map;
  const { data } = await (supabase as any).from('public_profiles').select('id, full_name, avatar_url').in('id', unique);
  for (const p of (data ?? []) as PublicProfile[]) map.set(p.id, p);
  return map;
}
