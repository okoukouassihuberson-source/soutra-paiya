'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { CI_CITIES } from '@soutra/shared';
import { HERO_SLIDES } from '@/lib/home-visuals';
import { useI18n } from '@/lib/i18n/client';
import type { TKey } from '@/lib/i18n/t';

const INTERVAL_MS = 6500;

/** Hero immersif : diaporama doux (pause possible, immobile si prefers-reduced-motion) + recherche flottante. */
export function HomeHero() {
  const { t, lp } = useI18n();
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [ph, setPh] = useState(0);
  const examples = t('home2.search.whatExamples').split('|');
  const hover = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    on(); mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  useEffect(() => {
    if (paused || reduced) return;
    const id = setInterval(() => { if (!hover.current && !document.hidden) setI((n) => (n + 1) % HERO_SLIDES.length); }, INTERVAL_MS);
    return () => clearInterval(id);
  }, [paused, reduced]);
  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setPh((n) => (n + 1) % examples.length), 3200);
    return () => clearInterval(id);
  }, [reduced, examples.length]);

  const slide = HERO_SLIDES[i];
  const pad = (n: number) => String(n).padStart(2, '0');
  const field = 'w-full rounded-xl border-0 bg-neutral-50 px-3.5 py-3 text-base text-dark placeholder:text-neutral-500 focus:ring-2 focus:ring-primary-500';

  return (
    <section className="relative isolate overflow-hidden bg-night text-white" aria-roledescription="carousel" aria-label="Soutra-Playce">
      {/* Visuels : un seul chargé en priorité, les autres en lazy ; fondu enchaîné GPU (opacity) */}
      <div className="absolute inset-0 -z-10" aria-hidden>
        {HERO_SLIDES.map((s, k) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={s.key} src={s.image} alt="" decoding="async" loading={k === 0 ? 'eager' : 'lazy'} fetchPriority={k === 0 ? 'high' : 'auto'}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-[1400ms] ease-out ${k === i ? 'opacity-100' : 'opacity-0'}`} />
        ))}
        <div className="absolute inset-0 bg-gradient-to-r from-night/90 via-night/55 to-night/20" />
        <div className="absolute inset-0 bg-gradient-to-t from-night via-transparent to-night/40" />
      </div>

      <div className="mx-auto flex max-w-7xl flex-col justify-center px-4 pb-24 pt-24 sm:min-h-[88svh] sm:px-6 sm:pb-24 sm:pt-28 lg:px-8 lg:pt-32">
        <p className="inline-flex w-fit items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white backdrop-blur sm:text-xs">
          {t('home2.badge')}
        </p>
        <h1 className="mt-4 max-w-3xl font-display text-[2.125rem] font-extrabold uppercase leading-[1.04] tracking-tight sm:text-6xl lg:text-7xl">
          {t('home2.titleA')}<br />
          <span className="text-primary-400">{t('home2.titleB')}</span><br />
          {t('home2.titleC')}
        </h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-white/85 sm:mt-5 sm:text-lg">{t('home2.subtitle')}</p>

        <div className="mt-5 flex flex-col gap-3 sm:mt-7 sm:flex-row">
          <Link href={lp('/explorer')} className="group relative inline-flex min-h-[48px] items-center justify-center gap-2 overflow-hidden rounded-full bg-primary-500 px-7 py-3 font-bold text-night shadow-lg shadow-primary-500/30 transition hover:bg-primary-400 active:scale-[0.98]">
            <span aria-hidden className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full motion-reduce:hidden" />
            <span className="relative">{t('home2.ctaExplore')}</span>
            <svg aria-hidden className="relative transition-transform group-hover:translate-x-1 motion-reduce:transition-none" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </Link>
          <Link href={lp('/destinations')} className="hidden min-h-[48px] items-center justify-center rounded-full border border-white/35 bg-white/10 px-7 py-3 font-semibold text-white backdrop-blur transition hover:bg-white/20 active:scale-[0.98] sm:inline-flex">
            {t('home2.ctaDestinations')}
          </Link>
        </div>

        {/* Recherche flottante */}
        <form action={lp('/explorer')} method="get" role="search"
          onMouseEnter={() => { hover.current = true; }} onMouseLeave={() => { hover.current = false; }} onFocus={() => { hover.current = true; }} onBlur={() => { hover.current = false; }}
          className="mt-6 grid grid-cols-2 gap-2 rounded-2xl bg-white p-2 text-dark shadow-2xl shadow-black/30 sm:mt-9 sm:grid-cols-4 lg:grid-cols-[1.5fr_1fr_0.8fr_0.8fr_auto]">
          <label className="col-span-2 block sm:col-span-4 lg:col-span-1">
            <span className="sr-only">{t('home2.search.what')}</span>
            <input name="q" list="home-suggest" autoComplete="off" maxLength={80} placeholder={examples[ph]} aria-label={t('home2.search.what')} className={field} />
          </label>
          <label className="col-span-2 block lg:col-span-1">
            <span className="sr-only">{t('home2.search.where')}</span>
            <input name="city" list="home-cities" autoComplete="off" maxLength={60} placeholder={`📍 ${t('home2.search.wherePh')}`} aria-label={t('home2.search.where')} className={field} />
          </label>
          <label className="block rounded-xl bg-neutral-50 focus-within:ring-2 focus-within:ring-primary-500">
            <span className="block px-3.5 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-600">{t('home2.search.arrival')}</span>
            <input name="check_in" type="date" title={t('home2.search.dateHint')} className="w-full rounded-xl border-0 bg-transparent px-3.5 pb-2 pt-0.5 text-base text-dark focus:ring-0" />
          </label>
          <label className="block rounded-xl bg-neutral-50 focus-within:ring-2 focus-within:ring-primary-500">
            <span className="block px-3.5 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-600">{t('home2.search.departure')}</span>
            <input name="check_out" type="date" title={t('home2.search.dateHint')} className="w-full rounded-xl border-0 bg-transparent px-3.5 pb-2 pt-0.5 text-base text-dark focus:ring-0" />
          </label>
          <button type="submit" className="min-h-[48px] rounded-xl bg-night px-7 py-3 font-bold text-white transition hover:bg-neutral-800 active:scale-[0.98] col-span-2 sm:col-span-4 lg:col-span-1">
            {t('home2.search.submit')}
          </button>
          <datalist id="home-suggest">{examples.map((e) => <option key={e} value={e} />)}</datalist>
          <datalist id="home-cities">{CI_CITIES.map((c) => <option key={c} value={c} />)}</datalist>
        </form>

        {/* Parcours */}
        <ol className="mt-5 hidden flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold uppercase tracking-wider text-white/70 sm:flex" aria-hidden>
          {(['discover', 'search', 'book', 'enjoy'] as const).map((k, n) => (
            <li key={k} className="flex items-center gap-3">
              {n > 0 && <span className="h-px w-6 bg-primary-400/70" />}
              <span><span className="text-primary-300">{n + 1}</span> {t(`home2.steps.${k}` as TKey)}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Légende du visuel (style magazine) */}
      <div className="absolute inset-x-0 bottom-0 border-t border-white/10 bg-night/40 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div aria-live={paused || reduced ? 'off' : 'polite'} className="min-w-0">
            <p className="truncate text-sm font-bold">
              <span className="mr-2 font-mono text-primary-300">{pad(i + 1)} / {pad(HERO_SLIDES.length)}</span>
              <span className="uppercase tracking-wide">{t(`home2.slide.${slide.key}.name` as TKey)}</span>
            </p>
            <p className="truncate text-xs text-white/70">{t(`home2.slide.${slide.key}.tags` as TKey)}</p>
          </div>
          <div className="flex items-center gap-1.5">
            {HERO_SLIDES.map((s, k) => (
              <button key={s.key} type="button" onClick={() => setI(k)} aria-label={t('home2.slideOf', { n: k + 1, total: HERO_SLIDES.length })} aria-current={k === i}
                className="group flex h-8 w-6 items-center justify-center">
                <span className={`h-1 rounded-full transition-all ${k === i ? 'w-6 bg-primary-400' : 'w-3 bg-white/40 group-hover:bg-white/70'}`} />
              </button>
            ))}
            {!reduced && (
              <button type="button" onClick={() => setPaused((p) => !p)} aria-pressed={paused} aria-label={paused ? t('home2.slidePlay') : t('home2.slidePause')}
                className="ml-2 flex h-8 w-8 items-center justify-center rounded-full border border-white/25 text-white/80 hover:bg-white/10">
                <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="currentColor">{paused ? <path d="M7 4v16l13-8z" /> : <path d="M6 4h4v16H6zM14 4h4v16h-4z" />}</svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
