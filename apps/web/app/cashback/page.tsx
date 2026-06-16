import { supabaseServer } from '@/lib/supabase-server';
import { CashbackView } from './_components/CashbackView';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Cashback Soutra-Playce — Jusqu\'à 5% sur chaque paiement',
  description:
    'Récupère jusqu\'à 5% de cashback automatique sur tous tes paiements marchand. Cashback crédité directement sur ton wallet Soutra-Pay, sans démarche.',
};

/**
 * /cashback — landing pédagogique publique.
 *
 * Server : fetch les 5 plans depuis Supabase (RLS lecture publique sur
 * subscription_plans) pour alimenter le calculateur et le comparatif.
 * Pas de fetch user — la page est accessible non auth (objectif conversion
 * → /subscribe).
 */
export default async function CashbackPage() {
  const sb = supabaseServer();
  const { data: plans, error } = await (sb as any)
    .from('subscription_plans')
    .select('code, display_name, tagline, price_monthly_xof, cashback_bps, display_order, is_recommended, is_prestige')
    .order('display_order', { ascending: true });

  if (error) {
    console.error('[cashback] failed to load plans:', error);
  }

  return <CashbackView plans={plans ?? []} />;
}
