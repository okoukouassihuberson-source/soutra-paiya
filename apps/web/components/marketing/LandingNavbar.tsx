'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/cn';

/**
 * Navbar marketing — fixed-top sur dark hero, burger menu mobile.
 *
 * Comportements :
 *   • shadow/bg renforcé après scroll (>30px) pour rester lisible sur sections claires
 *   • menu mobile s'ouvre en panel plein écran, ferme à la navigation ou tap backdrop
 *   • lock du scroll body quand le menu mobile est ouvert
 *   • bouton « Installer » apparaît sur mobile si l'app n'est pas déjà en standalone
 *     (l'install PWA effectif est piloté par <PWAInstallPrompt> dans le layout)
 */
export function LandingNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      <nav
        className={cn(
          'fixed inset-x-0 top-0 z-50 border-b backdrop-blur-2xl transition-all duration-200',
          scrolled
            ? 'border-white/[0.08] bg-dark/90 shadow-xl shadow-black/30'
            : 'border-white/[0.06] bg-dark/70',
        )}
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
          <Link
            href="/"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 font-display text-lg font-bold tracking-tight sm:text-xl"
          >
            <span
              aria-hidden
              className="flex h-7 w-7 items-center justify-center rounded-lg text-xs font-extrabold text-white shadow-sm"
              style={{ background: 'linear-gradient(135deg,#FF6B1A,#E5500D)' }}
            >
              SP
            </span>
            <span>
              <span className="text-white">Soutra</span>
              <span className="text-primary-400">-Playce</span>
            </span>
          </Link>

          <div className="hidden items-center gap-8 md:flex">
            <a href="#how" className="text-sm text-neutral-400 transition hover:text-white">
              Comment ça marche
            </a>
            <a href="#features" className="text-sm text-neutral-400 transition hover:text-white">
              Fonctionnalités
            </a>
            <Link href="/pro" className="text-sm text-neutral-400 transition hover:text-white">
              Espace Pro
            </Link>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/login"
              className="hidden rounded-lg px-4 py-2 text-sm font-medium text-neutral-300 transition hover:bg-white/5 hover:text-white sm:block"
            >
              Se connecter
            </Link>
            <a
              href="#download"
              className="hidden rounded-full bg-primary-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-primary-500/20 transition hover:bg-primary-600 hover:shadow-primary-500/40 sm:inline-flex"
            >
              Télécharger
            </a>

            {/* Burger mobile */}
            <button
              type="button"
              aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
              aria-expanded={open}
              aria-controls="landing-mobile-menu"
              onClick={() => setOpen((v) => !v)}
              className="-mr-1 inline-flex h-10 w-10 items-center justify-center rounded-lg text-neutral-300 transition hover:bg-white/5 hover:text-white md:hidden"
            >
              {open ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile panel — slide-down depuis sous la navbar */}
      {open && (
        <div
          id="landing-mobile-menu"
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-40 md:hidden"
        >
          <button
            type="button"
            aria-label="Fermer le menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 animate-sheet-fade bg-black/60 backdrop-blur-sm"
          />
          <nav
            className="absolute inset-x-0 top-0 animate-sheet-slide-up rounded-b-3xl border-b border-white/10 bg-dark/95 px-6 pb-8 pt-20 shadow-2xl"
            style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 76px)' }}
          >
            <ul className="space-y-1">
              {[
                { href: '#how', label: 'Comment ça marche' },
                { href: '#features', label: 'Fonctionnalités' },
                { href: '/pro', label: 'Espace Pro' },
                { href: '/login', label: 'Se connecter' },
              ].map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-xl px-4 py-3 text-base font-semibold text-neutral-200 transition hover:bg-white/5 hover:text-white"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
              <li className="pt-3">
                <a
                  href="#download"
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-primary-500 to-primary-600 px-6 py-3.5 text-base font-bold text-white shadow-lg shadow-primary-500/30"
                >
                  Télécharger l&apos;app
                </a>
              </li>
            </ul>
          </nav>
        </div>
      )}
    </>
  );
}
