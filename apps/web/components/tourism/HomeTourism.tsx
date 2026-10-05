import Link from 'next/link';
import { LOYALTY_LEVEL_BY_CODE } from '@soutra/shared';
import { listDestinations, listTrips } from '@/lib/tourism';
import { listActivities } from '@/lib/activities';
import { getI18n } from '@/lib/i18n/server';
import { listPublicOffers } from '@/lib/offers';
import { vibeCounts, latestReviews } from '@/lib/home';
import { VIBES, FALLBACK_DESTINATIONS } from '@/lib/home-visuals';
import type { TKey } from '@/lib/i18n/t';
import { OfferCard } from './Offers';
import { DestinationCardView, TripCardView, ActivityCardView } from './Cards';
import { RecentlyViewed } from './RecentlyViewed';
import { HomeHero } from '@/components/home/HomeHero';
import { Reveal } from '@/components/home/Reveal';
import { NearMeButton } from '@/components/home/NearMe';
import { SectionHeading, Stars, PinLine } from '@/components/home/Sections';

const Img = ({ src, className = '' }: { src: string; className?: string }) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img src={src} alt="" loading="lazy" decoding="async" className={className} />
);

/** Page d'accueil V2 : hero → envies → destinations → expériences → carte → assistant → avis → fidélité → premium. */
export async function HomeTourism() {
  const { t, tn, lp } = getI18n();
  const [destinations, trips, acts, offers, counts, reviews] = await Promise.all([
    listDestinations({ featured: true, limit: 6 }),
    listTrips({ scope: 'national', limit: 3 }),
    listActivities({ limit: 4, sort: 'popular' }),
    listPublicOffers(3),
    vibeCounts(),
    latestReviews(3),
  ]);
  const gold = LOYALTY_LEVEL_BY_CODE.gold;
  const silver = LOYALTY_LEVEL_BY_CODE.silver;

  return (
    <>
      <HomeHero />
      <RecentlyViewed />

      {/* ── Que voulez-vous vivre ? ─────────────────────────────── */}
      <section aria-labelledby="vibes" className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
        <Reveal><SectionHeading id="vibes" title={t('home2.vibesTitle')} sub={t('home2.vibesSub')} /></Reveal>
        <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {VIBES.map((v, k) => {
            const n = counts[v.key] ?? 0;
            return (
              <li key={v.key}>
                <Reveal delay={(k % 3) * 70} className="h-full">
                  <Link href={lp(v.href)} className="group relative block aspect-[16/10] overflow-hidden rounded-3xl bg-neutral-200 sm:aspect-[4/3]">
                    <Img src={v.image} className="h-full w-full object-cover transition duration-700 group-hover:scale-105 motion-reduce:transition-none" />
                    <div className="absolute inset-0 bg-gradient-to-t from-night/85 via-night/20 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                      <p className="flex items-center gap-2 text-xs font-semibold text-white/80"><span aria-hidden>{v.emoji}</span>{n > 0 && tn('home2.vibeCount', n)}</p>
                      <h3 className="mt-1 font-display text-xl font-extrabold uppercase tracking-tight">{t(`home2.vibe.${v.key}.title` as TKey)}</h3>
                      <p className="mt-1 line-clamp-2 text-sm text-white/80">{t(`home2.vibe.${v.key}.desc` as TKey)}</p>
                      <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-primary-300">{t('home2.discover')}
                        <svg aria-hidden className="transition-transform group-hover:translate-x-1 motion-reduce:transition-none" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                      </span>
                    </div>
                    <span aria-hidden className="absolute left-0 top-6 h-8 w-1 rounded-r-full bg-primary-500" />
                  </Link>
                </Reveal>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ── Destinations du moment ──────────────────────────────── */}
      <section aria-labelledby="moment" className="bg-white py-14 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal><SectionHeading id="moment" eyebrow={t('nav.destinations')} title={t('home2.momentTitle')} sub={t('home2.momentSub')} action={{ href: lp('/destinations'), label: t('common.seeAll') }} /></Reveal>
          <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            {destinations.length > 0
              ? destinations.map((d, k) => <Reveal key={d.id} delay={k * 50}><DestinationCardView destination={d} /></Reveal>)
              : FALLBACK_DESTINATIONS.map((d, k) => (
                <Reveal key={d.key} delay={k * 50}>
                  <Link href={lp(`/explorer?city=${encodeURIComponent(d.city)}`)} aria-label={t('home2.exploreCity', { city: d.city })} className="group relative block aspect-[3/4] overflow-hidden rounded-2xl bg-neutral-200 shadow-sm">
                    <Img src={d.image} className="h-full w-full object-cover transition duration-700 group-hover:scale-105 motion-reduce:transition-none" />
                    <div className="absolute inset-0 bg-gradient-to-t from-night/80 via-night/10 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-3.5 text-white">
                      <h3 className="font-display text-lg font-extrabold">{d.city}</h3>
                      <p className="text-xs text-white/80">{t(`home2.slide.${d.key}.tags` as TKey)}</p>
                    </div>
                  </Link>
                </Reveal>
              ))}
          </div>
        </div>
      </section>

      {/* ── Expériences à ne pas manquer ────────────────────────── */}
      {(offers.length > 0 || acts.items.length > 0 || trips.length > 0) && (
        <section aria-labelledby="exp" className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          <Reveal><SectionHeading id="exp" eyebrow={t('nav.activities')} title={t('home2.experiencesTitle')} sub={t('home2.experiencesSub')} action={{ href: lp('/activites'), label: t('common.seeAll') }} /></Reveal>
          {offers.length > 0 && (
            <div className="mt-8 grid gap-4 md:grid-cols-3">{offers.map((o) => <OfferCard key={o.id} offer={o} withTarget />)}</div>
          )}
          {acts.items.length > 0 && (
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{acts.items.map((a, k) => <Reveal key={a.id} delay={k * 60}><ActivityCardView activity={a} /></Reveal>)}</div>
          )}
          {trips.length > 0 && (
            <>
              <h3 className="mt-12 font-display text-xl font-extrabold text-night">{t('home2.tripsTitle')}</h3>
              <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{trips.map((x, k) => <Reveal key={x.id} delay={k * 60}><TripCardView trip={x} /></Reveal>)}</div>
            </>
          )}
        </section>
      )}

      {/* ── Explorer autour de vous (carte) ─────────────────────── */}
      <section aria-labelledby="map" className="bg-night py-14 text-white sm:py-20">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
          <Reveal>
            <SectionHeading id="map" tone="dark" eyebrow={t('home2.mapNear')} title={t('home2.mapTitle')} sub={t('home2.mapSub')} />
            <ul className="mt-6 flex flex-wrap gap-2" aria-label={t('home2.mapNear')}>
              {([['hotels', '🏨'], ['restaurants', '🍽️'], ['plages', '🏖️'], ['activites', '🎭'], ['sites', '🌴'], ['bars', '🍸']] as const).map(([k, e]) => (
                <li key={k}>
                  <Link href={lp(k === 'activites' ? '/activites' : `/explorer?cat=${k}&view=map`)} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-3.5 text-sm font-medium text-white/90 transition hover:border-primary-400 hover:bg-white/10">
                    <span aria-hidden>{e}</span>{t(`home2.mapLayers.${k}` as TKey)}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm font-semibold text-primary-300">{t('home2.mapRadius')}</p>
            <div className="mt-3">
              <NearMeButton className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-primary-500 px-7 py-3 font-bold text-night shadow-lg shadow-primary-500/30 transition hover:bg-primary-400 disabled:opacity-70 active:scale-[0.98]" />
            </div>
          </Reveal>
          {/* Aperçu de carte stylisé (aucune librairie de carte chargée sur l'accueil → page rapide) */}
          <Reveal delay={100}>
            <Link href={lp('/explorer?view=map')} aria-label={t('home2.mapCta')} className="relative block aspect-[4/3] overflow-hidden rounded-3xl border border-white/10 bg-[#0b1220]">
              <svg aria-hidden className="absolute inset-0 h-full w-full" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice">
                <defs><pattern id="g" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M28 0H0V28" fill="none" stroke="rgba(255,255,255,.06)" /></pattern></defs>
                <rect width="400" height="300" fill="url(#g)" />
                <path d="M-10 220C80 190 120 240 200 200S320 120 410 150" fill="none" stroke="rgba(255,107,26,.5)" strokeWidth="2.5" strokeDasharray="6 6" />
                <path d="M40 -10C70 80 130 110 150 190S200 290 230 310" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="6" />
                <path d="M-10 90C90 70 190 110 300 70S390 40 410 50" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="5" />
              </svg>
              {[['18%', '30%', '🏨'], ['42%', '58%', '🍽️'], ['66%', '26%', '🏖️'], ['78%', '64%', '🎭'], ['30%', '78%', '🌴']].map(([x, y, e]) => (
                <span key={`${x}${y}`} aria-hidden className="absolute flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-base shadow-lg ring-2 ring-primary-500/60" style={{ left: x, top: y }}>{e}</span>
              ))}
              <span aria-hidden className="absolute left-[50%] top-[44%] -translate-x-1/2 -translate-y-1/2"><span className="block h-4 w-4 rounded-full bg-primary-500 ring-8 ring-primary-500/25 motion-safe:animate-glow-pulse" /></span>
              <span className="absolute bottom-3 left-3 rounded-full bg-night/80 px-3 py-1.5 text-xs font-semibold backdrop-blur">{t('home2.mapRadius')}</span>
            </Link>
          </Reveal>
        </div>
      </section>

      {/* ── Assistant Soutra ────────────────────────────────────── */}
      <section aria-labelledby="ai" className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
        <Reveal>
          <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-night via-[#1a2540] to-night p-6 text-white sm:p-12">
            <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary-500/20 blur-3xl" />
            <div className="relative grid items-center gap-8 lg:grid-cols-[1.1fr_1fr]">
              <div>
                <p className="inline-flex items-center gap-2 rounded-full border border-primary-400/40 bg-primary-500/10 px-3.5 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-primary-200"><span aria-hidden>✦</span>{t('home2.aiBadge')}</p>
                <h2 id="ai" className="mt-4 font-display text-3xl font-extrabold leading-tight sm:text-4xl">{t('home2.aiTitle')} <span className="text-primary-400">{t('home2.aiTitleB')}</span></h2>
                <p className="mt-3 max-w-lg text-white/75">{t('home2.aiSub')}</p>
                <Link href={lp('/assistant')} className="mt-6 inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-primary-500 px-7 py-3 font-bold text-night shadow-lg shadow-primary-500/30 transition hover:bg-primary-400 active:scale-[0.98]"><span aria-hidden>✦</span>{t('home2.aiCta')}</Link>
              </div>
              <ul className="grid gap-2.5" aria-label={t('assistant.suggestions')}>
                {(['aiS1', 'aiS2', 'aiS3', 'aiS4'] as const).map((k) => (
                  <li key={k}>
                    <Link href={lp(`/assistant?q=${encodeURIComponent(t(`home2.${k}` as TKey))}`)} className="flex min-h-[48px] items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white/90 transition hover:border-primary-400/60 hover:bg-white/10">
                      <span aria-hidden className="text-primary-400">“</span><span>{t(`home2.${k}` as TKey)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── Preuve sociale (avis réels uniquement) ──────────────── */}
      {reviews.length > 0 && (
        <section aria-labelledby="proof" className="bg-white py-14 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <Reveal><SectionHeading id="proof" eyebrow="★" title={t('home2.proofTitle')} sub={t('home2.proofSub')} /></Reveal>
            <ul className="mt-8 grid gap-5 md:grid-cols-3">
              {reviews.map((r, k) => (
                <li key={r.id}>
                  <Reveal delay={k * 70} className="h-full">
                    <figure className="flex h-full flex-col rounded-3xl border border-neutral-200 bg-light p-6">
                      <Stars value={r.rating} />
                      <blockquote className="mt-3 flex-1 text-[15px] leading-relaxed text-neutral-800">« {r.comment} »</blockquote>
                      <figcaption className="mt-4 text-sm"><span className="font-bold text-night">{r.author}</span>
                        <Link href={lp(`/activites/${r.slug}`)} className="block text-neutral-600 hover:text-primary-700">{t('home2.proofOn', { title: r.title })}</Link>
                      </figcaption>
                    </figure>
                  </Reveal>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* ── Fidélité ────────────────────────────────────────────── */}
      <section aria-labelledby="loyalty" className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <Reveal>
            <SectionHeading id="loyalty" eyebrow={t('home2.loyaltyBadge')} title={t('home2.loyaltyTitle')} sub={t('home2.loyaltySub')} />
            <Link href={lp('/loyalty')} className="mt-6 inline-flex min-h-[48px] items-center justify-center rounded-full bg-night px-7 py-3 font-bold text-white transition hover:bg-neutral-800 active:scale-[0.98]">{t('home2.loyaltyCta')}</Link>
          </Reveal>
          <Reveal delay={100}>
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-night to-[#243350] p-6 text-white shadow-xl sm:p-8" role="group" aria-label={t('home2.loyaltyExample')}>
              <div aria-hidden className="absolute -right-10 -top-10 h-40 w-40 rounded-full border border-primary-400/30" />
              <div aria-hidden className="absolute -right-4 -top-4 h-24 w-24 rounded-full border border-primary-400/30" />
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary-300">{t('home2.loyaltyBadge')}</p>
                  <p className="mt-1 text-xs text-white/60">{t('home2.loyaltyExample')}</p>
                </div>
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold">{silver.emoji} {t('home2.loyaltyLevel')} {silver.label}</span>
              </div>
              <p className="mt-6 font-display text-4xl font-extrabold tabular-nums">{t('home2.loyaltyPoints', { n: '4 000' })}</p>
              <div className="mt-4" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={80} aria-label={t('home2.loyaltyNext', { n: '1 000' })}>
                <div className="h-2.5 overflow-hidden rounded-full bg-white/15"><div className="h-full w-[80%] rounded-full bg-gradient-to-r from-primary-500 to-amber-400" /></div>
                <div className="mt-2 flex justify-between text-xs text-white/70"><span>80 %</span><span>{gold.emoji} {gold.label}</span></div>
              </div>
              <p className="mt-4 text-sm text-white/85">{t('home2.loyaltyNext', { n: '1 000' })}</p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Premium ─────────────────────────────────────────────── */}
      <section aria-labelledby="premium-home" className="bg-white py-14 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="text-center">
              <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-primary-700"><PinLine />{t('home2.premiumBadge')}<PinLine className="rotate-180" /></p>
              <h2 id="premium-home" className="mx-auto mt-3 max-w-2xl font-display text-3xl font-extrabold leading-tight text-night sm:text-4xl">
                {t('home2.premiumTitleA')}<br className="hidden sm:block" /> {t('home2.premiumTitleB')}<br className="hidden sm:block" /> <span className="text-primary-700">{t('home2.premiumTitleC')}</span>
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-neutral-600">{t('home2.premiumSub')}</p>
            </div>
          </Reveal>
          <ul className="mt-10 grid gap-4 md:grid-cols-3">
            {([['1', '🏷️'], ['2', '⭐'], ['3', '⚡']] as const).map(([n, e], k) => (
              <li key={n}>
                <Reveal delay={k * 70} className="h-full">
                  <div className="h-full rounded-3xl border border-neutral-200 bg-light p-6 transition hover:border-primary-300 hover:shadow-lg">
                    <span aria-hidden className="flex h-11 w-11 items-center justify-center rounded-2xl bg-night text-lg">{e}</span>
                    <h3 className="mt-4 font-display text-lg font-extrabold text-night">{t(`home2.perk${n}` as TKey)}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">{t(`home2.perk${n}d` as TKey)}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ul>
          <div className="mt-8 text-center">
            <Link href={lp('/subscribe')} className="inline-flex min-h-[48px] items-center justify-center rounded-full border-2 border-night px-8 py-3 font-bold text-night transition hover:bg-night hover:text-white active:scale-[0.98]">{t('home2.premiumCta')}</Link>
          </div>
        </div>
      </section>
    </>
  );
}
