import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { supabaseServer } from '@/lib/supabase-server';
import { AccountView } from './_components/AccountView';

export const metadata: Metadata = {
  title: 'Mon compte — Soutra-Playce',
  description: 'Gère ton abonnement Soutra-Playce : plan actuel, échéances, historique de paiement, résiliation.',
};

/**
 * /account — page de gestion du compte (focus abonnement pour cette PR).
 *
 * Server Component : auth gate + fetch en parallèle de :
 *   • profil (nom, téléphone, kyc)
 *   • abonnement actif (via get_my_subscription)
 *   • historique des subscriptions (toutes statuses)
 *   • transactions Paystack purpose=subscription (factures)
 *
 * Délègue toute l'interactivité (résiliation, etc.) à AccountView.
 */
export default async function AccountPage() {
  const sb = supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) redirect('/login');

  // Fetch en parallèle. Tout passe par les RLS — un user voit ses propres
  // données uniquement.
  const [
    { data: profile },
    { data: subData },
    { data: subHistory },
    { data: txHistory },
  ] = await Promise.all([
    (sb as any)
      .from('profiles')
      .select('id, phone, email, full_name, kyc_status, created_at, role')
      .eq('id', user.id)
      .maybeSingle(),
    (sb as any).rpc('get_my_subscription'),
    (sb as any)
      .from('subscriptions')
      .select('id, plan_code, status, billing_period, current_period_start, current_period_end, cancel_at_period_end, payment_provider, payment_ref, metadata, created_at, updated_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20),
    (sb as any)
      .from('transactions')
      .select('id, amount_xof, status, provider, provider_ref, description, metadata, created_at, completed_at')
      .eq('user_id', user.id)
      .eq('type', 'payment')
      .eq('provider', 'paystack')
      .order('created_at', { ascending: false })
      .limit(30),
  ]);

  // Récupère le catalogue des plans pour afficher display_name dans
  // l'historique (sinon on n'a que le code).
  const { data: plans } = await (sb as any)
    .from('subscription_plans')
    .select('code, display_name, price_monthly_xof, price_yearly_xof, cashback_bps, accent_color')
    .order('display_order', { ascending: true });

  // Filtre les transactions liées aux subscriptions (metadata.purpose).
  const subscriptionTxs = (txHistory ?? []).filter(
    (t: any) => t?.metadata?.purpose === 'subscription',
  );

  return (
    <AccountView
      profile={profile}
      currentSubscription={subData}
      subscriptionHistory={subHistory ?? []}
      transactionHistory={subscriptionTxs}
      plans={plans ?? []}
    />
  );
}
