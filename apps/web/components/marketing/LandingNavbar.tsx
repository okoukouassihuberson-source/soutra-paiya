'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import { supabaseBrowser } from '@/lib/supabase';
import { BrandMark } from '@/components/layout/BrandMark';
import { CommandPalette } from '@/components/search/CommandPalette';
import { LanguageSwitcher } from '@/components/tourism/LanguageSwitcher';
import { useI18n } from '@/lib/i18n/client';

/**
 * En-tête de la page d'accueil : 1 logo, 5 liens, langue, connexion, 1 CTA.
 * Transparent sur le hero, il devient blanc translucide + plus compact après 24 px de scroll.
 */
export function LandingNavbar() {
  const { t, lp, locale } = useI18n();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const sb = supabaseBrowser();
    sb.auth.getSession().then(({ data }) => { if (!cancelled) setAuthed(!!data.session); });
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => setAuthed(!!session));
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey); };
  }, [open]);

  const links = [
    { href: lp('/explorer'), label: t('nav.explore') },
    { href: lp('/destinations'), label: t('nav.destinations') },
    { href: lp('/activites'), label: t('nav.activities') },
    { href: lp('/voyages/nationaux'), label: t('nav.trips') },
    ...(locale === 'fr' ? [{ href: '#how', label: t('home2.nav.how') }] : []), // section marketing disponible en français
  ];
  const light = scrolled || open; // texte sombre sur fond clair
  const account = authed
    ? { href: lp('/account'), label: t('nav.myAccount') }
    : { href: lp('/login'), label: t('home2.nav.signIn') };

  return (
    <>
      <header
        className={cn(
          'fixed inset-x-0 top-0 z-50 transition-all duration-300',
          scrolled ? 'border-b border-neutral-200/70 bg-white/85 shadow-sm backdrop-blur-xl' : 'border-b border-transparent bg-transparent',
        )}
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className={cn('mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 transition-all duration-300 sm:px-6 lg:px-8', scrolled ? 'h-14' : 'h-16 lg:h-[72px]')}>
          <Link href={lp('/')} onClick={() => setOpen(false)} className="flex min-h-[44px] shrink-0 items-center gap-2 font-display text-lg font-extrabold tracking-tight">
            <BrandMark size="xs" decorative />
            <span className={light ? 'text-night' : 'text-white'}>Soutra<span className="text-primary-500">-Playce</span></span>
          </Link>

          <nav aria-label={t('nav.main')} className="hidden items-center gap-1 xl:flex">
            {links.map((l) => (
              <a key={l.href} href={l.href}
                className={cn('relative whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-medium transition-colors after:absolute after:inset-x-3.5 after:bottom-1 after:h-0.5 after:origin-left after:scale-x-0 after:rounded-full after:bg-primary-500 after:transition-transform hover:after:scale-x-100 motion-reduce:after:transition-none',
                  light ? 'text-neutral-700 hover:text-night' : 'text-white/85 hover:text-white')}>
                {l.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <CommandPalette />
            <LanguageSwitcher tone={light ? 'light' : 'dark'} className="hidden sm:inline-flex" />
            <Link href={account.href} className={cn('hidden whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-semibold transition-colors sm:inline-flex', light ? 'text-neutral-700 hover:bg-neutral-100' : 'text-white hover:bg-white/10')}>
              {account.label}
            </Link>
            <Link href={lp('/explorer')} className="hidden min-h-[40px] items-center whitespace-nowrap rounded-full bg-primary-500 px-5 text-sm font-bold text-night shadow-md shadow-primary-500/25 transition hover:bg-primary-400 active:scale-[0.97] sm:inline-flex">
              {t('home2.nav.explore')}
            </Link>
            <button type="button" aria-label={open ? t('home2.nav.close') : t('home2.nav.menu')} aria-expanded={open} aria-controls="home-menu" onClick={() => setOpen((v) => !v)}
              className={cn('-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-full transition xl:hidden', light ? 'text-night hover:bg-neutral-100' : 'text-white hover:bg-white/10')}>
              <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                {open ? <path d="M18 6 6 18M6 6l12 12" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
              </svg>
            </button>
          </div>
        </div>
      </header>

      {open && (
        <div id="home-menu" role="dialog" aria-modal="true" aria-label={t('home2.nav.menu')} className="fixed inset-0 z-40 xl:hidden">
          <button type="button" aria-label={t('home2.nav.close')} onClick={() => setOpen(false)} className="absolute inset-0 animate-sheet-fade bg-night/60 backdrop-blur-sm" />
          <nav className="absolute inset-x-0 top-0 animate-sheet-slide-up rounded-b-3xl bg-white px-5 pb-6 shadow-2xl" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 72px)' }}>
            <ul className="space-y-1">
              {links.map((l) => (
                <li key={l.href}><a href={l.href} onClick={() => setOpen(false)} className="block rounded-xl px-4 py-3.5 text-base font-semibold text-night hover:bg-neutral-100">{l.label}</a></li>
              ))}
              <li><Link href={account.href} onClick={() => setOpen(false)} className="block rounded-xl px-4 py-3.5 text-base font-semibold text-night hover:bg-neutral-100">{account.label}</Link></li>
              <li className="flex justify-center pt-3 sm:hidden"><LanguageSwitcher /></li>
              <li className="pt-2"><Link href={lp('/explorer')} onClick={() => setOpen(false)} className="flex min-h-[48px] items-center justify-center rounded-full bg-primary-500 px-6 py-3 font-bold text-night">{t('home2.nav.explore')}</Link></li>
            </ul>
          </nav>
        </div>
      )}
    </>
  );
}
