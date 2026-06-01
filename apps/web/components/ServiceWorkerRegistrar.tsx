'use client';

import { useEffect, useState } from 'react';

/**
 * Enregistre le service worker au montage et détecte les nouvelles versions.
 *
 * Quand une nouvelle version du SW est disponible (mise en attente), on
 * affiche un mini banner qui invite l'utilisateur à recharger. Au clic, on
 * dit au SW de prendre le contrôle (SKIP_WAITING) puis on recharge.
 */
export function ServiceWorkerRegistrar() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return; // évite les caches en dev

    const onLoad = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((reg) => {
          // Vérifie immédiatement s'il y a un worker déjà en attente.
          if (reg.waiting) setWaitingWorker(reg.waiting);

          reg.addEventListener('updatefound', () => {
            const installing = reg.installing;
            if (!installing) return;
            installing.addEventListener('statechange', () => {
              if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                // Une nouvelle version est prête, l'ancienne contrôle encore la page.
                setWaitingWorker(installing);
              }
            });
          });
        })
        .catch((err) => {
          console.warn('[sw] register failed:', err);
        });

      // Recharge la page dès qu'un nouveau SW prend le contrôle.
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });
    };

    if (document.readyState === 'complete') onLoad();
    else window.addEventListener('load', onLoad, { once: true });
  }, []);

  if (!waitingWorker) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 z-[100] flex -translate-x-1/2 items-center gap-3 rounded-full border border-neutral-200 bg-white px-4 py-2.5 text-sm shadow-xl shadow-black/10 sm:bottom-6 sm:top-auto"
      style={{
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
      }}
    >
      <span className="font-semibold text-dark">Mise à jour disponible</span>
      <button
        type="button"
        onClick={() => {
          waitingWorker.postMessage({ type: 'SKIP_WAITING' });
        }}
        className="rounded-full bg-primary-500 px-3 py-1 text-xs font-bold text-white hover:bg-primary-600"
      >
        Recharger
      </button>
    </div>
  );
}
