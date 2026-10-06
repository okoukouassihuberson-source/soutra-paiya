'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n/client';

/**
 * Galerie en mosaïque (1 grande + 4 vignettes ≥ sm ; carrousel à défilement sur mobile)
 * avec visionneuse plein écran : flèches ←/→, Échap, focus restitué, défilement de fond bloqué.
 */
export function TripGallery({ images, title }: { images: string[]; title: string }) {
  const { t } = useI18n();
  const [at, setAt] = useState<number | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const touch = useRef<number | null>(null);
  const n = images.length;

  const show = (i: number, el?: HTMLElement) => { if (el) opener.current = el; setAt(i); };
  const close = useCallback(() => { setAt(null); opener.current?.focus?.(); }, []);
  const step = useCallback((d: number) => setAt((i) => (i === null ? i : (i + d + n) % n)), [n]);

  useEffect(() => {
    if (at === null) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [at === null, close, step]); // eslint-disable-line react-hooks/exhaustive-deps

  if (n === 0) {
    return <div aria-hidden className="flex h-64 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-100 to-secondary-100 text-6xl sm:h-96">🌴</div>;
  }

  const thumb = (i: number, cls: string) => (
    <button key={i} type="button" onClick={(e) => show(i, e.currentTarget)} aria-label={t('gallery.open', { n: i + 1 })}
      className={`group relative overflow-hidden bg-neutral-200 focus-visible:z-10 ${cls}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={images[i]} alt={i === 0 ? title : ''} loading={i === 0 ? 'eager' : 'lazy'} decoding="async" className="h-full w-full object-cover transition duration-500 group-hover:scale-105 motion-reduce:transition-none" />
    </button>
  );

  return (
    <>
      <div className="relative" role="group" aria-label={t('gallery.title')}>
        {/* Mobile : défilement horizontal à accroche */}
        <div className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 sm:hidden">
          {images.map((src, i) => (
            <button key={i} type="button" onClick={(e) => show(i, e.currentTarget)} aria-label={t('gallery.open', { n: i + 1 })} className="relative h-60 w-[86%] shrink-0 snap-center overflow-hidden rounded-2xl bg-neutral-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={i === 0 ? title : ''} loading={i === 0 ? 'eager' : 'lazy'} decoding="async" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
        {/* ≥ sm : mosaïque */}
        <div className={`hidden h-[26rem] gap-2 overflow-hidden rounded-2xl sm:grid ${n >= 3 ? 'grid-cols-4 grid-rows-2' : n === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {thumb(0, n >= 3 ? 'col-span-2 row-span-2' : '')}
          {images.slice(1, 5).map((_, k) => thumb(k + 1, ''))}
        </div>
        {n > 1 && (
          <button type="button" onClick={(e) => show(0, e.currentTarget)}
            className="absolute bottom-3 right-3 rounded-full bg-white/95 px-4 py-2 text-sm font-semibold text-night shadow-lg ring-1 ring-black/10 transition hover:bg-white max-sm:hidden">
            ▦ {t('gallery.showAll', { n })}
          </button>
        )}
      </div>

      {at !== null && (
        <div role="dialog" aria-modal="true" aria-label={t('gallery.title')} className="fixed inset-0 z-[80] flex flex-col bg-black/95"
          onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => { if (touch.current !== null) { const dx = e.changedTouches[0].clientX - touch.current; if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1); touch.current = null; } }}>
          <div className="flex items-center justify-between px-4 py-3 text-white" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
            <p className="text-sm font-medium" aria-live="polite">{t('gallery.counter', { n: at + 1, total: n })}</p>
            <button ref={closeBtn} type="button" onClick={close} aria-label={t('gallery.close')} className="flex h-11 w-11 items-center justify-center rounded-full text-2xl hover:bg-white/15">×</button>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 sm:px-16" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
            {n > 1 && <button type="button" onClick={() => step(-1)} aria-label={t('gallery.prev')} className="absolute left-2 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-2xl text-white hover:bg-white/30">‹</button>}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={images[at]} alt={`${title} — ${at + 1}`} className="max-h-full max-w-full object-contain" />
            {n > 1 && <button type="button" onClick={() => step(1)} aria-label={t('gallery.next')} className="absolute right-2 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-2xl text-white hover:bg-white/30">›</button>}
          </div>
          <div className="flex justify-center gap-2 overflow-x-auto px-4 py-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
            {images.map((src, i) => (
              <button key={i} type="button" onClick={() => setAt(i)} aria-label={t('gallery.open', { n: i + 1 })} aria-current={i === at ? 'true' : undefined}
                className={`h-14 w-20 shrink-0 overflow-hidden rounded-lg ring-2 transition ${i === at ? 'ring-primary-500' : 'opacity-60 ring-transparent hover:opacity-100'}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
