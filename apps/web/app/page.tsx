import Link from 'next/link';
import { LandingNavbar } from '@/components/marketing/LandingNavbar';

export default function HomePage() {
  return (
    <main className="overflow-x-hidden">
      <LandingNavbar />

      {/* ═══════════════════════════════════════════════════════ */}
      {/*  HERO                                                  */}
      {/* ═══════════════════════════════════════════════════════ */}
      <section className="relative min-h-[100dvh] bg-dark pb-16 pt-24 sm:pb-20 sm:pt-28 lg:pb-32 lg:pt-36">
        {/* Gradient orbs */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-[40%] left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-primary-500/20 blur-[120px] sm:h-[800px] sm:w-[800px]" />
          <div className="absolute bottom-0 right-0 h-[300px] w-[300px] rounded-full bg-secondary-500/10 blur-[100px] sm:h-[400px] sm:w-[400px]" />
          <div className="absolute left-0 top-1/3 h-[200px] w-[200px] rounded-full bg-accent-500/10 blur-[80px] sm:h-[300px] sm:w-[300px]" />
        </div>

        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 sm:gap-12 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8">
          {/* ── Left: Copy ── */}
          <div className="text-center lg:text-left">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary-500/20 bg-primary-500/10 px-3 py-1 text-xs backdrop-blur-sm sm:px-4 sm:py-1.5 sm:text-sm">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary-400" />
              </span>
              <span className="text-primary-300">Disponible à Abidjan</span>
            </div>

            <h1 className="mt-6 font-display text-[2.5rem] font-bold leading-[1.08] tracking-tight text-white sm:mt-8 sm:text-5xl md:text-6xl lg:text-7xl">
              Sors. Réserve.
              <br />
              <span className="bg-gradient-to-r from-primary-400 via-warning to-primary-500 bg-clip-text text-transparent">
                Paie. C&apos;est tout.
              </span>
            </h1>

            <p className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-neutral-400 sm:mt-6 sm:text-lg lg:mx-0">
              Trouve les meilleurs maquis et restos d&apos;Abidjan. Réserve ta table
              en 10 secondes. Paie avec Orange Money, Wave ou MTN.{' '}
              <span className="text-neutral-300">C&apos;est garanti.</span>
            </p>

            <div className="mt-8 flex flex-col items-stretch gap-3 sm:mt-10 sm:flex-row sm:gap-4 sm:items-center lg:justify-start">
              <a
                href="#download"
                className="group inline-flex items-center justify-center gap-2.5 rounded-full bg-gradient-to-r from-primary-500 to-primary-600 px-6 py-3.5 text-sm font-semibold text-white shadow-2xl shadow-primary-500/25 transition-all duration-300 hover:shadow-[0_20px_60px_-15px_rgba(255,107,26,0.5)] sm:px-8 sm:py-4 sm:text-base"
              >
                Télécharger l&apos;app
                <ArrowIcon className="transition-transform duration-300 group-hover:translate-x-1" />
              </a>
              <Link
                href="/pro"
                className="inline-flex items-center justify-center rounded-full border border-neutral-700 px-6 py-3.5 text-sm font-medium text-neutral-300 transition-all duration-300 hover:border-neutral-500 hover:bg-white/[0.03] hover:text-white sm:px-8 sm:py-4 sm:text-base"
              >
                Espace établissement
              </Link>
            </div>

            {/* Social proof — grille égale 3 cols sur mobile pour lisibilité */}
            <div className="mt-10 grid grid-cols-3 gap-4 sm:mt-14 sm:flex sm:flex-wrap sm:items-center sm:justify-center sm:gap-8 lg:justify-start">
              <HeroStat value="200+" label="Établissements" />
              <div className="hidden h-10 w-px bg-neutral-800 sm:block" />
              <HeroStat value="15K+" label="Utilisateurs" />
              <div className="hidden h-10 w-px bg-neutral-800 sm:block" />
              <HeroStat value="★ 4.7" label="Sur les stores" />
            </div>
          </div>

          {/* ── Right: Phone ── (sous le copy sur mobile/tablet via grid 1-col) */}
          <div className="relative mx-auto w-full max-w-xs sm:max-w-sm lg:mx-0 lg:ml-auto lg:max-w-none">
            <div className="absolute -inset-12 animate-glow-pulse rounded-full bg-gradient-to-br from-primary-500/20 to-warning/10 blur-[80px]" />
            <PhoneMockup />
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════ */}
      {/*  TRUST BAR                                             */}
      {/* ═══════════════════════════════════════════════════════ */}
      <section className="border-b border-neutral-100 bg-white py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="mb-8 text-center text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">
            Paiements sécurisés
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-4 opacity-40 grayscale transition-all duration-500 hover:opacity-60 hover:grayscale-0 sm:gap-x-10 sm:gap-y-6 lg:gap-x-14">
            {['Orange Money', 'Wave', 'MTN MoMo', 'Moov Money', 'Visa', 'Mastercard'].map((name) => (
              <span key={name} className="text-sm font-bold text-neutral-600 sm:text-base lg:text-lg">
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════ */}
      {/*  HOW IT WORKS                                          */}
      {/* ═══════════════════════════════════════════════════════ */}
      <section id="how" className="bg-light py-16 sm:py-20 lg:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <span className="text-sm font-semibold uppercase tracking-widest text-primary-500">
              Simple comme bonjour
            </span>
            <h2 className="mt-3 font-display text-3xl font-bold text-dark sm:text-4xl">
              Comment ça marche
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-neutral-500">
              Trois étapes pour profiter de ta soirée sans stress.
            </p>
          </div>

          <div className="relative mt-16 grid gap-8 md:grid-cols-3">
            {/* Connector line (desktop) */}
            <div className="absolute left-[16.5%] right-[16.5%] top-12 hidden h-px bg-gradient-to-r from-primary-200 via-primary-300 to-secondary-500 md:block" />

            <Step
              num="01"
              title="Découvre"
              desc="Parcours les maquis, restos et événements autour de toi. Filtre par budget, ambiance ou distance."
              icon={<IconSearch />}
            />
            <Step
              num="02"
              title="Réserve"
              desc="Choisis ta table, ton créneau, le nombre de personnes. Confirmation instantanée."
              icon={<IconCalendar />}
            />
            <Step
              num="03"
              title="Paie & profite"
              desc="Paie par mobile money ou carte. Ton acompte est protégé. Remboursé si problème."
              icon={<IconShield />}
            />
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════ */}
      {/*  FEATURES — Bento Grid                                 */}
      {/* ═══════════════════════════════════════════════════════ */}
      <section id="features" className="bg-white py-16 sm:py-20 lg:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <span className="text-sm font-semibold uppercase tracking-widest text-primary-500">
              Fonctionnalités
            </span>
            <h2 className="mt-3 font-display text-3xl font-bold text-dark sm:text-4xl">
              Tout pour sortir tranquille
            </h2>
          </div>

          <div className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {/* Large card — Discover (spans 2 cols and 2 rows) */}
            <div className="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary-500 to-primary-700 p-8 text-white md:col-span-2 lg:col-span-2 lg:row-span-2">
              <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/10 blur-3xl transition-all duration-500 group-hover:bg-white/20" />
              <div className="relative">
                <div className="mb-4 inline-flex rounded-2xl bg-white/20 p-3 backdrop-blur-sm">
                  <IconMap />
                </div>
                <h3 className="font-display text-2xl font-bold lg:text-3xl">
                  Carte interactive &amp; IA
                </h3>
                <p className="mt-3 max-w-md text-base leading-relaxed text-white/80">
                  Dis-nous ton budget et ton humeur. Notre IA te propose les meilleurs
                  spots autour de toi, avec carte en temps réel.
                </p>
                <div className="mt-8 grid grid-cols-3 gap-4">
                  {['Budget personnalisé', 'Filtres avancés', 'Temps réel'].map((t) => (
                    <div
                      key={t}
                      className="rounded-2xl bg-white/10 p-4 text-sm font-medium backdrop-blur-sm"
                    >
                      {t}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Payment card */}
            <div className="group relative overflow-hidden rounded-3xl bg-dark p-8 text-white">
              <div className="absolute -bottom-10 -right-10 h-40 w-40 rounded-full bg-secondary-500/20 blur-3xl transition-all duration-500 group-hover:bg-secondary-500/30" />
              <div className="relative">
                <div className="mb-4 inline-flex rounded-2xl bg-secondary-500/20 p-3">
                  <IconWallet />
                </div>
                <h3 className="font-display text-xl font-bold">Soutra-Pay</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-400">
                  Wallet rechargeable. Orange Money, Wave, MTN. QR Pay et Split Bill
                  entre amis.
                </p>
              </div>
            </div>

            {/* Reservation card */}
            <div className="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-neutral-50 to-neutral-100 p-8">
              <div className="absolute -bottom-10 -right-10 h-40 w-40 rounded-full bg-warning/10 blur-3xl transition-all duration-500 group-hover:bg-warning/20" />
              <div className="relative">
                <div className="mb-4 inline-flex rounded-2xl bg-warning/10 p-3">
                  <IconTicket />
                </div>
                <h3 className="font-display text-xl font-bold text-dark">
                  Réservation sécurisée
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-500">
                  Acompte protégé en séquestre. Remboursé automatiquement si le lieu
                  annule.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════ */}
      {/*  PREMIUM PLANS — teaser vers /subscribe                */}
      {/* ═══════════════════════════════════════════════════════ */}
      <section id="premium" className="relative overflow-hidden bg-dark py-16 text-white sm:py-20 lg:py-32">
        {/* Glow gradients (premium look) */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -top-1/4 left-1/2 h-[700px] w-[1100px] -translate-x-1/2 rounded-full bg-gradient-to-br from-primary-500/20 via-purple-500/15 to-amber-500/10 blur-[140px]" />
          <div className="absolute -bottom-32 right-0 h-[400px] w-[400px] rounded-full bg-purple-500/15 blur-[120px]" />
        </div>

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary-500/30 bg-primary-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-primary-400">
              <span className="h-1.5 w-1.5 animate-glow-pulse rounded-full bg-primary-500" />
              Soutra Premium
            </span>
            <h2 className="mt-4 font-display text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
              Choisis ton{' '}
              <span className="bg-gradient-to-r from-primary-400 via-purple-400 to-amber-400 bg-clip-text text-transparent">
                expérience
              </span>
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base text-neutral-300 sm:text-lg">
              Cashback jusqu&apos;à <strong className="text-white">5 %</strong>, accès VVIP, concierge dédié.
              Trois formules pour transformer chaque sortie en récompense.
            </p>
          </div>

          {/* Teaser cards : Standard / Pro recommandé / Soutra Premium */}
          <div className="mt-12 grid grid-cols-1 gap-5 sm:gap-6 md:grid-cols-3">
            {/* Standard */}
            <article className="group rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl transition hover:border-white/20 hover:bg-white/[0.05]">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary-500/15 text-primary-400">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
                </svg>
              </div>
              <h3 className="mt-4 font-display text-xl font-black tracking-tight">Standard</h3>
              <p className="mt-1 text-sm text-neutral-400">Pour profiter au quotidien</p>
              <div className="mt-5 flex items-baseline gap-1">
                <span className="font-display text-3xl font-black tracking-tight">2 000</span>
                <span className="text-sm text-neutral-500">FCFA / mois</span>
              </div>
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary-500/15 px-2.5 py-1 text-xs font-bold text-primary-300">
                💰 Cashback 1 %
              </div>
              <ul className="mt-5 space-y-2 text-sm text-neutral-300">
                <li className="flex items-start gap-2"><Check />Notifications prioritaires</li>
                <li className="flex items-start gap-2"><Check />Alertes personnalisées</li>
                <li className="flex items-start gap-2"><Check />Offres exclusives</li>
              </ul>
            </article>

            {/* Pro — RECOMMANDÉ (scale + dégradé bleu→violet) */}
            <article className="group relative rounded-3xl border border-blue-500/40 bg-gradient-to-br from-blue-500/15 via-purple-500/10 to-purple-500/15 p-6 ring-2 ring-blue-500/30 backdrop-blur-xl transition md:-mt-4 md:scale-105 hover:border-blue-500/60">
              <div className="absolute -top-px left-1/2 -translate-x-1/2 rounded-b-2xl bg-gradient-to-r from-blue-500 to-purple-600 px-4 py-1 text-[11px] font-black uppercase tracking-wider text-white shadow-lg">
                🔥 Recommandé
              </div>
              <div className="mt-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </div>
              <h3 className="mt-4 font-display text-xl font-black tracking-tight">Pro</h3>
              <p className="mt-1 text-sm text-blue-300">Meilleur rapport qualité/prix</p>
              <div className="mt-5 flex items-baseline gap-1">
                <span className="bg-gradient-to-r from-blue-300 to-purple-300 bg-clip-text font-display text-3xl font-black tracking-tight text-transparent">5 000</span>
                <span className="text-sm text-neutral-400">FCFA / mois</span>
              </div>
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-blue-500/20 to-purple-500/20 px-2.5 py-1 text-xs font-bold text-blue-300">
                💰 Cashback 2 %
              </div>
              <ul className="mt-5 space-y-2 text-sm text-neutral-200">
                <li className="flex items-start gap-2"><Check tone="blue" />Sans publicité</li>
                <li className="flex items-start gap-2"><Check tone="blue" />Concierge IA Sia illimité</li>
                <li className="flex items-start gap-2"><Check tone="blue" />Support prioritaire</li>
              </ul>
            </article>

            {/* Soutra Premium — PRESTIGE (noir → or luxe) */}
            <article className="group relative rounded-3xl border border-amber-500/40 bg-gradient-to-br from-black via-neutral-950 to-black p-6 shadow-2xl shadow-amber-500/10 transition hover:border-amber-500/60">
              <div className="absolute -top-px left-1/2 -translate-x-1/2 rounded-b-2xl bg-gradient-to-r from-amber-500 to-amber-300 px-4 py-1 text-[11px] font-black uppercase tracking-wider text-neutral-900 shadow-lg">
                👑 Prestige
              </div>
              <div className="mt-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-neutral-900">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 19l3-12 5 4 4-7 5 7 5-4-3 12H2z" />
                  <line x1="2" y1="22" x2="22" y2="22" />
                </svg>
              </div>
              <h3 className="mt-4 bg-gradient-to-r from-amber-200 to-amber-500 bg-clip-text font-display text-xl font-black tracking-tight text-transparent">
                Soutra Premium
              </h3>
              <p className="mt-1 text-sm text-amber-400/80">L&apos;élite Soutra-Playce</p>
              <div className="mt-5 flex items-baseline gap-1">
                <span className="bg-gradient-to-r from-amber-200 to-amber-500 bg-clip-text font-display text-3xl font-black tracking-tight text-transparent">30 000</span>
                <span className="text-sm text-neutral-400">FCFA / mois</span>
              </div>
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-amber-500/20 px-2.5 py-1 text-xs font-bold text-amber-300 ring-1 ring-amber-500/40">
                💰 Cashback 5 %
              </div>
              <ul className="mt-5 space-y-2 text-sm text-neutral-200">
                <li className="flex items-start gap-2"><Check tone="gold" />Accès VVIP + Réservations prioritaires</li>
                <li className="flex items-start gap-2"><Check tone="gold" />Concierge humain dédié</li>
                <li className="flex items-start gap-2"><Check tone="gold" />Invitations privées exclusives</li>
              </ul>
            </article>
          </div>

          {/* CTA principal */}
          <div className="mt-12 flex flex-col items-center gap-4 text-center">
            <Link
              href="/subscribe"
              className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primary-500 via-purple-500 to-amber-500 px-8 py-4 font-display text-base font-bold text-white shadow-2xl shadow-primary-500/30 transition hover:scale-[1.02] hover:shadow-primary-500/50 sm:text-lg"
            >
              Voir tous les abonnements
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-hover:translate-x-1">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
            <p className="text-xs text-neutral-500">
              Paiement sécurisé · Orange Money · MTN · Wave · Visa · Mastercard
            </p>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════ */}
      {/*  TESTIMONIALS                                          */}
      {/* ═══════════════════════════════════════════════════════ */}
      <section className="bg-light py-16 sm:py-20 lg:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <span className="text-sm font-semibold uppercase tracking-widest text-primary-500">
              Témoignages
            </span>
            <h2 className="mt-3 font-display text-3xl font-bold text-dark sm:text-4xl">
              Ils sortent avec Soutra
            </h2>
          </div>

          <div className="mt-16 grid gap-6 md:grid-cols-3">
            <TestimonialCard
              quote="Depuis que j'utilise Soutra, je découvre des maquis que je connaissais même pas. Et le split bill entre potes, c'est un game changer."
              name="Aminata K."
              role="Étudiante, Cocody"
              initials="AK"
              accentClass="bg-primary-100 text-primary-600"
            />
            <TestimonialCard
              quote="Je réserve mon resto en 30 secondes. Plus besoin d'appeler. Et si le lieu annule, je suis remboursé direct."
              name="Jean-Marc D."
              role="Cadre, Plateau"
              initials="JD"
              accentClass="bg-secondary-50 text-secondary-600"
            />
            <TestimonialCard
              quote="Orange Money, Wave, MTN — je paie comme je veux. Et le QR code au maquis c'est trop simple."
              name="Fatou B."
              role="Entrepreneuse, Marcory"
              initials="FB"
              accentClass="bg-primary-50 text-warning"
            />
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════ */}
      {/*  B2B PRO                                               */}
      {/* ═══════════════════════════════════════════════════════ */}
      <section className="bg-dark py-16 text-white sm:py-20 lg:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid items-center gap-16 lg:grid-cols-2">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-secondary-500/20 bg-secondary-500/10 px-4 py-1.5 text-sm font-semibold text-secondary-500">
                Espace Pro
              </span>
              <h2 className="mt-6 font-display text-3xl font-bold sm:text-4xl">
                Tu gères un maquis,
                <br />
                un resto ou un event ?
              </h2>
              <p className="mt-4 max-w-md text-lg text-neutral-400">
                Reçois des réservations payées d&apos;avance. Gère ta vente de
                billets. Fidélise tes clients.
              </p>
              <div className="mt-4 inline-flex items-center gap-2 rounded-lg bg-warning/10 px-4 py-2 text-sm font-semibold text-warning">
                0 % de commission les 3 premiers mois
              </div>
              <div className="mt-8">
                <Link
                  href="/pro"
                  className="group inline-flex items-center gap-2 rounded-full bg-secondary-500 px-8 py-4 font-semibold text-white shadow-lg shadow-secondary-500/25 transition-all duration-300 hover:bg-secondary-600 hover:shadow-secondary-500/40"
                >
                  Ouvrir mon dashboard
                  <ArrowIcon className="transition-transform duration-300 group-hover:translate-x-1" />
                </Link>
              </div>
            </div>

            {/* Dashboard preview */}
            <div className="rounded-3xl border border-neutral-800 bg-neutral-900/50 p-8 backdrop-blur">
              <div className="mb-6 flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-danger" />
                <div className="h-3 w-3 rounded-full bg-warning" />
                <div className="h-3 w-3 rounded-full bg-success" />
                <span className="ml-2 text-xs text-neutral-600">
                  dashboard.soutra-paiya.com
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <DashStat label="Réservations du jour" value="47" badge="+12%" />
                <DashStat label="Chiffre d'affaires" value="312K" suffix=" FCFA" />
                <DashStat label="Note moyenne" value="4.7" prefix="★ " />
                <DashStat label="Taux de no-show" value="3%" badge="-8%" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════ */}
      {/*  FINAL CTA                                             */}
      {/* ═══════════════════════════════════════════════════════ */}
      <section
        id="download"
        className="relative overflow-hidden bg-gradient-to-br from-primary-500 via-primary-600 to-primary-700 py-24 text-white lg:py-32"
      >
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-40 top-0 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-warning/20 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-3xl px-6 text-center">
          <h2 className="font-display text-3xl font-bold sm:text-5xl">
            Prêt à sortir
            <br />
            sans galère ?
          </h2>
          <p className="mx-auto mt-6 max-w-lg text-lg text-white/80">
            Rejoins les milliers d&apos;Abidjanais qui réservent et paient en
            toute simplicité.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href="#"
              className="inline-flex items-center gap-3 rounded-2xl bg-black px-6 py-4 font-medium text-white transition hover:bg-neutral-900"
            >
              <IconApple />
              <div className="text-left">
                <div className="text-[10px] uppercase tracking-wide opacity-60">
                  Télécharger sur
                </div>
                <div className="text-base font-semibold">App Store</div>
              </div>
            </a>
            <a
              href="#"
              className="inline-flex items-center gap-3 rounded-2xl bg-black px-6 py-4 font-medium text-white transition hover:bg-neutral-900"
            >
              <IconPlayStore />
              <div className="text-left">
                <div className="text-[10px] uppercase tracking-wide opacity-60">
                  Disponible sur
                </div>
                <div className="text-base font-semibold">Google Play</div>
              </div>
            </a>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════ */}
      {/*  FOOTER                                                */}
      {/* ═══════════════════════════════════════════════════════ */}
      <footer className="bg-dark py-12 text-neutral-400 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-8 sm:gap-10 md:grid-cols-4 md:gap-12">
            <div className="col-span-2 md:col-span-1">
              <span className="font-display text-xl font-bold">
                <span className="text-white">Soutra</span>
                <span className="text-primary-400">-Playce</span>
              </span>
              <p className="mt-4 text-sm leading-relaxed text-neutral-500">
                Conçu à Abidjan, pour la Côte d&apos;Ivoire.
              </p>
            </div>

            <div>
              <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-300">
                Produit
              </h4>
              <ul className="space-y-3 text-sm">
                <li>
                  <a href="#features" className="transition hover:text-white">
                    Fonctionnalités
                  </a>
                </li>
                <li>
                  <a href="#how" className="transition hover:text-white">
                    Comment ça marche
                  </a>
                </li>
                <li>
                  <Link href="/subscribe" className="transition hover:text-white">
                    Abonnements Premium
                  </Link>
                </li>
                <li>
                  <a href="#download" className="transition hover:text-white">
                    Télécharger
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-300">
                Entreprise
              </h4>
              <ul className="space-y-3 text-sm">
                <li>
                  <Link href="/pro" className="transition hover:text-white">
                    Espace Pro
                  </Link>
                </li>
                <li>
                  <a href="#" className="transition hover:text-white">
                    À propos
                  </a>
                </li>
                <li>
                  <a href="#" className="transition hover:text-white">
                    Contact
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-300">
                Légal
              </h4>
              <ul className="space-y-3 text-sm">
                <li>
                  <a href="#" className="transition hover:text-white">
                    Conditions d&apos;utilisation
                  </a>
                </li>
                <li>
                  <a href="#" className="transition hover:text-white">
                    Politique de confidentialité
                  </a>
                </li>
                <li>
                  <a href="#" className="transition hover:text-white">
                    CGV
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-16 flex flex-col items-center justify-between gap-4 border-t border-neutral-800 pt-8 text-sm md:flex-row">
            <span>© {new Date().getFullYear()} Soutra-Playce. Tous droits réservés.</span>
            <div className="flex gap-6">
              <a href="#" className="transition hover:text-white">
                Instagram
              </a>
              <a href="#" className="transition hover:text-white">
                Twitter
              </a>
              <a href="#" className="transition hover:text-white">
                LinkedIn
              </a>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}

/* ────────────────────────────────────────────────────────────── */
/*  SECTION COMPONENTS                                           */
/* ────────────────────────────────────────────────────────────── */

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center sm:text-left">
      <div className="font-display text-2xl font-bold text-white">{value}</div>
      <div className="text-xs text-neutral-500">{label}</div>
    </div>
  );
}

function Step({
  num,
  title,
  desc,
  icon,
}: {
  num: string;
  title: string;
  desc: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="relative text-center">
      <div className="relative z-10 mx-auto flex h-24 w-24 items-center justify-center rounded-3xl bg-white shadow-lg shadow-neutral-200/50 transition-shadow duration-300 hover:shadow-xl">
        <div className="text-primary-500">{icon}</div>
      </div>
      <span className="mt-6 inline-block font-display text-xs font-bold uppercase tracking-widest text-primary-500">
        {num}
      </span>
      <h3 className="mt-2 font-display text-xl font-bold text-dark">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-neutral-500">{desc}</p>
    </div>
  );
}

function TestimonialCard({
  quote,
  name,
  role,
  initials,
  accentClass,
}: {
  quote: string;
  name: string;
  role: string;
  initials: string;
  accentClass: string;
}) {
  return (
    <div className="rounded-3xl bg-white p-8 shadow-sm transition-all duration-300 hover:shadow-lg">
      <div className="mb-6 text-primary-500/20">
        <IconQuote />
      </div>
      <p className="text-sm leading-relaxed text-neutral-600">{quote}</p>
      <div className="mt-6 flex items-center gap-3">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold ${accentClass}`}
        >
          {initials}
        </div>
        <div>
          <div className="text-sm font-semibold text-dark">{name}</div>
          <div className="text-xs text-neutral-400">{role}</div>
        </div>
      </div>
    </div>
  );
}

function DashStat({
  label,
  value,
  prefix,
  suffix,
  badge,
}: {
  label: string;
  value: string;
  prefix?: string;
  suffix?: string;
  badge?: string;
}) {
  return (
    <div className="rounded-2xl bg-neutral-800/50 p-5">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-2 flex items-baseline gap-1">
        {prefix && <span className="text-warning">{prefix}</span>}
        <span className="font-display text-2xl font-bold text-white">{value}</span>
        {suffix && <span className="text-sm text-neutral-400">{suffix}</span>}
      </div>
      {badge && (
        <span className="mt-1 inline-block text-xs font-medium text-success">{badge}</span>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */
/*  PHONE MOCKUP                                                 */
/* ────────────────────────────────────────────────────────────── */

function PhoneMockup() {
  const venues = [
    { name: 'Le Mékaféba', cat: 'Maquis • Cocody', rating: '4.7', price: '~8K', emoji: '🍗', bg: 'bg-orange-50' },
    { name: 'Saka Saka', cat: 'Restaurant • Plateau', rating: '4.5', price: '~12K', emoji: '🍽️', bg: 'bg-emerald-50' },
    { name: 'VIP Lounge', cat: 'Lounge • Zone 4', rating: '4.9', price: '~25K', emoji: '🎵', bg: 'bg-blue-50' },
  ];

  return (
    <div className="relative mx-auto h-[620px] w-[300px]">
      <div className="absolute inset-0 rounded-[52px] bg-gradient-to-b from-neutral-700 to-neutral-800 p-[3px] shadow-2xl">
        <div className="h-full w-full rounded-[49px] bg-neutral-900 p-3">
          {/* Dynamic Island */}
          <div className="absolute left-1/2 top-4 z-10 h-[26px] w-[100px] -translate-x-1/2 rounded-full bg-black" />

          {/* Screen */}
          <div className="h-full w-full overflow-hidden rounded-[40px] bg-gradient-to-b from-[#FAF7F2] to-white">
            {/* Status bar */}
            <div className="flex items-center justify-between px-7 pt-[14px]">
              <span className="text-[11px] font-semibold text-dark">21:00</span>
              <div className="flex items-center gap-1.5 text-[10px] text-dark">
                <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
                  <rect x="1" y="11" width="2" height="4" rx="0.5" opacity="1" />
                  <rect x="5" y="8" width="2" height="7" rx="0.5" opacity="1" />
                  <rect x="9" y="5" width="2" height="10" rx="0.5" opacity="1" />
                  <rect x="13" y="2" width="2" height="13" rx="0.5" opacity="0.3" />
                </svg>
                <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 3C5.5 3 3.3 4 1.8 5.6L0.4 4.2C2.3 2.3 4.9 1 8 1s5.7 1.3 7.6 3.2L14.2 5.6C12.7 4 10.5 3 8 3zm0 4c-1.3 0-2.5.5-3.4 1.4L3.2 7C4.5 5.8 6.2 5 8 5s3.5.8 4.8 2L11.4 8.4C10.5 7.5 9.3 7 8 7zm0 4c-.6 0-1.1.2-1.5.6L8 13.2l1.5-1.6c-.4-.4-.9-.6-1.5-.6z" />
                </svg>
                <svg className="h-4 w-4" viewBox="0 0 20 12" fill="currentColor">
                  <rect x="0" y="1" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="1" fill="none" />
                  <rect x="2" y="3" width="10" height="6" rx="1" />
                  <rect x="17" y="4" width="2" height="4" rx="0.5" />
                </svg>
              </div>
            </div>

            {/* App content */}
            <div className="mt-2 px-4">
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 w-1.5 rounded-full bg-primary-500" />
                <span className="text-[11px] font-medium text-neutral-600">
                  Cocody, Abidjan
                </span>
              </div>

              <div className="mt-2.5 flex items-center rounded-xl bg-neutral-100 px-3 py-2">
                <svg
                  className="mr-2 h-3.5 w-3.5 text-neutral-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" strokeLinecap="round" />
                </svg>
                <span className="text-[11px] text-neutral-400">
                  Sortie avec 15 000 FCFA ?
                </span>
              </div>

              {/* Category pills */}
              <div className="mt-3 flex gap-1.5">
                {[
                  { label: 'Maquis', active: true },
                  { label: 'Restos', active: false },
                  { label: 'Soirée', active: false },
                  { label: 'Events', active: false },
                ].map((c) => (
                  <span
                    key={c.label}
                    className={`rounded-full px-2.5 py-1 text-[9px] font-semibold ${
                      c.active
                        ? 'bg-primary-500 text-white'
                        : 'bg-neutral-100 text-neutral-600'
                    }`}
                  >
                    {c.label}
                  </span>
                ))}
              </div>

              {/* Venue cards */}
              <div className="mt-3 space-y-2">
                {venues.map((v) => (
                  <div
                    key={v.name}
                    className="flex items-center gap-2.5 rounded-2xl bg-white p-2.5 shadow-sm ring-1 ring-neutral-100"
                  >
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-xl text-sm ${v.bg}`}
                    >
                      {v.emoji}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-dark">{v.name}</span>
                        <span className="text-[10px] font-semibold text-warning">
                          ★ {v.rating}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between">
                        <span className="text-[9px] text-neutral-400">{v.cat}</span>
                        <span className="text-[9px] font-medium text-neutral-500">
                          {v.price}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Bottom CTA */}
              <div className="mt-3 rounded-2xl bg-gradient-to-r from-primary-500 to-primary-600 py-2.5 text-center shadow-lg shadow-primary-500/25">
                <span className="text-[11px] font-bold text-white">
                  Réserver une table
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */
/*  SVG ICONS                                                    */
/* ────────────────────────────────────────────────────────────── */

function ArrowIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={`h-5 w-5 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <circle cx="11" cy="11" r="8" />
      <path strokeLinecap="round" d="m21 21-4.3-4.3" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path strokeLinecap="round" d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function IconShield() {
  return (
    <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
      />
    </svg>
  );
}

function IconMap() {
  return (
    <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
      />
    </svg>
  );
}

function IconWallet() {
  return (
    <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3"
      />
    </svg>
  );
}

function IconTicket() {
  return (
    <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z"
      />
    </svg>
  );
}

function IconQuote() {
  return (
    <svg className="h-10 w-10" viewBox="0 0 40 40" fill="currentColor">
      <path d="M10.7 27.3c-2.4 0-4.3-.8-5.8-2.3C3.3 23.4 2.5 21.5 2.5 19.1c0-3.1 1-5.8 3.1-8.1C7.7 8.7 10.4 7 13.8 6l1.3 2.7c-2.4.8-4.2 2-5.4 3.5-1.2 1.5-1.8 3.1-1.8 4.6.3-.1.7-.1 1.2-.1 1.8 0 3.3.6 4.5 1.8 1.2 1.2 1.8 2.7 1.8 4.5 0 1.8-.6 3.3-1.9 4.5-1.2 1.2-2.8 1.8-4.8 1.8zm20 0c-2.4 0-4.3-.8-5.8-2.3-1.5-1.6-2.2-3.5-2.2-5.9 0-3.1 1-5.8 3.1-8.1C27.7 8.7 30.4 7 33.8 6l1.3 2.7c-2.4.8-4.2 2-5.4 3.5-1.2 1.5-1.8 3.1-1.8 4.6.3-.1.7-.1 1.2-.1 1.8 0 3.3.6 4.5 1.8 1.2 1.2 1.8 2.7 1.8 4.5 0 1.8-.6 3.3-1.9 4.5-1.2 1.2-2.8 1.8-4.8 1.8z" />
    </svg>
  );
}

function IconApple() {
  return (
    <svg className="h-8 w-8" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

function IconPlayStore() {
  return (
    <svg className="h-8 w-8" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.198l2.807 1.626a1 1 0 010 1.73l-2.808 1.626L15.206 12l2.492-2.491zM5.864 2.658L16.802 8.99l-2.303 2.303-8.635-8.635z" />
    </svg>
  );
}

/**
 * Petit puck check utilisé dans la section Premium pour les bullets
 * d'avantages. Trois tons selon le plan affiché.
 */
function Check({ tone = 'orange' }: { tone?: 'orange' | 'blue' | 'gold' }) {
  const cls =
    tone === 'blue'
      ? 'bg-gradient-to-br from-blue-500 to-purple-600'
      : tone === 'gold'
      ? 'bg-gradient-to-br from-amber-400 to-amber-600'
      : 'bg-primary-500/20';
  const icon = tone === 'orange' ? 'text-primary-400' : 'text-white';
  return (
    <span className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${cls}`}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className={icon}>
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </span>
  );
}
