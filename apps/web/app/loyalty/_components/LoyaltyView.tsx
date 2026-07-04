'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { LandingNavbar } from '@/components/marketing/LandingNavbar';

/* ─────────────────────────────────────────────────── *
 *  TYPES                                              *
 * ─────────────────────────────────────────────────── */

interface Level {
  code: string;
  label: string;
  min_points: number;
  color: string;
  emoji: string;
  benefits: string[];
}

interface Reward {
  code: string;
  label: string;
  description: string | null;
  points_cost: number;
}

/* ─────────────────────────────────────────────────── *
 *  MAIN VIEW                                          *
 * ─────────────────────────────────────────────────── */

export function LoyaltyView({ levels, rewards }: { levels: Level[]; rewards: Reward[] }) {
  const [monthlySpend, setMonthlySpend] = useState(50000);

  const sortedLevels = useMemo(
    () => [...levels].sort((a, b) => a.min_points - b.min_points),
    [levels],
  );

  const topLevel = sortedLevels[sortedLevels.length - 1];

  return (
    <main className="overflow-x-hidden bg-dark text-white">
      <LandingNavbar />

      {/* ═══════════════════════════════════════════════════════ */}
      {/*  HERO                                                  */}
      {/* ═══════════════════════════════════════════════════════ */}
      <section className="relative min-h-[80dvh] pb-16 pt-24 sm:pt-28 lg:pb-24 lg:pt-36">
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-1/4 left-1/2 h-[700px] w-[1100px] -translate-x-1/2 animate-float rounded-full bg-gradient-to-br from-amber-500/20 via-primary-500/15 to-sky-500/15 blur-[140px]" />
          <div className="absolute -bottom-20 right-0 h-[400px] w-[400px] rounded-full bg-amber-500/10 blur-[120px]" />
        </div>

        <div className="relative mx-auto max-w-5xl px-4 text-center sm:px-6 lg:px-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-amber-400">
            <span className="h-1.5 w-1.5 animate-glow-pulse rounded-full bg-amber-500" />
            Programme de fidélité
          </div>

          <h1 className="mt-5 font-display text-4xl font-black leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
            Gagne des points{' '}
            <span className="bg-gradient-to-r from-amber-400 via-primary-400 to-sky-400 bg-clip-text text-transparent">
              sur chaque paiement
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base text-neutral-300 sm:text-lg lg:text-xl">
            <strong className="text-white">100 FCFA dépensés = 1 point.</strong> Progresse de Bronze
            à Diamant et échange tes points contre des récompenses partenaires. Automatique,
            sans démarche.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/login"
              className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-500 via-primary-500 to-sky-500 px-8 py-4 font-display text-base font-bold text-white shadow-2xl shadow-amber-500/30 transition hover:scale-[1.02] sm:text-lg"
            >
              Créer mon compte
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

          <div className="mx-auto mt-16 grid max-w-3xl grid-cols-3 gap-4 sm:gap-8">
            {[
              { value: 'Auto', label: 'Crédité instantanément' },
              { value: '0', label: 'Démarche' },
              { value: `${sortedLevels.length || 5}`, label: 'Niveaux à débloquer' },
            ].map((stat, i) => (
              <div key={i} className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl sm:p-6">
                <p className="bg-gradient-to-r from-amber-400 to-sky-400 bg-clip-text font-display text-2xl font-black tracking-tight text-transparent sm:text-3xl">
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
            <span className="text-xs font-bold uppercase tracking-widest text-amber-400">
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
                body: 'Restaurant, événement, réservation — chaque paiement marchand sur Soutra-Pay fait progresser ta fidélité.',
              },
              {
                step: 2,
                title: 'Tu gagnes des points',
                body: '100 FCFA dépensés = 1 point, quel que soit ton plan. Aucun plafond, aucune démarche.',
              },
              {
                step: 3,
                title: 'Tu échanges tes points',
                body: 'Contre des récompenses du catalogue, dès que tu as assez de points. Ton niveau (Bronze → Diamant) ne baisse jamais.',
              },
            ].map((s) => (
              <div key={s.step} className="relative rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl transition hover:border-amber-500/40 hover:bg-white/[0.05] sm:p-8">
                <div className="absolute -top-4 right-6 rounded-full bg-amber-500 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-neutral-950 shadow-lg shadow-amber-500/40">
                  Étape {s.step}
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
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <span className="text-xs font-bold uppercase tracking-widest text-amber-400">
              Simulateur
            </span>
            <h2 className="mt-3 font-display text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
              Combien de points tu vas gagner ?
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base text-neutral-400">
              Indique tes dépenses marchand mensuelles. On calcule tes points gagnés en temps réel.
            </p>
          </div>

          <Calculator value={monthlySpend} onChange={setMonthlySpend} topLevel={topLevel} />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════ */}
      {/*  NIVEAUX (cards visuelles)                             */}
      {/* ═══════════════════════════════════════════════════════ */}
      <section className="border-t border-white/5 bg-neutral-950 py-16 sm:py-20 lg:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <span className="text-xs font-bold uppercase tracking-widest text-amber-400">
              Progression
            </span>
            <h2 className="mt-3 font-display text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
              Plus tu dépenses, plus tu montes
            </h2>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {sortedLevels.map((lvl) => (
              <div
                key={lvl.code}
                className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-6"
                style={{ borderColor: `${lvl.color}40` }}
              >
                <p className="text-4xl">{lvl.emoji}</p>
                <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  {lvl.label}
                </p>
                <p className="mt-1 font-display text-2xl font-black tracking-tight text-white">
                  {lvl.min_points.toLocaleString('fr-FR')} pts
                </p>
                {lvl.benefits?.[0] && (
                  <p className="mt-3 text-[11px] leading-relaxed text-neutral-400">
                    {lvl.benefits[0]}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════ */}
      {/*  CATALOGUE DE RÉCOMPENSES                              */}
      {/* ═══════════════════════════════════════════════════════ */}
      {rewards.length > 0 && (
        <section className="border-t border-white/5 bg-dark py-16 sm:py-20 lg:py-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <span className="text-xs font-bold uppercase tracking-widest text-amber-400">
                Catalogue
              </span>
              <h2 className="mt-3 font-display text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
                Des récompenses à débloquer
              </h2>
            </div>

            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rewards.map((r) => (
                <div key={r.code} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                  <p className="font-display text-lg font-black text-white">{r.label}</p>
                  {r.description && (
                    <p className="mt-2 text-sm text-neutral-400">{r.description}</p>
                  )}
                  <p className="mt-4 text-sm font-bold text-amber-400">
                    {r.points_cost.toLocaleString('fr-FR')} pts
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/*  FAQ                                                   */}
      {/* ═══════════════════════════════════════════════════════ */}
      <section className="border-t border-white/5 bg-neutral-950 py-16 sm:py-20 lg:py-28">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <span className="text-xs font-bold uppercase tracking-widest text-amber-400">
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
      <section className="border-t border-white/5 bg-gradient-to-br from-amber-500/10 via-dark to-sky-500/10 py-16 sm:py-20 lg:py-28">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="font-display text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
            Prêt à gagner sur chaque sortie ?
          </h2>
          <p className="mt-4 text-base text-neutral-300 sm:text-lg">
            Crée ton compte en moins de 2 minutes et commence à cumuler des points dès ton premier paiement.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/login"
              className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-500 via-primary-500 to-sky-500 px-8 py-4 font-display text-base font-bold text-white shadow-2xl shadow-amber-500/30 transition hover:scale-[1.02] sm:text-lg"
            >
              Créer mon compte
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-hover:translate-x-1">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
            <Link
              href="/account"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-6 py-3.5 text-sm font-semibold text-neutral-200 backdrop-blur-xl transition hover:border-white/40 hover:bg-white/10"
            >
              Voir ma fidélité
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
  value, onChange, topLevel,
}: {
  value: number;
  onChange: (v: number) => void;
  topLevel: Level | undefined;
}) {
  const PRESETS = [10000, 25000, 50000, 100000, 250000];

  const monthlyPoints = Math.floor(value / 100);
  const yearlyPoints = monthlyPoints * 12;
  const monthsToTopLevel = topLevel && monthlyPoints > 0
    ? Math.ceil(topLevel.min_points / monthlyPoints)
    : null;

  return (
    <div className="mt-12 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-xl">
      <div className="border-b border-white/10 bg-gradient-to-br from-amber-500/5 via-transparent to-sky-500/5 p-6 sm:p-10">
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
                    ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                    : 'border-white/10 bg-white/5 text-neutral-400 hover:border-white/20 hover:text-white'
                }`}
              >
                {p.toLocaleString('fr-FR')} FCFA
              </button>
            ))}
          </div>
        </label>
      </div>

      <div className="grid gap-4 p-6 sm:p-8 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">Par mois</p>
          <p className="mt-2 font-display text-3xl font-black text-white">{monthlyPoints.toLocaleString('fr-FR')} pts</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">Par an</p>
          <p className="mt-2 font-display text-3xl font-black text-white">{yearlyPoints.toLocaleString('fr-FR')} pts</p>
        </div>
        {topLevel && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
              {topLevel.emoji} Niveau {topLevel.label}
            </p>
            <p className="mt-2 font-display text-lg font-black text-white">
              {monthsToTopLevel ? `~${monthsToTopLevel} mois` : '—'}
            </p>
          </div>
        )}
      </div>

      <div className="border-t border-white/10 bg-dark/40 px-6 py-4 text-center">
        <p className="text-xs text-neutral-500">
          ⓘ Estimation basée sur 100 FCFA dépensés = 1 point, appliqué au montant indiqué.
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
    q: 'Sur quels paiements je gagne des points ?',
    a: 'Sur tous les paiements marchand (restaurants, événements, réservations) effectués via Soutra-Pay. Les rechargements wallet, les transferts entre amis et les retraits ne sont pas concernés. Les paiements d\'abonnement eux-mêmes n\'ouvrent pas droit à des points.',
  },
  {
    q: 'Quand les points sont-ils crédités ?',
    a: 'Instantanément, dès que le paiement marchand est confirmé. Le crédit apparaît dans ton historique fidélité, avec une notification si tu as l\'app mobile.',
  },
  {
    q: 'Mon niveau peut-il redescendre ?',
    a: 'Non. Ton niveau est basé sur le cumul de points gagnés depuis ton inscription, qui ne baisse jamais — même si tu dépenses des points contre des récompenses.',
  },
  {
    q: 'Comment échanger mes points ?',
    a: 'Depuis l\'app ou ton compte, va dans "Fidélité" puis choisis une récompense du catalogue. Le point est débité de ton solde dépensable et la récompense est réservée.',
  },
  {
    q: 'Y a-t-il un plafond ou un montant minimum ?',
    a: 'Aucun plafond — plus tu dépenses, plus tu gagnes. Le seul minimum est technique : en dessous de 100 FCFA, aucun point n\'est crédité (pas de poussière).',
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
