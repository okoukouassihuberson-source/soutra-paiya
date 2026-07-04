import { supabaseServer } from '@/lib/supabase-server';
import { LoyaltyView } from './_components/LoyaltyView';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Programme de fidélité Soutra-Playce — Gagne des points sur chaque paiement',
  description:
    '100 FCFA dépensés = 1 point de fidélité. Progresse de Bronze à Diamant et échange tes points contre des récompenses partenaires.',
};

/**
 * /loyalty — landing pédagogique publique du programme de fidélité.
 * Remplace /cashback (déprécié, migration 0069).
 *
 * Server : fetch les niveaux + le catalogue de récompenses depuis Supabase
 * (RLS lecture publique sur loyalty_levels / loyalty_rewards, migration
 * 0068) pour alimenter le calculateur et le comparatif. Pas de fetch user —
 * la page est accessible non auth (objectif conversion → /login).
 */
export default async function LoyaltyPage() {
  const sb = supabaseServer();
  const [{ data: levels, error: levelsError }, { data: rewards, error: rewardsError }] = await Promise.all([
    (sb as any)
      .from('loyalty_levels')
      .select('code, label, min_points, color, emoji, benefits')
      .order('sort_order', { ascending: true }),
    (sb as any)
      .from('loyalty_rewards')
      .select('code, label, description, points_cost')
      .eq('active', true)
      .order('sort_order', { ascending: true }),
  ]);

  if (levelsError) console.error('[loyalty] failed to load levels:', levelsError);
  if (rewardsError) console.error('[loyalty] failed to load rewards:', rewardsError);

  return <LoyaltyView levels={levels ?? []} rewards={rewards ?? []} />;
}
