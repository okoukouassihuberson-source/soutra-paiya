/**
 * Module Discover — accès aux RPC de matching (migration 0023).
 */

import { supabase } from './supabase';

export const INTEREST_SUGGESTIONS = [
  'Maquis', 'Soirée', 'Restaurant', 'Cinéma', 'Sport',
  'Football', 'Basket', 'Yoga', 'Plage', 'Voyage',
  'Musique', 'Concert', 'Coupé-décalé', 'Afrobeat', 'Jazz',
  'Gastronomie', 'Cuisine ivoirienne', 'Brunch', 'Coffee', 'Cocktails',
  'Art', 'Photographie', 'Mode', 'Lecture', 'Gaming',
  'Tech', 'Entrepreneuriat', 'Networking', 'Bénévolat',
];

export type MyMatchingProfile = {
  interests: string[];
  bio: string | null;
  birth_year: number | null;
  gender: 'm' | 'f' | 'x' | null;
  looking_for: 'm' | 'f' | 'any' | null;
  discoverable: boolean;
  city: string | null;
  avatar_url: string | null;
  full_name: string | null;
};

export type Candidate = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  city: string | null;
  district: string | null;
  interests: string[];
  birth_year: number | null;
  gender: 'm' | 'f' | 'x' | null;
  overlap_count: number;
};

export type Match = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  city: string | null;
  district: string | null;
  matched_at: string;
};

export async function getMyMatchingProfile(userId: string): Promise<MyMatchingProfile> {
  const { data, error } = await (supabase as any)
    .from('profiles')
    .select('interests, bio, birth_year, gender, looking_for, discoverable, city, avatar_url, full_name')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data as MyMatchingProfile;
}

export async function updateMyMatchingProfile(userId: string, input: Partial<MyMatchingProfile>): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (input.interests !== undefined) patch.interests = input.interests;
  if (input.bio !== undefined) patch.bio = input.bio || null;
  if (input.birth_year !== undefined) patch.birth_year = input.birth_year;
  if (input.gender !== undefined) patch.gender = input.gender;
  if (input.looking_for !== undefined) patch.looking_for = input.looking_for;
  if (input.discoverable !== undefined) patch.discoverable = input.discoverable;
  const { error } = await (supabase as any).from('profiles').update(patch).eq('id', userId);
  if (error) throw error;
}

export async function listCandidates(opts?: { cityOnly?: boolean; limit?: number }): Promise<Candidate[]> {
  const { data, error } = await (supabase as any).rpc('discover_profiles', {
    p_limit: opts?.limit ?? 20,
    p_city_only: opts?.cityOnly ?? true,
  });
  if (error) throw error;
  return (data || []) as Candidate[];
}

export async function reactToProfile(targetId: string, action: 'like' | 'pass'): Promise<{ matched: boolean }> {
  const { data, error } = await (supabase as any).rpc('react_to_profile', {
    p_target_id: targetId,
    p_action: action,
  });
  if (error) throw error;
  return { matched: !!data?.matched };
}

export async function listMatches(): Promise<Match[]> {
  const { data, error } = await (supabase as any).rpc('list_my_matches');
  if (error) throw error;
  return (data || []) as Match[];
}
