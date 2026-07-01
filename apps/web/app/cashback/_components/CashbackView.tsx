'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { LandingNavbar } from '@/components/marketing/LandingNavbar';

/* ─────────────────────────────────────────────────── *
 *  TYPES                                              *
 * ─────────────────────────────────────────────────── */

type PlanCode = 'free' | 'standard' | 'pro' | 'premium' | 'soutra_premium';

interface Plan {
  code: PlanCode;
  display_name: string;
  tagline: string | null;
  price_monthly_xof: number;
  cashback_bps: number;
  display_order: number;
  is_recommended: boolean;
  is_prestige: boolean;
}

const PLAN_COLORS: Record<PlanCode, { from: string; to: string; text: string }> = {
  free:           { from: 'from-neutral-300',  to: 'to-neutral-200',  text: 'text-neutral-700' },
  standard:       { from: 'from-primary-500',  to: 'to-amber-500',    text: 'text-primary-600' },
  pro:            { from: 'from-blue-500',     to: 'to-purple-600',   text: 'text-blue-500' },
  premium:        { from: 'from-purple-500',   to: 'to-amber-500',    text: 'text-purple-500' },
  soutra_premium: { from: 'from-neutral-900',  to: 'to-amber-500',    text: 'text-amber-500' },
};

/* ─────────────────────────────────────────────────── *
 *  MAIN VIEW                                          *
 * ─────────────────────────────────────────────────── */

export function CashbackView({ plans }: { plans: Plan[] }) {
  const [monthlySpend, setMonthlySpend] = useState(50000);

  const sortedPlans = useMemo(
    () => [...plans].sort((a, b) => a.display_order - b.display_order),
    [plans],
  );

  // Pour les highlights de la hero — taux mini/maxi automatiquement déduits
  const maxCashbackBps = useMemo(
    () => Math.max(...sortedPlans.map((p) => p.cashback_bps), 100),
    [sortedPlans],
  );
  const maxCashbackPct = (maxCashbackBps / 100).toFixed(0);

  return (
    <main className="overflow-x-hidden bg-dark text-white">
      <LandingNavbar />

      {/* ═══════════════════════════════════════════════════════ */}
      {/*  HERO                                                  */}
      {/* ═══════════════════════════════════════════════════════ */}
      <section className="relative min-h-[80dvh] pb-16 pt-24 sm:pt-28 lg:pb-24 lg:pt-36">
        {/* Gradient orbs animés (premium look) */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-1/4 left-1/2 h-[700px] w-[1100px] -translate-x-1/2 animate-float rounded-full bg-gradient-to-br from-emerald-500/20 via-primary-500/15 to-amber-500/15 blur-[140px]" />
          <div className="absolute -bottom-20 right-0 h-[400px] w-[400px] rounded-full bg-emerald-500/10 blur-[120px]" />
        </div>

        <div className="relative mx-auto max-w-5xl px-4 text-center sm:px-6 lg:px-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-emerald-400">
            <span className="h-1.5 w-1.5 animate-glow-pulse rounded-full bg-emerald-500" />
            Récompense automatique
          </div>

          <h1 className="mt-5 font-display text-4xl font-black leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
            Récupère{' '}
            <span className="bg-gradient-to-r from-emerald-400 via-primary-400 to-amber-400 bg-clip-text text-transparent">
              jusqu&apos;à {maxCashbackPct}%
            </span>
            <br />
            sur chaque paiement
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base text-neutral-300 sm:text-lg lg:text-xl">
            Le cashback Soutra-Explore est <strong className="text-white">automatique</strong>,
            crédité directement sur ton wallet Soutra-Pay à chaque paiement marchand.
            Aucune démarche, aucun seuil minimum.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/subscribe"
              className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 via-primary-500 to-amber-500 px-8 py-4 font-display text-base font-bold text-white shadow-2xl shadow-emerald-500/30 transition hover:scale-[1.02] sm:text-lg"
            >
              Choisir mon plan
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-hover:translate-x-1">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
            <a
              href="#calculateur"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-6 py-3.5 text-sm font-semibold text-neutral-200 backdrop-blur-xl transition hover:border-white/40 hover:bg-white/10"
            >
              Tester le calculateur
            </a>
          </div>

          {/* Mini "stats" hero */}
          <div className="mx-auto mt-16 grid max-w-3xl grid-cols-3 gap-4 sm:gap-8">
            {[
              { value: 'Auto', label: 'Crédité instantanément' },
              { value: '0', label: 'Démarche' },
              { value: maxCashbackPct + '%', label: 'Cashback maxi' },
            ].map((stat, i) => (
              <div key={i} className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl sm:p-6">
                <p className="bg-gradient-to-r from-emerald-400 to-amber-400 bg-clip-text font-display text-2xl font-black tracking-tight text-transparent sm:text-3xl">
                  {stat.value}
                </p>
                <p className="mt-1 text-[11px] uppercase tracking-wider text-neutral-400 sm:text-xs">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════ */}
      {/*  COMMENT ÇA MARCHE                                     */}
      {/* ═══════════════════════════════════════════════════════ */}
      <section className="border-t border-white/5 bg-neutral-950 py-16 sm:py-20 lg:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">
              En 3 étapes
            </span>
            <h2 className="mt-3 font-display text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
              Comment ça marche
            </h2>
          </div>

          <div className="mt-12 grid gap-6 sm:gap-8 md:grid-cols-3">
            {[
              {
                step: 1,
                title: 'Tu paies un marchand',
                body: 'Restaurant, événement, réservation — chaque paiement marchand sur Soutra-Pay déclenche le cashback.',
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <line x1="2" y1="10" x2="22" y2="10" />
                  </svg>
                ),
              },
              {
                step: 2,
                title: 'Soutra calcule ton cashback',
                body: 'Selon ton plan actif : 1 % en Free, 2 % en Pro, jusqu\'à 5 % en Soutra Premium. Aucun plafond.',
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4" y="2" width="16" height="20" rx="2" />
                    <line x1="8" y1="6" x2="16" y2="6" />
                    <line x1="8" y1="10" x2="16" y2="10" />
                    <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
                  </svg>
                ),
              },
              {
                step: 3,
                title: 'Crédité sur ton wallet',
                body: 'Instantané, sans validation manuelle. Tu peux réutiliser tes FCFA cashback comme du solde normal.',
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 12 20 22 4 22 4 12" />
                    <rect x="2" y="7" width="20" height="5" />
                    <line x1="12" y1="22" x2="12" y2="7" />
                    <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
                    <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
                  </svg>
                ),
              },
            ].map((s) => (
              <div key={s.step} className="relative rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl transition hover:border-emerald-500/40 hover:bg-white/[0.05] sm:p-8">
                <div className="absolute -top-4 right-6 rounded-full bg-emerald-500 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-neutral-950 shadow-lg shadow-emerald-500/40">
                  Étape {s.step}
                </div>
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400">
                  {s.icon}
                </div>
                <h3 className="mt-4 font-display text-xl font-black tracking-tight text-white">
                  {s.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-400">
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════ */}
      {/*  CALCULATEUR INTERACTIF                                */}
      {/* ═══════════════════════════════════════════════════════ */}
      <section id="calculateur" className="border-t border-white/5 bg-dark py-16 sm:py-20 lg:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">
              Simulateur
            </span>
            <h2 className="mt-3 font-display text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
              Combien tu vas gagner ?
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base text-neutral-400">
              Indique tes dépenses marchand mensuelles. On calcule ton cashback annuel pour chaque plan, en temps réel.
            </p>
          </div>

          <Calculator
            plans={sortedPlans}
            value={monthlySpend}
            onChange={setMonthlySpend}
          />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════ */}
      {/*  TAUX PAR PLAN (cards visuelles)                       */}
      {/* ═══════════════════════════════════════════════════════ */}
      <section className="border-t border-white/5 bg-neutral-950 py-16 sm:py-20 lg:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">
              Comparatif
            </span>
            <h2 className="mt-3 font-display text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
              Plus tu montes, plus tu gagnes
            </h2>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {sortedPlans.map((p) => {
              const colors = PLAN_COLORS[p.code];
              const pct = (p.cashback_bps / 100).toFixed(p.cashback_bps % 100 === 0 ? 0 : 1);
              return (
                <div
                  key={p.code}
                  className={`relative overflow-hidden rounded-3xl border p-6 ${
                    p.is_prestige
                      ? 'border-amber-500/40 bg-gradient-to-br from-neutral-900 to-black shadow-2xl shadow-amber-500/10'
                      : p.is_recommended
                      ? 'border-blue-500/40 bg-gradient-to-br from-blue-500/10 to-purple-500/10 lg:scale-105'
                      : 'border-white/10 bg-white/[0.03]'
                  }`}
                >
                  {p.is_recommended && (
                    <div className="absolute -right-8 top-3 rotate-45 bg-blue-500 px-8 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
                      Reco
                    </div>
                  )}
                  {p.is_prestige && (
                    <div className="absolute -right-8 top-3 rotate-45 bg-amber-500 px-8 py-0.5 text-[10px] font-black uppercase tracking-wider text-neutral-950">
                      Élite
                    </div>
                  )}
                  <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                    {p.display_name}
                  </p>
                  <p className={`mt-3 bg-gradient-to-r ${colors.from} ${colors.to} bg-clip-text font-display text-5xl font-black tracking-tight text-transparent`}>
                    {pct}%
                  </p>
                  <p className="mt-1 text-[11px] text-neutral-500">de cashback</p>
                  <p className="mt-4 text-xs text-neutral-400">
                    {p.price_monthly_xof === 0
                      ? <span className="font-semibold text-white">Gratuit</span>
                      : (
                        <>
                          <span className="font-semibold text-white">{p.price_monthly_xof.toLocaleString('fr-FR')} FCFA</span>
                          {' '}/ mois
                        </>
                      )
                    }
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════ */}
      {/*  FAQ                                                   */}
      {/* ═══════════════════════════════════════════════════════ */}
      <section className="border-t border-white/5 bg-dark py-16 sm:py-20 lg:py-28">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">
              Questions fréquentes
            </span>
            <h2 className="mt-3 font-display text-3xl font-black tracking-tight sm:text-4xl">
              Ce que tu dois savoir
            </h2>
          </div>

          <div className="mt-10 space-y-3">
            {FAQ.map((item, i) => <FaqItem key={i} {...item} />)}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════ */}
      {/*  CTA FINAL                                             */}
      {/* ═══════════════════════════════════════════════════════ */}
      <section className="border-t border-white/5 bg-gradient-to-br from-emerald-500/10 via-dark to-amber-500/10 py-16 sm:py-20 lg:py-28">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="font-display text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
            Prêt à gagner sur chaque sortie ?
          </h2>
          <p className="mt-4 text-base text-neutral-300 sm:text-lg">
            Active ton cashback en moins de 2 minutes. Paiement sécurisé par Paystack.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/subscribe"
              className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 via-primary-500 to-amber-500 px-8 py-4 font-display text-base font-bold text-white shadow-2xl shadow-emerald-500/30 transition hover:scale-[1.02] sm:text-lg"
            >
              Choisir mon plan
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-hover:translate-x-1">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
            <Link
              href="/account"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-6 py-3.5 text-sm font-semibold text-neutral-200 backdrop-blur-xl transition hover:border-white/40 hover:bg-white/10"
            >
              Voir mon cashback
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

/* ─────────────────────────────────────────────────── *
 *  CALCULATEUR                                        *
 * ─────────────────────────────────────────────────── */

function Calculator({
  plans, value, onChange,
}: {
  plans: Plan[];
  value: number;
  onChange: (v: number) => void;
}) {
  const PRESETS = [10000, 25000, 50000, 100000, 250000];

  return (
    <div className="mt-12 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-xl">
      {/* Header avec input */}
      <div className="border-b border-white/10 bg-gradient-to-br from-emerald-500/5 via-transparent to-amber-500/5 p-6 sm:p-10">
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">
            Tes dépenses marchand mensuelles
          </span>
          <div className="mt-3 flex items-end gap-3 rounded-2xl border border-white/10 bg-dark/40 px-5 py-4">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={100000000}
              step={1000}
              value={value}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n) && n >= 0) onChange(n);
              }}
              className="w-full bg-transparent font-display text-3xl font-black text-white outline-none placeholder:text-neutral-600 sm:text-5xl"
              placeholder="50 000"
              aria-label="Montant dépensé chaque mois en FCFA"
            />
            <span className="shrink-0 pb-1 text-sm font-semibold text-neutral-400 sm:text-base">
              FCFA / mois
            </span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => onChange(p)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  value === p
                    ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
                    : 'border-white/10 bg-white/5 text-neutral-400 hover:border-white/20 hover:text-white'
                }`}
              >
                {p.toLocaleString('fr-FR')} FCFA
              </button>
            ))}
          </div>
        </label>
      </div>

      {/* Résultats par plan */}
      <div className="grid gap-3 p-6 sm:gap-4 sm:p-8 md:grid-cols-2 lg:grid-cols-5">
        {plans.map((p) => {
          const cashbackMonthly = Math.round((value * p.cashback_bps) / 10000);
          const cashbackYearly = cashbackMonthly * 12;
          const netYearly = cashbackYearly - p.price_monthly_xof * 12;
          const colors = PLAN_COLORS[p.code];

          return (
            <div
              key={p.code}
              className={`rounded-2xl border p-4 transition ${
                p.is_prestige
                  ? 'border-amber-500/30 bg-gradient-to-br from-neutral-900 to-black'
                  : p.is_recommended
                  ? 'border-blue-500/30 bg-blue-500/5 ring-1 ring-blue-500/20'
                  : 'border-white/10 bg-white/[0.03]'
              }`}
            >
              <p className={`text-[11px] font-bold uppercase tracking-wider ${colors.text}`}>
                {p.display_name}
              </p>
              <p className="mt-3 font-display text-2xl font-black tracking-tight text-white sm:text-3xl">
                {cashbackMonthly.toLocaleString('fr-FR')}
              </p>
              <p className="text-[11px] text-neutral-500">FCFA / mois</p>
              <div className="mt-3 border-t border-white/10 pt-3">
                <p className="text-xs text-neutral-400">
                  Soit <strong className="text-white">{cashbackYearly.toLocaleString('fr-FR')} FCFA</strong> / an
                </p>
                {p.price_monthly_xof > 0 && (
                  <p className={`mt-1 text-[11px] font-semibold ${
                    netYearly >= 0
                      ? 'text-emerald-400'
                      : 'text-amber-400'
                  }`}>
                    Net : {netYearly >= 0 ? '+' : ''}{netYearly.toLocaleString('fr-FR')} FCFA / an
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-white/10 bg-dark/40 px-6 py-4 text-center">
        <p className="text-xs text-neutral-500">
          ⓘ Estimation basée sur le taux cashback de chaque plan, appliqué au montant indiqué.
        </p>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────── *
 *  FAQ                                                *
 * ─────────────────────────────────────────────────── */

const FAQ = [
  {
    q: 'Sur quels paiements ai-je droit au cashback ?',
    a: 'Sur tous les paiements marchand (restaurants, événements, réservations) effectués via Soutra-Pay. Les rechargements wallet, les transferts entre amis et les retraits ne sont pas concernés. Les paiements d\'abonnement Premium eux-mêmes n\'ouvrent pas droit au cashback (sinon ça serait une boucle absurde).',
  },
  {
    q: 'Quand le cashback est-il crédité ?',
    a: 'Instantanément, dès que le paiement marchand est confirmé. Le crédit apparaît sous forme d\'une transaction "Cashback +X FCFA" dans ton historique wallet, avec une push notification si tu as l\'app mobile.',
  },
  {
    q: 'Y a-t-il un plafond ou un montant minimum ?',
    a: 'Aucun plafond — plus tu dépenses, plus tu gagnes. Le seul minimum est technique : si ton cashback calculé est inférieur à 1 FCFA, il n\'est pas crédité (pas de poussière). Concrètement, dès que tu paies plus de 100 FCFA, tu gagnes.',
  },
  {
    q: 'Comment changer de plan pour gagner plus ?',
    a: 'Va sur /subscribe, choisis ton nouveau plan, paie par carte ou Mobile Money. Le nouveau taux s\'applique immédiatement à tous tes paiements futurs. Tu peux annuler à tout moment depuis /account, sans frais.',
  },
  {
    q: 'Mon cashback est-il du vrai argent ?',
    a: 'Oui, 100 %. C\'est du solde FCFA réel ajouté à ton wallet Soutra-Pay. Tu peux le réutiliser pour payer un marchand, transférer à un ami, ou retirer en Mobile Money.',
  },
  {
    q: 'Quel est le taux maximum ?',
    a: '5 % avec le plan Soutra Premium (élite). C\'est un des taux les plus élevés du marché ivoirien, sans restriction de catégorie ni plafond.',
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      onClick={() => setOpen((v) => !v)}
      className="block w-full overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] text-left transition hover:border-white/20 hover:bg-white/[0.05]"
      aria-expanded={open}
    >
      <div className="flex items-center justify-between gap-3 px-5 py-4 sm:px-6 sm:py-5">
        <span className="font-semibold text-white">{q}</span>
        <svg
          width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          className={`shrink-0 text-neutral-400 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
      {open && (
        <div className="animate-fade-in border-t border-white/5 px-5 py-4 text-sm leading-relaxed text-neutral-400 sm:px-6">
          {a}
        </div>
      )}
    </button>
  );
}
