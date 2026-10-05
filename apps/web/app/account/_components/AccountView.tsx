'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase';
import { ThemeSelect } from '@/components/ThemeSelect';

/* ─────────────────────────────────────────────────── *
 *  TYPES                                              *
 * ─────────────────────────────────────────────────── */

type PlanCode = 'free' | 'standard' | 'pro' | 'premium' | 'soutra_premium';

interface Plan {
  code: PlanCode;
  display_name: string;
  price_monthly_xof: number;
  price_yearly_xof: number;
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
  // Migration 0052 — auto-renouvellement Paystack
  auto_renew?: boolean;
  last_authorization_code?: string | null;
  last_card_brand?: string | null;
  last_card_last4?: string | null;
  last_renew_attempt_at?: string | null;
  last_renew_outcome?: string | null;
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

interface LoyaltyStats {
  ok: boolean;
  window_days: number;
  points_balance: number;
  points_lifetime: number;
  level: { code: string; label: string; min_points: number; color: string; emoji: string };
  next_level: { code: string; label: string; min_points: number; points_remaining: number } | null;
  period_points: number;
  period_count: number;
  rank: number | null;
}

const PLAN_STYLES: Record<PlanCode, { ribbon: string; text: string; accent: string }> = {
  free:           { ribbon: 'from-neutral-200 to-neutral-100',    text: 'text-neutral-700', accent: 'text-neutral-600' },
  standard:       { ribbon: 'from-primary-500 to-amber-500',      text: 'text-white',       accent: 'text-primary-100' },
  pro:            { ribbon: 'from-blue-500 to-purple-600',        text: 'text-white',       accent: 'text-blue-100' },
  premium:        { ribbon: 'from-purple-500 to-amber-500',       text: 'text-white',       accent: 'text-purple-100' },
  soutra_premium: { ribbon: 'from-neutral-900 via-neutral-800 to-amber-600', text: 'text-amber-100', accent: 'text-amber-200/80' },
};

const STATUS_META: Record<Subscription['status'], { label: string; tone: string }> = {
  active:    { label: 'Actif',       tone: 'bg-emerald-500/15 text-emerald-700 ' },
  trialing:  { label: 'Période d\'essai', tone: 'bg-blue-500/15 text-blue-700 ' },
  past_due:  { label: 'Paiement échoué', tone: 'bg-amber-500/15 text-amber-700 ' },
  cancelled: { label: 'Résilié',     tone: 'bg-neutral-500/15 text-neutral-600 ' },
  expired:   { label: 'Expiré',      tone: 'bg-red-500/15 text-red-700 ' },
};

const TX_STATUS: Record<Transaction['status'], { label: string; tone: string }> = {
  pending:  { label: 'En cours', tone: 'bg-amber-500/15 text-amber-700 ' },
  success:  { label: 'Payée',    tone: 'bg-emerald-500/15 text-emerald-700 ' },
  failed:   { label: 'Échouée',  tone: 'bg-red-500/15 text-red-700 ' },
  reversed: { label: 'Remboursée', tone: 'bg-purple-500/15 text-purple-700 ' },
};

const ROLE_LABEL: Record<string, string> = { admin: 'Administrateur', organizer: 'Organisateur', venue_owner: 'Propriétaire', guide: 'Guide', staff: 'Staff' };

/* ─────────────────────────────────────────────────── *
 *  MAIN VIEW                                          *
 * ─────────────────────────────────────────────────── */

export function AccountView({
  profile,
  currentSubscription,
  subscriptionHistory,
  transactionHistory,
  plans,
  loyaltyStats,
}: {
  profile: Profile | null;
  currentSubscription: CurrentSub | null;
  subscriptionHistory: Subscription[];
  transactionHistory: Transaction[];
  plans: Plan[];
  loyaltyStats: LoyaltyStats | null;
}) {
  const router = useRouter();
  const sb = supabaseBrowser();
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  // Toggle auto-renouvellement : on garde un état local pour un toggle
  // optimiste (UI bascule immédiatement, rollback si la RPC fail).
  const [autoRenewLocal, setAutoRenewLocal] = useState<boolean | null>(null);
  const [savingRenew, setSavingRenew] = useState(false);

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

  const handleToggleAutoRenew = useCallback(async (next: boolean) => {
    if (!currentSub) return;
    setSavingRenew(true);
    setAutoRenewLocal(next); // optimiste
    try {
      const { error } = await (sb.rpc as any)('set_auto_renew', {
        p_subscription_id: currentSub.id,
        p_value: next,
      });
      if (error) {
        // Rollback en cas d'erreur
        setAutoRenewLocal(currentSub.auto_renew ?? true);
        flash(error.message || 'Modification impossible', false);
        return;
      }
      flash(
        next
          ? 'Renouvellement automatique activé'
          : 'Renouvellement automatique désactivé',
      );
      router.refresh();
    } finally {
      setSavingRenew(false);
    }
  }, [sb, currentSub, flash, router]);

  const role = profile?.role ?? 'user';
  const shortcuts: { href: string; icon: string; label: string; hint: string }[] = [
    { href: '/mes-voyages', icon: '🧳', label: 'Mes voyages', hint: 'Réservations et billets' },
    { href: '/mes-activites', icon: '🎯', label: 'Mes activités', hint: 'Créneaux réservés' },
    { href: '/loyalty', icon: '⭐', label: 'Fidélité', hint: 'Points et avantages' },
    { href: '/notifications/preferences', icon: '🔔', label: 'Notifications', hint: 'Choisir ce que je reçois' },
    ...(['organizer', 'venue_owner', 'guide', 'admin'].includes(role) ? [{ href: '/organisateur', icon: '📈', label: 'Espace organisateur', hint: 'Voyages, activités, stats' }] : []),
    ...(['venue_owner', 'admin'].includes(role) ? [{ href: '/pro', icon: '🏪', label: 'Espace Pro', hint: 'Mon établissement' }] : []),
    ...(role === 'admin' ? [{ href: '/admin', icon: '🛡️', label: 'Administration', hint: 'Centre de contrôle' }] : []),
  ];

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-neutral-50 text-neutral-900 ">
      {/* Background subtil */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 left-1/2 h-[400px] w-[800px] -translate-x-1/2 rounded-full bg-gradient-to-br from-primary-500/10 via-purple-500/5 to-amber-500/5 blur-[100px]" />
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed left-1/2 top-6 z-[100] flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold shadow-2xl backdrop-blur-xl ${ toast.ok ? 'bg-emerald-500/95 text-white' : 'bg-red-500/95 text-white'
          }`}
        >
          <span>{toast.ok ? '✓' : '⚠'}</span>
          <span>{toast.msg}</span>
        </div>
      )}

      <main className="relative mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
        {/* ═══════════ HEADER ═══════════ */}
        <header className="mb-10 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <span aria-hidden className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary-500 font-display text-2xl font-black text-night">
              {(profile?.full_name || profile?.phone || '?').trim().charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider text-primary-700">Mon compte</p>
              <h1 className="mt-1 truncate font-display text-3xl font-black tracking-tight sm:text-4xl">
                {profile?.full_name || 'Bienvenue'}
              </h1>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-neutral-600">
                {profile?.phone && <span>📞 {profile.phone}</span>}
                {profile?.email && <span>✉ {profile.email}</span>}
                {ROLE_LABEL[profile?.role ?? ''] && <span className="rounded-full bg-neutral-200 px-2.5 py-0.5 text-xs font-bold text-neutral-800">{ROLE_LABEL[profile?.role ?? '']}</span>}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/"
              className="rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:border-neutral-400 "
            >
              ← Accueil
            </Link>
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              className="rounded-full border border-red-500/30 bg-red-500/5 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-500/10 disabled:opacity-50 "
            >
              {signingOut ? 'Déconnexion…' : 'Se déconnecter'}
            </button>
          </div>
        </header>

        {/* ═══════════ MON ESPACE (raccourcis) ═══════════ */}
        <section aria-labelledby="acc-shortcuts" className="mb-12">
          <h2 id="acc-shortcuts" className="mb-4 text-xs font-bold uppercase tracking-wider text-neutral-600">Mon espace</h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {shortcuts.map((t) => (
              <li key={t.href}>
                <Link href={t.href} className="group flex h-full flex-col gap-1 rounded-2xl border border-neutral-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-primary-500 hover:shadow-md">
                  <span aria-hidden className="text-2xl">{t.icon}</span>
                  <span className="font-display text-base font-bold text-dark group-hover:text-primary-700">{t.label}</span>
                  <span className="text-xs text-neutral-600">{t.hint}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* ═══════════ ABONNEMENT COURANT ═══════════ */}
        <section className="mb-12">
          <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-neutral-600">
            Abonnement actuel
          </h2>

          <div className="overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-sm ">
            {/* Ribbon plan */}
            {currentPlan && (
              <div className={`bg-gradient-to-r ${PLAN_STYLES[currentPlan.code].ribbon} px-6 py-5 sm:px-8 sm:py-6`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className={`text-xs font-bold uppercase tracking-wider ${PLAN_STYLES[currentPlan.code].accent}`}>
                      Plan {currentPlan.code === 'soutra_premium' ? 'Prestige' : currentPlan.code === 'free' ? 'Découverte' : 'Premium'}
                    </p>
                    <h3 className={`mt-1 font-display text-3xl font-black tracking-tight ${PLAN_STYLES[currentPlan.code].text}`}>
                      {currentPlan.display_name}
                    </h3>
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
                      <div className="text-sm text-amber-700 ">
                        <strong>Résiliation programmée.</strong> Ton abonnement {currentPlan?.display_name} reste actif jusqu&apos;au{' '}
                        <strong>{formatDate(currentSub.current_period_end)}</strong>, puis basculera sur le plan Free.
                      </div>
                    </div>
                  )}

                  {currentSub.status === 'past_due' && (
                    <div className="mt-6 flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/5 p-4">
                      <span className="text-xl">⚠️</span>
                      <div className="text-sm text-red-700 ">
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
                        className="rounded-2xl border border-red-500/40 bg-red-500/5 px-5 py-2.5 text-sm font-bold text-red-700 transition hover:bg-red-500/10 "
                      >
                        Résilier
                      </button>
                    )}
                    {currentSub.cancel_at_period_end && (
                      <Link
                        href="/subscribe"
                        className="rounded-2xl border border-emerald-500/40 bg-emerald-500/5 px-5 py-2.5 text-sm font-bold text-emerald-700 transition hover:bg-emerald-500/10 "
                      >
                        Réactiver mon abonnement
                      </Link>
                    )}
                  </div>

                  {/* Auto-renouvellement (migration 0052) — visible uniquement
                      pour les plans payants non résiliés. */}
                  {currentSub.plan_code !== 'free' && !currentSub.cancel_at_period_end && (
                    <AutoRenewBlock
                      sub={currentSub}
                      localValue={autoRenewLocal}
                      saving={savingRenew}
                      onChange={handleToggleAutoRenew}
                    />
                  )}
                </>
              ) : (
                <div className="py-6 text-center">
                  <p className="text-sm text-neutral-600 ">
                    Tu utilises actuellement le <strong>plan Free</strong>. Découvre les avantages Premium :
                    accès VVIP, concierge dédié.
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

        {/* ═══════════ FIDÉLITÉ ═══════════ */}
        {loyaltyStats?.ok && (
          <section className="mb-12">
            <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-neutral-600">
              Fidélité
            </h2>
            <div className="overflow-hidden rounded-3xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-white to-amber-500/5 ">
              <div className="grid grid-cols-1 gap-px bg-amber-500/10 sm:grid-cols-3">
                {/* Solde de points */}
                <div className="bg-white p-6 ">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700 ">
                    Solde de points
                  </p>
                  <p className="mt-2 font-display text-3xl font-black tracking-tight text-neutral-900 ">
                    {loyaltyStats.points_balance.toLocaleString('fr-FR')} pts
                  </p>
                  <p className="mt-1 text-xs text-neutral-600">
                    {loyaltyStats.points_lifetime.toLocaleString('fr-FR')} pts gagnés au total
                  </p>
                </div>

                {/* Sur 30j */}
                <div className="bg-white p-6 ">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-600">
                    {loyaltyStats.window_days} derniers jours
                  </p>
                  <p className="mt-2 font-display text-3xl font-black tracking-tight text-neutral-900 ">
                    {loyaltyStats.period_points.toLocaleString('fr-FR')} pts
                  </p>
                  <p className="mt-1 text-xs text-neutral-600">
                    {loyaltyStats.period_count} gain{loyaltyStats.period_count > 1 ? 's' : ''}
                  </p>
                </div>

                {/* Niveau */}
                <div className="bg-white p-6 ">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-600">
                    Ton niveau
                  </p>
                  <p className="mt-2 font-display text-3xl font-black tracking-tight text-amber-700 ">
                    {loyaltyStats.level.emoji} {loyaltyStats.level.label}
                  </p>
                  <p className="mt-1 text-xs text-neutral-600">
                    {loyaltyStats.next_level ? (
                      <>{loyaltyStats.next_level.points_remaining.toLocaleString('fr-FR')} pts avant {loyaltyStats.next_level.label}</>
                    ) : (
                      <>Niveau maximum atteint 🎉</>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-amber-500/10 bg-white/40 px-6 py-3 text-xs text-neutral-600 ">
                <span>🏆 Échange tes points contre des récompenses partenaires.</span>
                <Link href="/loyalty" className="font-bold text-primary-600 hover:underline">
                  Voir le programme →
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* Historiques : repliés par défaut (rarement consultés) */}
        <details className="group mb-12 rounded-2xl border border-neutral-200 bg-white open:shadow-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 font-display text-base font-bold marker:hidden">
            <span>Historique des paiements et abonnements</span>
            <span aria-hidden className="text-neutral-600 transition group-open:rotate-180">⌄</span>
          </summary>
          <div className="border-t border-neutral-200 px-5 pb-2 pt-6">
        
        <section className="mb-8">
          <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-neutral-600">
            Historique des paiements ({transactionHistory.length})
          </h2>
          <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white ">
            {transactionHistory.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-neutral-600">
                Aucune transaction Premium pour l&apos;instant.
              </div>
            ) : (
              <ul className="divide-y divide-neutral-100 ">
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
                            <span className="ml-2 text-xs font-normal text-neutral-600">
                              ({billingPeriod === 'monthly' ? 'Mensuel' : 'Annuel'})
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 text-xs text-neutral-600">
                          {formatDateTime(tx.created_at)}
                          {tx.provider_ref && (
                            <span className="ml-2 font-mono text-[10px] text-neutral-600">
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
                      {/* Facture PDF — visible uniquement pour les paiements
                          réussis (les autres n'ont pas de facture légitime). */}
                      {tx.status === 'success' && tx.provider_ref && (
                        <Link
                          href={`/account/invoice/${encodeURIComponent(tx.provider_ref)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Télécharger la facture PDF"
                          title="Télécharger la facture PDF"
                          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-600 transition hover:border-primary-500/40 hover:bg-primary-500/5 hover:text-primary-600 "
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                          </svg>
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        
        {subscriptionHistory.length > 1 && (
          <section className="mb-8">
            <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-neutral-600">
              Historique des abonnements ({subscriptionHistory.length})
            </h2>
            <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white ">
              <ul className="divide-y divide-neutral-100 ">
                {subscriptionHistory.map((sub) => {
                  const plan = plansByCode.get(sub.plan_code);
                  return (
                    <li key={sub.id} className="flex flex-wrap items-center gap-3 px-5 py-4 sm:px-6">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">
                          {plan?.display_name || sub.plan_code}
                          <span className="ml-2 text-xs font-normal text-neutral-600">
                            ({sub.billing_period === 'monthly' ? 'Mensuel' : 'Annuel'})
                          </span>
                        </p>
                        <p className="mt-0.5 text-xs text-neutral-600">
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

          </div>
        </details>

        {/* ═══════════ APPARENCE ═══════════ */}
        <section aria-labelledby="acc-theme" className="mb-12">
          <h2 id="acc-theme" className="mb-4 text-xs font-bold uppercase tracking-wider text-neutral-600">Apparence</h2>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white p-4">
            <p className="text-sm text-neutral-700">Clair, sombre, ou selon le réglage de votre appareil.</p>
            <ThemeSelect />
          </div>
        </section>

        {/* ═══════════ INFOS COMPTE ═══════════ */}
        <section>
          <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-neutral-600">
            Informations du compte
          </h2>
          <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white ">
            <dl className="divide-y divide-neutral-100 ">
              <Row label="Nom complet" value={profile?.full_name || '—'} />
              <Row label="Téléphone" value={profile?.phone || '—'} mono />
              <Row label="Email" value={profile?.email || '—'} />
              <Row label="Rôle" value={
                <span className="capitalize">{(profile?.role || 'user').replace('_', ' ')}</span>
              } />
              <Row
                label="KYC"
                value={
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${ profile?.kyc_status === 'verified'
                      ? 'bg-emerald-500/15 text-emerald-700 '
                      : profile?.kyc_status === 'pending'
                      ? 'bg-amber-500/15 text-amber-700 '
                      : profile?.kyc_status === 'rejected'
                      ? 'bg-red-500/15 text-red-700 '
                      : 'bg-neutral-500/15 text-neutral-600 '
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
          className="fixed inset-0 z-[200] flex items-end justify-center overflow-hidden bg-neutral-900/70 backdrop-blur-md sm:items-center sm:p-4"
          onClick={() => !cancelling && setConfirmOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="animate-sheet-slide-up max-h-[100dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-3xl border border-neutral-200 bg-white p-6 shadow-2xl sm:max-h-[90vh] sm:rounded-3xl sm:p-8"
          >
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-neutral-300 sm:hidden" />
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 text-3xl text-red-500">
              ⚠
            </div>
            <h3 className="text-center font-display text-xl font-black">Résilier l&apos;abonnement ?</h3>
            <p className="mt-3 text-center text-sm text-neutral-600 ">
              Ton abonnement <strong>{currentPlan.display_name}</strong> restera actif jusqu&apos;au{' '}
              <strong>{formatDate(currentSub.current_period_end)}</strong>. Tu pourras le réactiver à tout moment d&apos;ici là.
            </p>
            <p className="mt-2 text-center text-xs text-neutral-600">
              Pas de remboursement immédiat — tu profites de ce que tu as payé jusqu&apos;à la fin de la période.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                onClick={() => setConfirmOpen(false)}
                disabled={cancelling}
                className="rounded-2xl border border-neutral-300 bg-white px-5 py-3 text-sm font-bold text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-50 "
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

/**
 * Bloc "Renouvellement automatique" (migration 0052).
 *
 * Affiche un toggle si une carte est tokenisée (last_authorization_code
 * présent). Sinon (paiement mobile money via Paystack ou flux stub initial),
 * explique pourquoi l'auto-renouvellement n'est pas dispo.
 */
function AutoRenewBlock({
  sub,
  localValue,
  saving,
  onChange,
}: {
  sub: Subscription;
  localValue: boolean | null;
  saving: boolean;
  onChange: (next: boolean) => void;
}) {
  const hasAuthorization = !!sub.last_authorization_code;
  // L'état effectif : optimiste si défini, sinon la valeur server (default true).
  const enabled = localValue ?? sub.auto_renew ?? true;

  if (!hasAuthorization) {
    return (
      <div className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50/60 p-4 ">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-neutral-200/60 ">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-600">
              <path d="M21 4H3a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
              <line x1="1" y1="10" x2="23" y2="10" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-neutral-700 ">
              Renouvellement automatique
            </p>
            <p className="mt-1 text-xs text-neutral-600 ">
              Disponible uniquement pour les paiements par carte. Avec Mobile
              Money, tu reçois un rappel à J-7 et J-1 pour renouveler en 1 clic.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-4 ">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${ enabled ? 'bg-emerald-500/15 text-emerald-700 ' : 'bg-neutral-200 text-neutral-600 '
          }`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-neutral-800 ">
              Renouvellement automatique
            </p>
            <p className="mt-1 text-xs text-neutral-600 ">
              {enabled ? (
                <>Sera prélevé le {formatDate(sub.current_period_end)} sur ta carte</>
              ) : (
                <>Tu devras renouveler manuellement</>
              )}
              {sub.last_card_brand && sub.last_card_last4 && (
                <> · <strong className="text-neutral-700 capitalize">{sub.last_card_brand}</strong> •••• {sub.last_card_last4}</>
              )}
            </p>
            {sub.last_renew_outcome && sub.last_renew_outcome !== 'success' && (
              <p className="mt-1 text-xs text-amber-700 ">
                Dernière tentative : {sub.last_renew_outcome}
              </p>
            )}
          </div>
        </div>
        {/* Switch toggle natif accessible */}
        <button
          role="switch"
          aria-checked={enabled}
          disabled={saving}
          onClick={() => onChange(!enabled)}
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition disabled:opacity-50 ${ enabled ? 'bg-emerald-500' : 'bg-neutral-300 '
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform ${ enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
    </div>
  );
}

function StatBlock({
  label, value, sub,
}: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-600">{label}</p>
      <div className="mt-1.5">{value}</div>
      {sub && <p className="mt-0.5 text-[11px] text-neutral-600">{sub}</p>}
    </div>
  );
}

function Row({
  label, value, mono = false,
}: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 sm:px-6">
      <dt className="text-sm text-neutral-600 ">{label}</dt>
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


function daysUntil(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (days < 0) return `Expiré il y a ${-days} j`;
  if (days === 0) return 'Aujourd\'hui';
  if (days === 1) return 'Demain';
  if (days < 30) return `Dans ${days} jours`;
  return `Dans ${Math.round(days / 30)} mois`;
}
