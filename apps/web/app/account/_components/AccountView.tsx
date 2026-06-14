'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase';

/* ─────────────────────────────────────────────────── *
 *  TYPES                                              *
 * ─────────────────────────────────────────────────── */

type PlanCode = 'free' | 'standard' | 'pro' | 'premium' | 'soutra_premium';

interface Plan {
  code: PlanCode;
  display_name: string;
  price_monthly_xof: number;
  price_yearly_xof: number;
  cashback_bps: number;
  accent_color: string;
}

interface Profile {
  id: string;
  phone: string | null;
  email: string | null;
  full_name: string | null;
  kyc_status: string;
  role: string;
  created_at: string;
}

interface Subscription {
  id: string;
  plan_code: PlanCode;
  status: 'active' | 'trialing' | 'past_due' | 'cancelled' | 'expired';
  billing_period: 'monthly' | 'yearly';
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  payment_provider: string | null;
  payment_ref: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

interface CurrentSub {
  subscription: Subscription | null;
  plan: Plan | null;
}

interface Transaction {
  id: string;
  amount_xof: number;
  status: 'pending' | 'success' | 'failed' | 'reversed';
  provider: string | null;
  provider_ref: string | null;
  description: string | null;
  metadata: Record<string, any>;
  created_at: string;
  completed_at: string | null;
}

interface CashbackStats {
  ok: boolean;
  window_days: number;
  total_all_time_xof: number;
  period_xof: number;
  period_count: number;
  avg_per_tx_xof: number;
  current_plan: {
    code: PlanCode;
    display_name: string;
    cashback_bps: number;
  };
  latest: {
    amount_xof: number;
    created_at: string;
    source_amount_xof: string | null;
  } | null;
}

const PLAN_STYLES: Record<PlanCode, { ribbon: string; text: string; accent: string }> = {
  free:           { ribbon: 'from-neutral-200 to-neutral-100',    text: 'text-neutral-700', accent: 'text-neutral-500' },
  standard:       { ribbon: 'from-primary-500 to-amber-500',      text: 'text-white',       accent: 'text-primary-100' },
  pro:            { ribbon: 'from-blue-500 to-purple-600',        text: 'text-white',       accent: 'text-blue-100' },
  premium:        { ribbon: 'from-purple-500 to-amber-500',       text: 'text-white',       accent: 'text-purple-100' },
  soutra_premium: { ribbon: 'from-neutral-900 via-neutral-800 to-amber-600', text: 'text-amber-100', accent: 'text-amber-200/80' },
};

const STATUS_META: Record<Subscription['status'], { label: string; tone: string }> = {
  active:    { label: 'Actif',       tone: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  trialing:  { label: 'Période d\'essai', tone: 'bg-blue-500/15 text-blue-700 dark:text-blue-400' },
  past_due:  { label: 'Paiement échoué', tone: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  cancelled: { label: 'Résilié',     tone: 'bg-neutral-500/15 text-neutral-600 dark:text-neutral-400' },
  expired:   { label: 'Expiré',      tone: 'bg-red-500/15 text-red-700 dark:text-red-400' },
};

const TX_STATUS: Record<Transaction['status'], { label: string; tone: string }> = {
  pending:  { label: 'En cours', tone: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  success:  { label: 'Payée',    tone: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  failed:   { label: 'Échouée',  tone: 'bg-red-500/15 text-red-700 dark:text-red-400' },
  reversed: { label: 'Remboursée', tone: 'bg-purple-500/15 text-purple-700 dark:text-purple-400' },
};

/* ─────────────────────────────────────────────────── *
 *  MAIN VIEW                                          *
 * ─────────────────────────────────────────────────── */

export function AccountView({
  profile,
  currentSubscription,
  subscriptionHistory,
  transactionHistory,
  plans,
  cashbackStats,
}: {
  profile: Profile | null;
  currentSubscription: CurrentSub | null;
  subscriptionHistory: Subscription[];
  transactionHistory: Transaction[];
  plans: Plan[];
  cashbackStats: CashbackStats | null;
}) {
  const router = useRouter();
  const sb = supabaseBrowser();
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const flash = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok });
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  const plansByCode = useMemo(() => {
    const map = new Map<PlanCode, Plan>();
    plans.forEach((p) => map.set(p.code, p));
    return map;
  }, [plans]);

  const currentSub = currentSubscription?.subscription ?? null;
  const currentPlan = currentSubscription?.plan ?? null;
  const isActivePaid = currentSub && currentSub.plan_code !== 'free' && !currentSub.cancel_at_period_end;

  const handleCancel = useCallback(async () => {
    if (!currentSub) return;
    setCancelling(true);
    try {
      const { error } = await (sb.rpc as any)('cancel_my_subscription', {
        p_immediate: false,
      });
      if (error) {
        flash(error.message || 'Résiliation impossible', false);
        return;
      }
      flash('Abonnement résilié à la fin de la période actuelle');
      setConfirmOpen(false);
      router.refresh();
    } finally {
      setCancelling(false);
    }
  }, [sb, currentSub, flash, router]);

  const handleSignOut = useCallback(async () => {
    setSigningOut(true);
    await sb.auth.signOut();
    router.push('/');
  }, [sb, router]);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-white">
      {/* Background subtil */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 left-1/2 h-[400px] w-[800px] -translate-x-1/2 rounded-full bg-gradient-to-br from-primary-500/10 via-purple-500/5 to-amber-500/5 blur-[100px]" />
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed left-1/2 top-6 z-[100] flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold shadow-2xl backdrop-blur-xl ${
            toast.ok ? 'bg-emerald-500/95 text-white' : 'bg-red-500/95 text-white'
          }`}
        >
          <span>{toast.ok ? '✓' : '⚠'}</span>
          <span>{toast.msg}</span>
        </div>
      )}

      <main className="relative mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
        {/* ═══════════ HEADER ═══════════ */}
        <header className="mb-10 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-primary-600 dark:text-primary-400">
              Mon compte
            </p>
            <h1 className="mt-2 font-display text-3xl font-black tracking-tight sm:text-4xl">
              {profile?.full_name || 'Bienvenue'}
            </h1>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              {profile?.phone && <>📞 {profile.phone}</>}
              {profile?.email && <> · ✉ {profile.email}</>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/"
              className="rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:border-neutral-600"
            >
              ← Accueil
            </Link>
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              className="rounded-full border border-red-500/30 bg-red-500/5 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-500/10 disabled:opacity-50 dark:text-red-400"
            >
              {signingOut ? 'Déconnexion…' : 'Se déconnecter'}
            </button>
          </div>
        </header>

        {/* ═══════════ ABONNEMENT COURANT ═══════════ */}
        <section className="mb-12">
          <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-neutral-500">
            Abonnement actuel
          </h2>

          <div className="overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            {/* Ribbon plan */}
            {currentPlan && (
              <div className={`bg-gradient-to-r ${PLAN_STYLES[currentPlan.code].ribbon} px-6 py-5 sm:px-8 sm:py-6`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className={`text-xs font-bold uppercase tracking-wider ${PLAN_STYLES[currentPlan.code].accent}`}>
                      Plan {currentPlan.code === 'soutra_premium' ? 'Prestige' : currentPlan.cashback_bps >= 200 ? 'Premium' : 'Standard'}
                    </p>
                    <h3 className={`mt-1 font-display text-3xl font-black tracking-tight ${PLAN_STYLES[currentPlan.code].text}`}>
                      {currentPlan.display_name}
                    </h3>
                  </div>
                  <div className="text-right">
                    <p className={`text-xs ${PLAN_STYLES[currentPlan.code].accent}`}>Cashback</p>
                    <p className={`font-display text-2xl font-black ${PLAN_STYLES[currentPlan.code].text}`}>
                      {(currentPlan.cashback_bps / 100).toFixed(currentPlan.cashback_bps % 100 === 0 ? 0 : 1)} %
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Détails */}
            <div className="p-6 sm:p-8">
              {currentSub ? (
                <>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <StatBlock
                      label="Statut"
                      value={
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_META[currentSub.status].tone}`}>
                          {STATUS_META[currentSub.status].label}
                          {currentSub.cancel_at_period_end && currentSub.status === 'active' && (
                            <span className="ml-1 text-[10px]">(à expiration)</span>
                          )}
                        </span>
                      }
                    />
                    <StatBlock
                      label="Période"
                      value={<span className="font-semibold capitalize">{currentSub.billing_period === 'monthly' ? 'Mensuelle' : 'Annuelle'}</span>}
                    />
                    <StatBlock
                      label="Renouvellement"
                      value={
                        <span className="font-mono text-sm font-semibold">
                          {formatDate(currentSub.current_period_end)}
                        </span>
                      }
                      sub={daysUntil(currentSub.current_period_end)}
                    />
                    <StatBlock
                      label="Souscrit le"
                      value={
                        <span className="font-mono text-sm font-semibold">
                          {formatDate(currentSub.created_at)}
                        </span>
                      }
                    />
                  </div>

                  {currentSub.cancel_at_period_end && (
                    <div className="mt-6 flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
                      <span className="text-xl">⚠️</span>
                      <div className="text-sm text-amber-700 dark:text-amber-300">
                        <strong>Résiliation programmée.</strong> Ton abonnement {currentPlan?.display_name} reste actif jusqu&apos;au{' '}
                        <strong>{formatDate(currentSub.current_period_end)}</strong>, puis basculera sur le plan Free.
                      </div>
                    </div>
                  )}

                  {currentSub.status === 'past_due' && (
                    <div className="mt-6 flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/5 p-4">
                      <span className="text-xl">⚠️</span>
                      <div className="text-sm text-red-700 dark:text-red-300">
                        <strong>Paiement échoué.</strong> Renouvelle ton paiement pour conserver tes avantages.
                      </div>
                    </div>
                  )}

                  <div className="mt-6 flex flex-wrap gap-2">
                    <Link
                      href="/subscribe"
                      className="rounded-2xl bg-gradient-to-r from-primary-500 to-amber-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary-500/20 transition hover:opacity-90"
                    >
                      Changer de plan
                    </Link>
                    {isActivePaid && (
                      <button
                        onClick={() => setConfirmOpen(true)}
                        className="rounded-2xl border border-red-500/40 bg-red-500/5 px-5 py-2.5 text-sm font-bold text-red-600 transition hover:bg-red-500/10 dark:text-red-400"
                      >
                        Résilier
                      </button>
                    )}
                    {currentSub.cancel_at_period_end && (
                      <Link
                        href="/subscribe"
                        className="rounded-2xl border border-emerald-500/40 bg-emerald-500/5 px-5 py-2.5 text-sm font-bold text-emerald-600 transition hover:bg-emerald-500/10 dark:text-emerald-400"
                      >
                        Réactiver mon abonnement
                      </Link>
                    )}
                  </div>
                </>
              ) : (
                <div className="py-6 text-center">
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">
                    Tu utilises actuellement le <strong>plan Free</strong>. Découvre les avantages Premium :
                    cashback jusqu&apos;à 5 %, accès VVIP, concierge dédié.
                  </p>
                  <Link
                    href="/subscribe"
                    className="mt-5 inline-block rounded-2xl bg-gradient-to-r from-primary-500 via-purple-500 to-amber-500 px-6 py-3 text-sm font-bold text-white shadow-xl shadow-primary-500/30 transition hover:scale-[1.02]"
                  >
                    Découvrir les abonnements
                  </Link>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ═══════════ CASHBACK GAGNÉ ═══════════ */}
        {cashbackStats?.ok && (
          <section className="mb-12">
            <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-neutral-500">
              Cashback gagné
            </h2>
            <div className="overflow-hidden rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-white to-emerald-500/5 dark:from-emerald-500/15 dark:via-neutral-900/80 dark:to-emerald-500/5">
              <div className="grid grid-cols-1 gap-px bg-emerald-500/10 sm:grid-cols-3">
                {/* Total all-time */}
                <div className="bg-white p-6 dark:bg-neutral-900">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                    Total accumulé
                  </p>
                  <p className="mt-2 font-display text-3xl font-black tracking-tight text-neutral-900 dark:text-white">
                    {formatXOF(cashbackStats.total_all_time_xof)}
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    Crédité dans ton wallet
                  </p>
                </div>

                {/* Sur 30j */}
                <div className="bg-white p-6 dark:bg-neutral-900">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                    {cashbackStats.window_days} derniers jours
                  </p>
                  <p className="mt-2 font-display text-3xl font-black tracking-tight text-neutral-900 dark:text-white">
                    {formatXOF(cashbackStats.period_xof)}
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {cashbackStats.period_count} transaction{cashbackStats.period_count > 1 ? 's' : ''}
                    {cashbackStats.period_count > 0 && (
                      <> · {formatXOF(cashbackStats.avg_per_tx_xof)} en moyenne</>
                    )}
                  </p>
                </div>

                {/* Plan actif + taux */}
                <div className="bg-white p-6 dark:bg-neutral-900">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                    Ton taux
                  </p>
                  <p className="mt-2 font-display text-3xl font-black tracking-tight text-emerald-600 dark:text-emerald-400">
                    {(cashbackStats.current_plan.cashback_bps / 100).toFixed(
                      cashbackStats.current_plan.cashback_bps % 100 === 0 ? 0 : 1,
                    )} %
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    Plan {cashbackStats.current_plan.display_name}
                    {cashbackStats.current_plan.code === 'free' && (
                      <>
                        {' · '}
                        <Link href="/subscribe" className="font-bold text-primary-600 dark:text-primary-400 hover:underline">
                          monter à 5 % →
                        </Link>
                      </>
                    )}
                  </p>
                </div>
              </div>

              {/* Footer : dernière transaction cashback */}
              {cashbackStats.latest && (
                <div className="flex flex-wrap items-center gap-3 border-t border-emerald-500/10 bg-white/40 px-6 py-3 text-xs text-neutral-600 dark:bg-neutral-950/40 dark:text-neutral-400">
                  <span>💰</span>
                  <span>
                    Dernier cashback :{' '}
                    <strong className="text-emerald-700 dark:text-emerald-400">
                      {formatXOF(cashbackStats.latest.amount_xof)}
                    </strong>
                    {cashbackStats.latest.source_amount_xof && (
                      <> sur une dépense de {formatXOF(Number(cashbackStats.latest.source_amount_xof))}</>
                    )}
                    , {formatRelativeTime(cashbackStats.latest.created_at)}
                  </span>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ═══════════ HISTORIQUE PAIEMENTS ═══════════ */}
        <section className="mb-12">
          <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-neutral-500">
            Historique des paiements ({transactionHistory.length})
          </h2>
          <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
            {transactionHistory.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-neutral-500">
                Aucune transaction Premium pour l&apos;instant.
              </div>
            ) : (
              <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {transactionHistory.map((tx) => {
                  const planCode = tx.metadata?.plan_code as PlanCode | undefined;
                  const planName = planCode ? plansByCode.get(planCode)?.display_name : null;
                  const billingPeriod = tx.metadata?.billing_period as string | undefined;
                  return (
                    <li key={tx.id} className="flex flex-wrap items-center gap-3 px-5 py-4 sm:px-6">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {planName || tx.description || 'Abonnement Soutra-Playce'}
                          {billingPeriod && (
                            <span className="ml-2 text-xs font-normal text-neutral-500">
                              ({billingPeriod === 'monthly' ? 'Mensuel' : 'Annuel'})
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 text-xs text-neutral-500">
                          {formatDateTime(tx.created_at)}
                          {tx.provider_ref && (
                            <span className="ml-2 font-mono text-[10px] text-neutral-400">
                              ref {tx.provider_ref.slice(0, 18)}…
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-sm font-bold">{formatXOF(tx.amount_xof)}</p>
                        <span className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${TX_STATUS[tx.status].tone}`}>
                          {TX_STATUS[tx.status].label}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* ═══════════ HISTORIQUE ABONNEMENTS (si > 1) ═══════════ */}
        {subscriptionHistory.length > 1 && (
          <section className="mb-12">
            <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-neutral-500">
              Historique des abonnements ({subscriptionHistory.length})
            </h2>
            <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
              <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {subscriptionHistory.map((sub) => {
                  const plan = plansByCode.get(sub.plan_code);
                  return (
                    <li key={sub.id} className="flex flex-wrap items-center gap-3 px-5 py-4 sm:px-6">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">
                          {plan?.display_name || sub.plan_code}
                          <span className="ml-2 text-xs font-normal text-neutral-500">
                            ({sub.billing_period === 'monthly' ? 'Mensuel' : 'Annuel'})
                          </span>
                        </p>
                        <p className="mt-0.5 text-xs text-neutral-500">
                          Du {formatDate(sub.current_period_start)} au {formatDate(sub.current_period_end)}
                        </p>
                      </div>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_META[sub.status].tone}`}>
                        {STATUS_META[sub.status].label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        )}

        {/* ═══════════ INFOS COMPTE ═══════════ */}
        <section>
          <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-neutral-500">
            Informations du compte
          </h2>
          <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
            <dl className="divide-y divide-neutral-100 dark:divide-neutral-800">
              <Row label="Nom complet" value={profile?.full_name || '—'} />
              <Row label="Téléphone" value={profile?.phone || '—'} mono />
              <Row label="Email" value={profile?.email || '—'} />
              <Row label="Rôle" value={
                <span className="capitalize">{(profile?.role || 'user').replace('_', ' ')}</span>
              } />
              <Row
                label="KYC"
                value={
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    profile?.kyc_status === 'verified'
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                      : profile?.kyc_status === 'pending'
                      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                      : profile?.kyc_status === 'rejected'
                      ? 'bg-red-500/15 text-red-700 dark:text-red-400'
                      : 'bg-neutral-500/15 text-neutral-600 dark:text-neutral-400'
                  }`}>
                    {profile?.kyc_status === 'verified' ? '✓ Vérifié'
                      : profile?.kyc_status === 'pending' ? 'En attente'
                      : profile?.kyc_status === 'rejected' ? 'Rejeté'
                      : 'Non soumis'}
                  </span>
                }
              />
              <Row label="Membre depuis" value={profile?.created_at ? formatDate(profile.created_at) : '—'} mono />
            </dl>
          </div>
        </section>
      </main>

      {/* ═══════════ MODAL CONFIRMATION RÉSILIATION ═══════════ */}
      {confirmOpen && currentSub && currentPlan && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[200] flex items-end justify-center bg-neutral-900/70 backdrop-blur-md sm:items-center"
          onClick={() => !cancelling && setConfirmOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="animate-sheet-slide-up w-full max-w-md rounded-t-3xl border border-neutral-200 bg-white p-6 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900 sm:rounded-3xl sm:p-8"
          >
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-neutral-300 dark:bg-neutral-700 sm:hidden" />
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 text-3xl text-red-500">
              ⚠
            </div>
            <h3 className="text-center font-display text-xl font-black">Résilier l&apos;abonnement ?</h3>
            <p className="mt-3 text-center text-sm text-neutral-600 dark:text-neutral-400">
              Ton abonnement <strong>{currentPlan.display_name}</strong> restera actif jusqu&apos;au{' '}
              <strong>{formatDate(currentSub.current_period_end)}</strong>. Tu pourras le réactiver à tout moment d&apos;ici là.
            </p>
            <p className="mt-2 text-center text-xs text-neutral-500">
              Pas de remboursement immédiat — tu profites de ce que tu as payé jusqu&apos;à la fin de la période.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                onClick={() => setConfirmOpen(false)}
                disabled={cancelling}
                className="rounded-2xl border border-neutral-300 bg-white px-5 py-3 text-sm font-bold text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
              >
                Garder mon abonnement
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="rounded-2xl bg-red-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-red-500/30 transition hover:bg-red-600 disabled:opacity-50"
              >
                {cancelling ? 'Résiliation…' : 'Confirmer la résiliation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────── *
 *  SUB-COMPONENTS                                     *
 * ─────────────────────────────────────────────────── */

function StatBlock({
  label, value, sub,
}: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">{label}</p>
      <div className="mt-1.5">{value}</div>
      {sub && <p className="mt-0.5 text-[11px] text-neutral-500">{sub}</p>}
    </div>
  );
}

function Row({
  label, value, mono = false,
}: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 sm:px-6">
      <dt className="text-sm text-neutral-600 dark:text-neutral-400">{label}</dt>
      <dd className={`text-sm font-semibold ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}

/* ─────────────────────────────────────────────────── *
 *  UTILS                                              *
 * ─────────────────────────────────────────────────── */

function formatXOF(n: number): string {
  if (!Number.isFinite(n)) return '0 FCFA';
  return new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' FCFA';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  if (d < 7) return `il y a ${d} j`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

function daysUntil(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (days < 0) return `Expiré il y a ${-days} j`;
  if (days === 0) return 'Aujourd\'hui';
  if (days === 1) return 'Demain';
  if (days < 30) return `Dans ${days} jours`;
  return `Dans ${Math.round(days / 30)} mois`;
}
