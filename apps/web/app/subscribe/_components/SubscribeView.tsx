'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase';

/* ─────────────────────────────────────────────────── *
 *  TYPES                                              *
 * ─────────────────────────────────────────────────── */

type AccentColor =
  | 'neutral'      // Free
  | 'orange'       // Standard (couleurs Soutra-Playce)
  | 'blue-purple'  // Pro
  | 'purple-gold'  // Premium
  | 'black-gold';  // Soutra Premium

interface Plan {
  code: 'free' | 'standard' | 'pro' | 'premium' | 'soutra_premium';
  display_name: string;
  tagline: string | null;
  price_monthly_xof: number;
  price_yearly_xof: number;
  cashback_bps: number;
  display_order: number;
  is_recommended: boolean;
  is_prestige: boolean;
  features: string[];
  cta_label: string;
  accent_color: AccentColor;
}

type BillingPeriod = 'monthly' | 'yearly';

interface CurrentSub {
  subscription: { id: string; plan_code: string; status: string } | null;
  plan: Plan | null;
}

/* ─────────────────────────────────────────────────── *
 *  TRACKING (session anon ou user authenticated)      *
 * ─────────────────────────────────────────────────── */

function getSessionId(): string {
  if (typeof window === 'undefined') return '';
  let sid = window.localStorage.getItem('soutra_sub_sid');
  if (!sid) {
    sid = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem('soutra_sub_sid', sid);
  }
  return sid;
}

/* ─────────────────────────────────────────────────── *
 *  COMPARATIF — source de vérité front (matrice)      *
 * ─────────────────────────────────────────────────── */

type CompareCell = boolean | string;
interface CompareRow {
  feature: string;
  values: Record<Plan['code'], CompareCell>;
}
const COMPARE_ROWS: CompareRow[] = [
  {
    feature: 'Cashback',
    values: {
      free: '1 %',
      standard: '1 %',
      pro: '2 %',
      premium: '3 %',
      soutra_premium: '5 %',
    },
  },
  {
    feature: 'Notifications prioritaires',
    values: { free: false, standard: true, pro: true, premium: true, soutra_premium: true },
  },
  {
    feature: 'Sans publicité',
    values: { free: false, standard: false, pro: true, premium: true, soutra_premium: true },
  },
  {
    feature: 'Concierge IA Sia',
    values: {
      free: false, standard: false,
      pro: 'Illimité', premium: 'Illimité', soutra_premium: 'Illimité',
    },
  },
  {
    feature: 'Voix Premium Sia',
    values: { free: false, standard: false, pro: false, premium: true, soutra_premium: true },
  },
  {
    feature: 'Accès VVIP',
    values: { free: false, standard: false, pro: false, premium: true, soutra_premium: true },
  },
  {
    feature: 'Concierge humain',
    values: { free: false, standard: false, pro: false, premium: false, soutra_premium: true },
  },
];

/* ─────────────────────────────────────────────────── *
 *  MAIN VIEW                                          *
 * ─────────────────────────────────────────────────── */

export function SubscribeView({
  plans,
  currentSubscription,
}: {
  plans: Plan[];
  currentSubscription: CurrentSub | null;
}) {
  const router = useRouter();
  const sb = supabaseBrowser();
  const [billing, setBilling] = useState<BillingPeriod>('monthly');
  const [modalPlan, setModalPlan] = useState<Plan | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const sidRef = useRef<string>('');
  if (typeof window !== 'undefined' && !sidRef.current) {
    sidRef.current = getSessionId();
  }

  // Tracking : page view au mount (une seule fois par session)
  const viewedRef = useRef(false);
  useEffect(() => {
    if (viewedRef.current) return;
    viewedRef.current = true;
    (sb.rpc as any)('track_subscription_event', {
      p_kind: 'plan_view',
      p_plan_code: null,
      p_metadata: { page: '/subscribe', referrer: typeof document !== 'undefined' ? document.referrer || null : null },
      p_session_id: sidRef.current,
    }).then(({ error }: any) => {
      if (error) console.warn('[subscribe] track view:', error.message);
    });

    // Toast au retour du callback (success / failed / pending). L'URL
    // contient ?status=… ajouté par /geniuspay/callback (PR #3) ou par
    // /paystack/callback (subs legacy pré-migration).
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const status = params.get('status');
      if (status === 'success') {
        setToast({ msg: 'Abonnement activé ✨', ok: true });
        window.setTimeout(() => setToast(null), 4000);
        // Nettoie l'URL pour ne pas re-afficher au reload.
        window.history.replaceState({}, '', '/subscribe');
        router.refresh();
      } else if (status === 'failed') {
        setToast({ msg: 'Paiement non validé. Réessaye quand tu veux.', ok: false });
        window.setTimeout(() => setToast(null), 4000);
        window.history.replaceState({}, '', '/subscribe');
      } else if (status === 'pending') {
        setToast({ msg: 'Paiement en cours de validation… rafraîchis dans 1 min.', ok: true });
        window.setTimeout(() => setToast(null), 5000);
        window.history.replaceState({}, '', '/subscribe');
      }
    }
  }, [sb, router]);

  const flash = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok });
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  const trackClick = useCallback((plan: Plan) => {
    (sb.rpc as any)('track_subscription_event', {
      p_kind: 'plan_click',
      p_plan_code: plan.code,
      p_metadata: { billing_period: billing, price: billing === 'monthly' ? plan.price_monthly_xof : plan.price_yearly_xof },
      p_session_id: sidRef.current,
    });
  }, [sb, billing]);

  const onChoose = useCallback((plan: Plan) => {
    trackClick(plan);
    // Redirection directe vers GeniusPay (ou activation Free sans modal).
    // GeniusPay affiche déjà la sélection complète des moyens de paiement sur
    // sa page checkout, donc la modal intermédiaire n'apporte rien.
    handleSubscribeStub(plan);
  }, [trackClick]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubscribeStub = useCallback(async (plan: Plan) => {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      flash('Connecte-toi pour souscrire', false);
      router.push('/login');
      return;
    }
    // Edge Function geniuspay-subscribe :
    //   • plan free → insert direct subscription, retourne {free: true}
    //   • plan payant → crée tx pending + retourne checkout_url GeniusPay
    const { data, error } = await (sb.functions as any).invoke('geniuspay-subscribe', {
      body: { plan_code: plan.code, billing_period: billing },
    });

    if (error) {
      flash(error.message || 'Souscription impossible', false);
      return;
    }
    const result = data as {
      ok: boolean;
      free: boolean;
      checkout_url: string | null;
      redirect_url?: string;
    };

    if (result.free) {
      flash(`Abonnement ${plan.display_name} activé ✨`);
      setModalPlan(null);
      router.refresh();
      return;
    }
    if (result.checkout_url) {
      // Redirection vers GeniusPay — l'user paie sur leur UI (carte ou
      // mobile money). Au retour, /geniuspay/callback nous reprend et
      // redirige vers /subscribe?status=… avec toast.
      window.location.href = result.checkout_url;
      return;
    }
    flash('Réponse inattendue du fournisseur de paiement', false);
  }, [sb, billing, flash, router]);

  const currentPlanCode = currentSubscription?.plan?.code ?? 'free';

  // Tri défensif côté front : la DB est censée déjà ordonner mais on
  // garantit l'ordre Free → Standard → Pro → Premium → Soutra Premium.
  const sortedPlans = useMemo(() => {
    return [...plans].sort((a, b) => a.display_order - b.display_order);
  }, [plans]);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-white">
      {/* Glow background — premium fintech */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 left-1/2 h-[600px] w-[1000px] -translate-x-1/2 rounded-full bg-gradient-to-br from-primary-500/20 via-purple-500/15 to-amber-500/10 blur-[120px]" />
        <div className="absolute -bottom-32 right-10 h-[400px] w-[400px] rounded-full bg-purple-500/10 blur-[100px]" />
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed left-1/2 top-6 z-[100] flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold shadow-2xl backdrop-blur-xl ${
            toast.ok
              ? 'bg-emerald-500/95 text-white'
              : 'bg-red-500/95 text-white'
          }`}
        >
          <span>{toast.ok ? '✓' : '⚠'}</span>
          <span>{toast.msg}</span>
        </div>
      )}

      <main className="relative mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-24">

        {/* Bandeau "Mon abonnement" — visible si l'user a déjà un abo actif */}
        {currentSubscription?.subscription && (
          <div className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary-500/30 bg-primary-500/5 px-5 py-3 backdrop-blur-xl">
            <p className="text-sm text-neutral-700 dark:text-neutral-300">
              Tu es abonné à{' '}
              <strong className="text-neutral-900 dark:text-white">
                {currentSubscription.plan?.display_name || currentPlanCode}
              </strong>
            </p>
            <Link
              href="/account"
              className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-bold text-neutral-900 shadow-sm transition hover:bg-neutral-100 dark:bg-neutral-900 dark:text-white dark:hover:bg-neutral-800"
            >
              Gérer mon abonnement
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
          </div>
        )}

        {/* ═══════════ HERO ═══════════ */}
        <section className="mx-auto max-w-3xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary-500/30 bg-primary-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-primary-600 dark:text-primary-400">
            <span className="h-1.5 w-1.5 animate-glow-pulse rounded-full bg-primary-500" />
            Premium Soutra-Playce
          </div>
          <h1 className="font-display text-3xl font-black leading-tight tracking-tight sm:text-5xl lg:text-6xl">
            Choisissez votre expérience{' '}
            <span className="bg-gradient-to-r from-primary-500 via-purple-500 to-amber-500 bg-clip-text text-transparent">
              Soutra-Playce
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-neutral-600 dark:text-neutral-400 sm:text-lg">
            Profitez de cashback, d&apos;avantages exclusifs et d&apos;une expérience personnalisée adaptée à votre style de vie.
          </p>

          {/* Billing toggle */}
          <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white/80 p-1.5 shadow-sm backdrop-blur-xl dark:border-neutral-800 dark:bg-neutral-900/80">
            <BillingToggle value={billing} onChange={setBilling} />
          </div>
        </section>

        {/* ═══════════ PLAN GRID ═══════════ */}
        <section className="mt-12 sm:mt-16">
          {/* Grille responsive : 1 col mobile, 2 cols tablet, 5 cols desktop xl */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {sortedPlans.map((plan) => (
              <PlanCard
                key={plan.code}
                plan={plan}
                billing={billing}
                isCurrent={currentPlanCode === plan.code}
                onChoose={() => onChoose(plan)}
              />
            ))}
          </div>
        </section>

        {/* ═══════════ CASHBACK SIMULATOR ═══════════ */}
        <section className="mt-20 sm:mt-28">
          <CashbackSimulator plans={sortedPlans} billing={billing} />
        </section>

        {/* ═══════════ COMPARISON TABLE ═══════════ */}
        <section className="mt-20 sm:mt-28">
          <ComparisonTable plans={sortedPlans} />
        </section>

        {/* ═══════════ FOOTER NOTE ═══════════ */}
        <section className="mt-20 sm:mt-28">
          <div className="rounded-3xl border border-neutral-200 bg-white/60 p-8 text-center backdrop-blur-xl dark:border-neutral-800 dark:bg-neutral-900/60">
            <h3 className="font-display text-xl font-bold sm:text-2xl">
              Une question avant de souscrire ?
            </h3>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              Notre équipe te répond en moins de 2 heures.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <a
                href="mailto:support@soutra-paiya.com"
                className="rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
              >
                Nous contacter
              </a>
              <a
                href="tel:+2250708817409"
                className="rounded-full border border-neutral-300 bg-white px-5 py-2.5 text-sm font-semibold text-neutral-900 transition hover:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:hover:border-neutral-600"
              >
                Appeler le support
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* ═══════════ MODAL PAIEMENT (stub) ═══════════ */}
      {modalPlan && (
        <SubscribeModal
          plan={modalPlan}
          billing={billing}
          onClose={() => {
            (sb.rpc as any)('track_subscription_event', {
              p_kind: 'subscribe_abandon',
              p_plan_code: modalPlan.code,
              p_metadata: { billing_period: billing },
              p_session_id: sidRef.current,
            });
            setModalPlan(null);
          }}
          onConfirm={() => handleSubscribeStub(modalPlan)}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────── *
 *  SUB-COMPONENTS                                     *
 * ─────────────────────────────────────────────────── */

function BillingToggle({
  value, onChange,
}: { value: BillingPeriod; onChange: (v: BillingPeriod) => void }) {
  return (
    <>
      <button
        onClick={() => onChange('monthly')}
        className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
          value === 'monthly'
            ? 'bg-neutral-900 text-white shadow-md dark:bg-white dark:text-neutral-900'
            : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
        }`}
      >
        Mensuel
      </button>
      <button
        onClick={() => onChange('yearly')}
        className={`relative rounded-full px-4 py-2 text-sm font-semibold transition ${
          value === 'yearly'
            ? 'bg-neutral-900 text-white shadow-md dark:bg-white dark:text-neutral-900'
            : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
        }`}
      >
        Annuel
        <span className="ml-1.5 inline-flex items-center rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
          −2 mois
        </span>
      </button>
    </>
  );
}

function PlanCard({
  plan, billing, isCurrent, onChoose,
}: {
  plan: Plan;
  billing: BillingPeriod;
  isCurrent: boolean;
  onChoose: () => void;
}) {
  const price = billing === 'monthly' ? plan.price_monthly_xof : plan.price_yearly_xof;
  const monthlyEq = billing === 'yearly' ? Math.round(price / 12) : price;
  const cashbackPct = (plan.cashback_bps / 100).toFixed(plan.cashback_bps % 100 === 0 ? 0 : 1);

  const style = getCardStyle(plan.accent_color);

  return (
    <article
      className={`group relative flex flex-col overflow-hidden rounded-3xl border p-6 transition-all duration-300 ${style.container} ${
        plan.is_recommended ? 'lg:scale-105 lg:shadow-2xl' : ''
      }`}
    >
      {/* Badges en haut */}
      {plan.is_recommended && (
        <div className="absolute -top-px left-1/2 -translate-x-1/2 rounded-b-2xl bg-gradient-to-r from-blue-500 to-purple-600 px-4 py-1 text-[11px] font-black uppercase tracking-wider text-white shadow-lg">
          🔥 Recommandé
        </div>
      )}
      {plan.is_prestige && (
        <div className="absolute -top-px left-1/2 -translate-x-1/2 rounded-b-2xl bg-gradient-to-r from-amber-500 to-amber-300 px-4 py-1 text-[11px] font-black uppercase tracking-wider text-neutral-900 shadow-lg">
          👑 Offre Prestige
        </div>
      )}

      {/* Decoration top — icon + nom */}
      <div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl ${style.iconBg}`}>
        <PlanIcon code={plan.code} className={`h-6 w-6 ${style.iconColor}`} />
      </div>
      <div className="mb-1 flex items-center gap-2">
        <h3 className={`font-display text-2xl font-black tracking-tight ${style.title}`}>
          {plan.display_name}
        </h3>
      </div>
      {plan.tagline && (
        <p className={`text-sm ${style.tagline}`}>{plan.tagline}</p>
      )}

      {/* Cashback badge */}
      <div className={`mt-4 inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${style.cashbackBadge}`}>
        <span>💰</span>
        Cashback {cashbackPct} %
      </div>

      {/* Prix */}
      <div className="mt-6 flex items-baseline gap-1">
        <span className={`font-display text-4xl font-black tracking-tight ${style.price}`}>
          {price === 0 ? 'Gratuit' : formatXOF(price)}
        </span>
        {price > 0 && (
          <span className={`text-sm ${style.priceUnit}`}>
            /{billing === 'monthly' ? 'mois' : 'an'}
          </span>
        )}
      </div>
      {billing === 'yearly' && price > 0 && (
        <p className={`mt-1 text-xs ${style.priceUnit}`}>
          soit {formatXOF(monthlyEq)} / mois
        </p>
      )}

      {/* Features */}
      <ul className="mt-6 flex-1 space-y-3">
        {plan.features.map((feat, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm">
            <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${style.checkBg}`}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className={style.checkIcon}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
            <span className={style.featureText}>{feat}</span>
          </li>
        ))}
      </ul>

      {/* CTA */}
      <button
        onClick={onChoose}
        disabled={isCurrent}
        className={`mt-8 rounded-2xl px-5 py-3.5 text-sm font-bold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${style.cta}`}
      >
        {isCurrent ? 'Plan actuel' : plan.cta_label}
      </button>
    </article>
  );
}

function PlanIcon({ code, className }: { code: Plan['code']; className?: string }) {
  // Icônes SVG inline — pas de dépendance. Une par plan, choisies pour
  // signaler la progression (étincelle → boussole → éclair → étoile → couronne).
  const path: Record<Plan['code'], React.ReactElement> = {
    free: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M8 14s1.5 2 4 2 4-2 4-2" />
        <line x1="9" y1="9" x2="9.01" y2="9" />
        <line x1="15" y1="9" x2="15.01" y2="9" />
      </svg>
    ),
    standard: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
      </svg>
    ),
    pro: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
    premium: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
    soutra_premium: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 19l3-12 5 4 4-7 5 7 5-4-3 12H2z" />
        <line x1="2" y1="22" x2="22" y2="22" />
      </svg>
    ),
  };
  return <span className={className}>{path[code]}</span>;
}

function CashbackSimulator({ plans, billing }: { plans: Plan[]; billing: BillingPeriod }) {
  const [monthly, setMonthly] = useState<number>(50000);
  const sb = supabaseBrowser();
  const sidRef = useRef<string>('');
  if (typeof window !== 'undefined' && !sidRef.current) {
    sidRef.current = getSessionId();
  }

  // Tracking dépenses simulées (avec debounce simple via useEffect)
  useEffect(() => {
    const t = window.setTimeout(() => {
      (sb.rpc as any)('track_subscription_event', {
        p_kind: 'plan_view',
        p_plan_code: null,
        p_metadata: { simulator_amount_xof: monthly },
        p_session_id: sidRef.current,
      });
    }, 1500);
    return () => window.clearTimeout(t);
  }, [monthly, sb]);

  return (
    <div className="overflow-hidden rounded-3xl border border-neutral-200 bg-white/80 backdrop-blur-xl dark:border-neutral-800 dark:bg-neutral-900/80">
      <div className="border-b border-neutral-200 bg-gradient-to-br from-primary-500/10 via-transparent to-purple-500/10 p-6 dark:border-neutral-800 sm:p-8">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-primary-600 dark:text-primary-400">Simulateur</p>
            <h2 className="mt-2 font-display text-2xl font-black tracking-tight sm:text-3xl">
              Estime tes économies
            </h2>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              Selon tes dépenses mensuelles avec Soutra-Playce.
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Période</p>
            <p className="mt-0.5 text-sm font-bold capitalize">{billing === 'monthly' ? 'Mensuelle' : 'Annuelle'}</p>
          </div>
        </div>
      </div>

      <div className="p-6 sm:p-8">
        <label className="block">
          <span className="block text-sm font-semibold text-neutral-700 dark:text-neutral-300">
            Combien dépenses-tu chaque mois ?
          </span>
          <div className="mt-3 flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3 shadow-sm focus-within:border-primary-500 dark:border-neutral-700 dark:bg-neutral-950">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={100000000}
              step={1000}
              value={monthly}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n) && n >= 0) setMonthly(n);
              }}
              className="w-full bg-transparent font-mono text-2xl font-bold text-neutral-900 outline-none placeholder:text-neutral-400 dark:text-white sm:text-3xl"
              placeholder="50 000"
              aria-label="Montant dépensé en FCFA chaque mois"
            />
            <span className="shrink-0 text-sm font-semibold text-neutral-500 dark:text-neutral-400">FCFA / mois</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {[20000, 50000, 100000, 250000, 500000].map((preset) => (
              <button
                key={preset}
                onClick={() => setMonthly(preset)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  monthly === preset
                    ? 'border-primary-500 bg-primary-500/10 text-primary-600 dark:text-primary-400'
                    : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400'
                }`}
              >
                {formatXOF(preset)}
              </button>
            ))}
          </div>
        </label>

        {/* Résultats par plan */}
        <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {plans.map((p) => {
            const cashbackMonthly = Math.round((monthly * p.cashback_bps) / 10000);
            const cashbackYearly = cashbackMonthly * 12;
            const planCost = billing === 'monthly' ? p.price_monthly_xof : p.price_yearly_xof;
            const planCostMonthly = billing === 'yearly' ? Math.round(planCost / 12) : planCost;
            const netMonthly = cashbackMonthly - planCostMonthly;
            const netPositive = netMonthly >= 0;
            const tone = getCardStyle(p.accent_color);

            return (
              <div
                key={p.code}
                className={`rounded-2xl border p-4 transition ${tone.simulatorBorder} ${p.is_recommended ? 'ring-2 ring-blue-500/40' : ''}`}
              >
                <p className={`text-[11px] font-bold uppercase tracking-wider ${tone.simulatorAccent}`}>
                  {p.display_name}
                </p>
                <p className="mt-3 font-display text-xl font-black tracking-tight text-neutral-900 dark:text-white">
                  {formatXOF(cashbackMonthly)}
                </p>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400">cashback / mois</p>
                <div className="mt-3 border-t border-neutral-200 pt-3 dark:border-neutral-800">
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Soit <strong className="text-neutral-900 dark:text-white">{formatXOF(cashbackYearly)}</strong> / an
                  </p>
                  {planCostMonthly > 0 && (
                    <p className={`mt-1 text-xs font-semibold ${netPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                      Net {netPositive ? '+' : ''}{formatXOF(netMonthly)} / mois
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-6 text-xs text-neutral-500 dark:text-neutral-500">
          ⓘ Estimation basée sur le taux de cashback de chaque plan, appliqué au montant indiqué. Les frais Mobile Money et plafonds Soutra-Playce ne sont pas inclus.
        </p>
      </div>
    </div>
  );
}

function ComparisonTable({ plans }: { plans: Plan[] }) {
  return (
    <div className="overflow-hidden rounded-3xl border border-neutral-200 bg-white/80 backdrop-blur-xl dark:border-neutral-800 dark:bg-neutral-900/80">
      <div className="border-b border-neutral-200 p-6 dark:border-neutral-800 sm:p-8">
        <p className="text-xs font-bold uppercase tracking-wider text-primary-600 dark:text-primary-400">Comparateur</p>
        <h2 className="mt-2 font-display text-2xl font-black tracking-tight sm:text-3xl">
          Tous les avantages en un coup d&apos;œil
        </h2>
      </div>

      {/* Scroll horizontal mobile, table full desktop */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50/50 dark:border-neutral-800 dark:bg-neutral-950/50">
              <th className="sticky left-0 z-10 bg-neutral-50/50 px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-neutral-500 dark:bg-neutral-950/50 dark:text-neutral-400">
                Fonctionnalité
              </th>
              {plans.map((p) => (
                <th
                  key={p.code}
                  className={`px-4 py-4 text-center text-xs font-bold uppercase tracking-wider ${
                    p.is_recommended
                      ? 'text-blue-600 dark:text-blue-400'
                      : p.is_prestige
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-neutral-700 dark:text-neutral-300'
                  }`}
                >
                  {p.display_name}
                  {p.is_recommended && <div className="mt-0.5 text-[9px] font-black text-blue-500">RECOMMANDÉ</div>}
                  {p.is_prestige && <div className="mt-0.5 text-[9px] font-black text-amber-500">PRESTIGE</div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPARE_ROWS.map((row, i) => (
              <tr
                key={row.feature}
                className={`border-b border-neutral-100 last:border-b-0 dark:border-neutral-800/50 ${
                  i % 2 === 1 ? 'bg-neutral-50/30 dark:bg-neutral-950/30' : ''
                }`}
              >
                <td className="sticky left-0 z-10 bg-inherit px-5 py-4 text-left font-medium text-neutral-900 dark:text-white">
                  {row.feature}
                </td>
                {plans.map((p) => {
                  const v = row.values[p.code];
                  return (
                    <td key={p.code} className="px-4 py-4 text-center text-neutral-700 dark:text-neutral-300">
                      <CompareValue value={v} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CompareValue({ value }: { value: CompareCell }) {
  if (typeof value === 'boolean') {
    return value ? (
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
    ) : (
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-neutral-200/60 text-neutral-400 dark:bg-neutral-800/60 dark:text-neutral-600">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </span>
    );
  }
  return <span className="font-bold">{value}</span>;
}

function SubscribeModal({
  plan, billing, onClose, onConfirm,
}: {
  plan: Plan;
  billing: BillingPeriod;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const price = billing === 'monthly' ? plan.price_monthly_xof : plan.price_yearly_xof;
  const sb = supabaseBrowser();
  const sidRef = useRef<string>('');
  if (typeof window !== 'undefined' && !sidRef.current) {
    sidRef.current = getSessionId();
  }
  const [provider, setProvider] = useState<string | null>(null);

  // Tracking : modal ouvert = subscribe_attempt
  const attemptedRef = useRef(false);
  useEffect(() => {
    if (attemptedRef.current) return;
    attemptedRef.current = true;
    (sb.rpc as any)('track_subscription_event', {
      p_kind: 'subscribe_attempt',
      p_plan_code: plan.code,
      p_metadata: { billing_period: billing, price },
      p_session_id: sidRef.current,
    });
  }, [sb, plan.code, billing, price]);

  // Liste des moyens de paiement affichés dans le modal. Le choix RÉEL se
  // fait sur la page Paystack — ici on guide visuellement l'utilisateur.
  //  • mobile = Orange / MTN / Wave : actifs en CI
  //  • card = Visa / Mastercard : actifs en CI
  //  • apple_pay / google_pay : exposés pour quand Paystack étendra le
  //    support à XOF. Pour l'instant Paystack les ignore en XOF — l'option
  //    s'affichera sur la page Paystack uniquement si supportée.
  const providers = [
    { id: 'orange', label: 'Orange Money', icon: '🟠', note: null },
    { id: 'mtn',    label: 'MTN Money',    icon: '🟡', note: null },
    { id: 'wave',   label: 'Wave',         icon: '🌊', note: null },
    { id: 'card',   label: 'Visa / Mastercard', icon: '💳', note: null },
    { id: 'apple',  label: 'Apple Pay',    icon: '', note: 'iPhone' },
    { id: 'gpay',   label: 'Google Pay',   icon: 'G', note: 'Android' },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[200] flex items-end justify-center overflow-hidden bg-neutral-900/70 backdrop-blur-md sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-slide-up flex max-h-[100dvh] w-full max-w-lg flex-col rounded-t-3xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-900 sm:max-h-[90vh] sm:rounded-3xl"
      >
        {/* Header — non scrollable */}
        <div className="flex-shrink-0 px-6 pt-6 sm:px-8 sm:pt-8">
          {/* Handle (mobile) */}
          <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-neutral-300 dark:bg-neutral-700 sm:hidden" />

          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-neutral-500">Souscription</p>
              <h3 className="mt-1 font-display text-2xl font-black tracking-tight text-neutral-900 dark:text-white">
                {plan.display_name}
              </h3>
              <p className="mt-0.5 text-sm text-neutral-600 dark:text-neutral-400">
                {formatXOF(price)} / {billing === 'monthly' ? 'mois' : 'an'}
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Fermer"
              className="rounded-full p-2 text-neutral-500 transition hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body scrollable */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5 sm:px-8">
        <div className="mt-0">
          <p className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
            Moyen de paiement
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            Tu choisiras précisément sur la page Paystack sécurisée à l&apos;étape suivante.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {providers.map((p) => (
              <button
                key={p.id}
                onClick={() => setProvider(p.id)}
                className={`flex items-center gap-2.5 rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${
                  provider === p.id
                    ? 'border-primary-500 bg-primary-500/10 text-primary-600 dark:text-primary-400'
                    : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300'
                }`}
              >
                <span className="text-lg leading-none">{p.icon}</span>
                <span className="min-w-0 flex-1 truncate">{p.label}</span>
                {p.note && (
                  <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                    {p.note}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-start gap-2.5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-amber-500">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p className="text-xs text-amber-700 dark:text-amber-300">
              <strong>Configuration en cours.</strong> Le paiement réel sera activé dans la prochaine mise à jour. Tu peux dès maintenant simuler la souscription pour découvrir l&apos;expérience.
            </p>
          </div>
        </div>

        </div>

        {/* Footer — non scrollable, sticky bottom */}
        <div
          className="flex flex-shrink-0 flex-col-reverse gap-2 border-t border-neutral-100 bg-white px-6 py-4 dark:border-neutral-800 dark:bg-neutral-900 sm:flex-row sm:justify-end sm:rounded-b-3xl sm:px-8 sm:py-5"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          <button
            onClick={onClose}
            className="rounded-2xl border border-neutral-300 bg-white px-5 py-3 text-sm font-bold text-neutral-700 transition hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            disabled={!provider}
            className="rounded-2xl bg-gradient-to-r from-primary-500 to-purple-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-primary-500/30 transition hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Confirmer la souscription
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────── *
 *  STYLE PALETTE — encapsule le look de chaque plan   *
 * ─────────────────────────────────────────────────── */

interface CardStyle {
  container: string;
  title: string;
  tagline: string;
  iconBg: string;
  iconColor: string;
  cashbackBadge: string;
  price: string;
  priceUnit: string;
  checkBg: string;
  checkIcon: string;
  featureText: string;
  cta: string;
  simulatorBorder: string;
  simulatorAccent: string;
}

function getCardStyle(accent: AccentColor): CardStyle {
  switch (accent) {
    case 'neutral':
      return {
        container: 'border-neutral-200 bg-white/90 dark:border-neutral-800 dark:bg-neutral-900/80',
        title: 'text-neutral-900 dark:text-white',
        tagline: 'text-neutral-500 dark:text-neutral-500',
        iconBg: 'bg-neutral-100 dark:bg-neutral-800',
        iconColor: 'text-neutral-700 dark:text-neutral-300',
        cashbackBadge: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
        price: 'text-neutral-900 dark:text-white',
        priceUnit: 'text-neutral-500 dark:text-neutral-500',
        checkBg: 'bg-neutral-200 dark:bg-neutral-700',
        checkIcon: 'text-neutral-700 dark:text-neutral-300',
        featureText: 'text-neutral-700 dark:text-neutral-300',
        cta: 'bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200',
        simulatorBorder: 'border-neutral-200 dark:border-neutral-800',
        simulatorAccent: 'text-neutral-600 dark:text-neutral-400',
      };
    case 'orange':
      return {
        container: 'border-primary-500/30 bg-gradient-to-br from-primary-500/5 via-white to-amber-500/5 dark:from-primary-500/10 dark:via-neutral-900/80 dark:to-amber-500/5',
        title: 'text-neutral-900 dark:text-white',
        tagline: 'text-primary-600 dark:text-primary-400',
        iconBg: 'bg-primary-500/15',
        iconColor: 'text-primary-600 dark:text-primary-400',
        cashbackBadge: 'bg-primary-500/15 text-primary-700 dark:text-primary-300',
        price: 'text-neutral-900 dark:text-white',
        priceUnit: 'text-neutral-500 dark:text-neutral-500',
        checkBg: 'bg-primary-500/15',
        checkIcon: 'text-primary-600 dark:text-primary-400',
        featureText: 'text-neutral-700 dark:text-neutral-200',
        cta: 'bg-gradient-to-r from-primary-500 to-amber-500 text-white shadow-lg shadow-primary-500/30 hover:opacity-90',
        simulatorBorder: 'border-primary-500/30 dark:border-primary-500/30',
        simulatorAccent: 'text-primary-600 dark:text-primary-400',
      };
    case 'blue-purple':
      return {
        container: 'border-blue-500/40 bg-gradient-to-br from-blue-500/10 via-purple-500/5 to-purple-500/10 ring-2 ring-blue-500/20 dark:from-blue-500/15 dark:via-purple-500/10 dark:to-purple-500/15',
        title: 'text-neutral-900 dark:text-white',
        tagline: 'text-blue-600 dark:text-blue-400',
        iconBg: 'bg-gradient-to-br from-blue-500 to-purple-600 text-white',
        iconColor: 'text-white',
        cashbackBadge: 'bg-gradient-to-r from-blue-500/20 to-purple-500/20 text-blue-700 dark:text-blue-300',
        price: 'bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent',
        priceUnit: 'text-neutral-500 dark:text-neutral-500',
        checkBg: 'bg-gradient-to-br from-blue-500 to-purple-600 text-white',
        checkIcon: 'text-white',
        featureText: 'text-neutral-800 dark:text-neutral-100',
        cta: 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-xl shadow-blue-500/30 hover:opacity-90',
        simulatorBorder: 'border-blue-500/30 bg-blue-500/5 dark:border-blue-500/30',
        simulatorAccent: 'text-blue-600 dark:text-blue-400',
      };
    case 'purple-gold':
      return {
        container: 'border-purple-500/40 bg-gradient-to-br from-purple-500/10 via-amber-500/5 to-amber-500/10 dark:from-purple-500/15 dark:via-amber-500/10 dark:to-amber-500/15',
        title: 'text-neutral-900 dark:text-white',
        tagline: 'text-purple-600 dark:text-purple-400',
        iconBg: 'bg-gradient-to-br from-purple-500 to-amber-500 text-white',
        iconColor: 'text-white',
        cashbackBadge: 'bg-gradient-to-r from-purple-500/20 to-amber-500/20 text-purple-700 dark:text-purple-300',
        price: 'bg-gradient-to-r from-purple-600 to-amber-500 bg-clip-text text-transparent',
        priceUnit: 'text-neutral-500 dark:text-neutral-500',
        checkBg: 'bg-gradient-to-br from-purple-500 to-amber-500 text-white',
        checkIcon: 'text-white',
        featureText: 'text-neutral-800 dark:text-neutral-100',
        cta: 'bg-gradient-to-r from-purple-500 to-amber-500 text-white shadow-xl shadow-purple-500/30 hover:opacity-90',
        simulatorBorder: 'border-purple-500/30 dark:border-purple-500/30',
        simulatorAccent: 'text-purple-600 dark:text-purple-400',
      };
    case 'black-gold':
      return {
        container: 'border-amber-500/40 bg-gradient-to-br from-neutral-900 via-neutral-950 to-neutral-900 text-white shadow-2xl shadow-amber-500/10 dark:from-black dark:via-neutral-950 dark:to-black',
        title: 'bg-gradient-to-r from-amber-200 to-amber-500 bg-clip-text text-transparent',
        tagline: 'text-amber-400/80',
        iconBg: 'bg-gradient-to-br from-amber-400 to-amber-600',
        iconColor: 'text-neutral-900',
        cashbackBadge: 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40',
        price: 'bg-gradient-to-r from-amber-200 to-amber-500 bg-clip-text text-transparent',
        priceUnit: 'text-neutral-400',
        checkBg: 'bg-gradient-to-br from-amber-400 to-amber-600 text-neutral-900',
        checkIcon: 'text-neutral-900',
        featureText: 'text-neutral-200',
        cta: 'bg-gradient-to-r from-amber-400 to-amber-600 text-neutral-900 shadow-xl shadow-amber-500/30 hover:opacity-90',
        simulatorBorder: 'border-amber-500/40 bg-amber-500/5 dark:border-amber-500/40',
        simulatorAccent: 'text-amber-600 dark:text-amber-400',
      };
  }
}

/* ─────────────────────────────────────────────────── *
 *  UTILS                                              *
 * ─────────────────────────────────────────────────── */

function formatXOF(n: number): string {
  if (!Number.isFinite(n)) return '0 FCFA';
  // Pas de @soutra/shared.formatXOF ici pour rester découplé du Client
  // Component (l'import sert au server). Format local fr-FR identique.
  return new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' FCFA';
}
