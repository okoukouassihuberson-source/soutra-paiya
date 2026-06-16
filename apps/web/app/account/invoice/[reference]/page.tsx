import { redirect, notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { supabaseServer } from '@/lib/supabase-server';
import { InvoiceView } from './_components/InvoiceView';

export const metadata: Metadata = {
  title: 'Facture — Soutra-Playce',
  description: 'Facture de souscription Soutra-Playce',
  robots: { index: false, follow: false }, // factures pas indexables
};

/**
 * /account/invoice/[reference] — facture HTML imprimable d'une transaction
 * de souscription Paystack.
 *
 * Server :
 *   1. Auth gate (redirect /login si non auth)
 *   2. Fetch la tx via provider_ref + filtre user_id = self (RLS double-check)
 *   3. Fetch le plan + profile en parallèle
 *   4. 404 si tx introuvable ou si purpose != subscription (la route ne sert
 *      qu'aux factures d'abonnement, pas aux paiements marchand génériques)
 *   5. InvoiceView client rend la facture + auto window.print() au mount
 */
export default async function InvoicePage({
  params,
}: {
  params: { reference: string };
}) {
  const sb = supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const reference = decodeURIComponent(params.reference);

  const { data: tx } = await (sb as any)
    .from('transactions')
    .select('id, user_id, amount_xof, status, provider, provider_ref, description, metadata, created_at, completed_at')
    .eq('provider_ref', reference)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!tx) notFound();
  if (tx.metadata?.purpose !== 'subscription') notFound();

  const planCode = tx.metadata?.plan_code as string | undefined;
  const billingPeriod = tx.metadata?.billing_period as 'monthly' | 'yearly' | undefined;

  const [{ data: plan }, { data: profile }] = await Promise.all([
    planCode
      ? (sb as any)
          .from('subscription_plans')
          .select('code, display_name, price_monthly_xof, price_yearly_xof, cashback_bps')
          .eq('code', planCode)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    (sb as any)
      .from('profiles')
      .select('full_name, phone, email, city')
      .eq('id', user.id)
      .maybeSingle(),
  ]);

  return (
    <InvoiceView
      tx={tx}
      plan={plan}
      profile={profile}
      billingPeriod={billingPeriod ?? 'monthly'}
    />
  );
}
