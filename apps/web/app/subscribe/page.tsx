import { supabaseServer } from '@/lib/supabase-server';
import { SubscribeView } from './_components/SubscribeView';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Abonnements Premium — Soutra-Playce',
  description:
    'Choisissez votre expérience Soutra-Playce. Cashback jusqu\'à 5%, accès VVIP, concierge dédié. Profitez d\'avantages exclusifs adaptés à votre style de vie.',
};

/**
 * /subscribe — écran de sélection d'abonnement premium.
 *
 * Server Component : fetch des plans depuis Supabase (RLS lecture publique
 * sur subscription_plans) puis délègue tout l'interactif au Client
 * Component `SubscribeView`. Le tracking initial 'plan_view' est émis
 * côté client au mount pour capter aussi les sessions anon.
 *
 * Les plans sont la source de vérité côté DB : changer un prix dans la
 * migration met à jour l'UI sans redéploiement.
 */
export default async function SubscribePage() {
  const sb = supabaseServer();
  const { data: plans, error } = await (sb as any)
    .from('subscription_plans')
    .select('*')
    .order('display_order', { ascending: true });

  if (error) {
    // Plans indisponibles → afficher un fallback minimal. La page reste
    // navigable, l'erreur est journalisée pour debug.
    console.error('[subscribe] failed to load plans:', error);
  }

  // En parallèle, on tente de récupérer l'abo courant pour personnaliser
  // les CTAs (« Plan actuel » au lieu de « Choisir Pro »).
  const { data: { user } } = await sb.auth.getUser();
  let currentSubscription: any = null;
  if (user) {
    const { data: subData } = await (sb as any).rpc('get_my_subscription');
    currentSubscription = subData ?? null;
  }

  return (
    <SubscribeView
      plans={plans ?? []}
      currentSubscription={currentSubscription}
    />
  );
}
