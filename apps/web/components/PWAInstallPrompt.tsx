'use client';

import { useEffect, useState } from 'react';

const DISMISS_KEY = 'soutra:pwa-install-dismissed';
const DISMISS_DAYS = 14;

type BeforeInstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

type Variant = 'android' | 'ios' | null;

/**
 * Affiche un encart d'installation PWA :
 *   • Android/Chrome      → bouton natif via `beforeinstallprompt`
 *   • iOS Safari standalone-able → hint visuel « Partager → Sur l'écran d'accueil »
 *
 * S'auto-cache pendant 14 jours après dismiss ; complètement caché si
 * l'app tourne déjà en standalone (déjà installée).
 */
export function PWAInstallPrompt() {
  const [variant, setVariant] = useState<Variant>(null);
  const [deferred, setDeferred] = useState<BeforeInstallEvent | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Déjà installé ?
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as any).standalone === true;
    if (isStandalone) return;

    // Récemment dismissé ?
    try {
      const raw = localStorage.getItem(DISMISS_KEY);
      if (raw) {
        const until = Number(raw);
        if (!Number.isNaN(until) && Date.now() < until) return;
      }
    } catch {/* localStorage indispo : on continue */}

    // Android / Chrome
    const onBefore = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallEvent);
      setVariant('android');
    };
    window.addEventListener('beforeinstallprompt', onBefore);

    // iOS Safari : pas d'API, mais on peut détecter la combinaison.
    const ua = window.navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    if (isIOS && isSafari) {
      // Léger délai pour ne pas masquer le contenu au premier paint.
      const t = window.setTimeout(() => setVariant('ios'), 1500);
      return () => {
        window.removeEventListener('beforeinstallprompt', onBefore);
        window.clearTimeout(t);
      };
    }

    return () => window.removeEventListener('beforeinstallprompt', onBefore);
  }, []);

  if (!variant) return null;

  const dismiss = () => {
    try {
      const until = Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000;
      localStorage.setItem(DISMISS_KEY, String(until));
    } catch {/* noop */}
    setVariant(null);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    setDeferred(null);
    setVariant(null);
    if (choice.outcome === 'dismissed') dismiss();
  };

  return (
    <div
      role="dialog"
      aria-labelledby="pwa-install-title"
      className="fixed inset-x-3 z-[90] mx-auto max-w-md rounded-2xl border border-neutral-200 bg-white p-4 shadow-2xl shadow-black/20 sm:bottom-6 sm:left-6 sm:right-auto sm:inset-x-auto sm:mx-0"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
    >
      <div className="flex items-start gap-3">
        <div
          aria-hidden="true"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white shadow-md"
          style={{ background: 'linear-gradient(135deg,#FF6B1A,#E5500D)' }}
        >
          <span className="text-lg font-extrabold tracking-tight">SP</span>
        </div>
        <div className="min-w-0 flex-1">
          <p id="pwa-install-title" className="text-sm font-bold text-dark">
            Installer Soutra-Playce
          </p>
          {variant === 'android' ? (
            <p className="mt-0.5 text-xs leading-snug text-neutral-600">
              Ajoute l'app à ton écran d'accueil pour un accès rapide, hors ligne et sans navigateur.
            </p>
          ) : (
            <p className="mt-0.5 text-xs leading-snug text-neutral-600">
              Touche{' '}
              <span aria-hidden className="inline-flex items-center align-middle">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline -translate-y-px">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                  <polyline points="16 6 12 2 8 6"/>
                  <line x1="12" y1="2" x2="12" y2="15"/>
                </svg>
              </span>{' '}
              puis <strong className="font-semibold text-dark">« Sur l'écran d'accueil »</strong>.
            </p>
          )}
          <div className="mt-3 flex items-center gap-2">
            {variant === 'android' && (
              <button
                type="button"
                onClick={install}
                className="inline-flex items-center justify-center rounded-full bg-primary-500 px-4 py-1.5 text-xs font-bold text-white shadow-md hover:bg-primary-600"
              >
                Installer
              </button>
            )}
            <button
              type="button"
              onClick={dismiss}
              className="rounded-full px-3 py-1.5 text-xs font-semibold text-neutral-500 hover:text-dark"
            >
              Plus tard
            </button>
          </div>
        </div>
        <button
          type="button"
          aria-label="Fermer"
          onClick={dismiss}
          className="-mr-1 -mt-1 rounded-full p-1 text-neutral-400 hover:bg-neutral-100 hover:text-dark"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
