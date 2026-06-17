'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/* ─────────────────────────────────────────────────── *
 *  TYPES                                              *
 * ─────────────────────────────────────────────────── */

export interface MediaItem {
  url: string;
  kind: 'image' | 'video';
}

interface Props {
  /** Photo de couverture (sera la 1ʳᵉ tile, le hero) */
  cover?: string | null;
  /** Galerie d'images additionnelles */
  gallery?: string[] | null;
  /** Galerie vidéos (MP4/WebM) — placées en queue de carousel */
  videos?: string[] | null;
  /** Texte alternatif pour accessibilité (nom du venue) */
  alt?: string;
}

const VIDEO_EXT = /\.(mp4|mov|webm|m4v|avi|mkv)(\?|$)/i;
function isVideoUrl(url: string): boolean {
  return VIDEO_EXT.test(url);
}

/**
 * VenueGallery — composant galerie premium inspiré Airbnb/Booking.
 *
 *   Desktop ≥ md :
 *   ┌──────────────────────┬───────────────────────┐
 *   │                      │  thumb 1 │  thumb 2   │
 *   │   COVER 16:9 (hero)  ├──────────┼────────────┤
 *   │                      │  thumb 3 │  +N items  │
 *   └──────────────────────┴──────────┴────────────┘
 *
 *   Mobile :
 *   - Scroll-snap horizontal full-width
 *   - 1 image par viewport, swipe natif
 *
 * Click sur n'importe quelle tile → Lightbox modal plein écran avec
 * scroll-snap horizontal + counter + close. Vidéos lisibles inline.
 *
 * Performance :
 * - lazy loading natif sur les images (loading="lazy")
 * - prefetch image suivante dans le lightbox via new Image()
 * - decoding async
 */
export function VenueGallery({ cover, gallery, videos, alt = 'Photo' }: Props) {
  const media = useMemo<MediaItem[]>(() => {
    const items: MediaItem[] = [];
    if (cover) items.push({ url: cover, kind: 'image' });
    for (const url of gallery ?? []) {
      if (url && url !== cover) {
        items.push({ url, kind: isVideoUrl(url) ? 'video' : 'image' });
      }
    }
    for (const url of videos ?? []) {
      if (url) items.push({ url, kind: 'video' });
    }
    return items;
  }, [cover, gallery, videos]);

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (media.length === 0) {
    return (
      <div className="flex aspect-[16/9] w-full items-center justify-center rounded-2xl bg-neutral-100">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      </div>
    );
  }

  const heroItem = media[0];
  const thumbs = media.slice(1, 5); // affiche jusqu'à 4 thumbs
  const remaining = media.length - 1 - thumbs.length; // « +N items » sur la dernière

  return (
    <>
      {/* ═══ MOBILE (< md) : carousel scroll-snap horizontal ═══ */}
      <div className="md:hidden">
        <div className="-mx-4 flex snap-x snap-mandatory overflow-x-auto scroll-smooth scrollbar-hide">
          {media.map((item, i) => (
            <button
              key={item.url + i}
              type="button"
              onClick={() => setLightboxIndex(i)}
              className="relative w-full shrink-0 snap-start px-4"
              aria-label={`Voir le média ${i + 1} sur ${media.length}`}
            >
              <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-neutral-100">
                <MediaThumb item={item} alt={`${alt} ${i + 1}`} index={i} />
                {item.kind === 'video' && <VideoOverlay />}
              </div>
            </button>
          ))}
        </div>
        {/* Counter dot */}
        <div className="mt-2 text-center text-xs font-medium text-neutral-500">
          {media.length} média{media.length > 1 ? 's' : ''} · glisse pour voir tout
        </div>
      </div>

      {/* ═══ DESKTOP (≥ md) : layout Airbnb hero + thumbs grid ═══ */}
      <div className="hidden md:block">
        <div className="relative grid h-[480px] grid-cols-4 gap-2 overflow-hidden rounded-3xl">
          {/* Hero : 2 colonnes, 2 rangées */}
          <button
            type="button"
            onClick={() => setLightboxIndex(0)}
            className="group relative col-span-2 row-span-2 overflow-hidden bg-neutral-100"
            aria-label="Voir la galerie en plein écran"
          >
            <MediaThumb item={heroItem} alt={`${alt} principal`} index={0} hero />
            {heroItem.kind === 'video' && <VideoOverlay />}
          </button>

          {/* Thumbs : 4 cases 1×1 */}
          {thumbs.map((item, i) => {
            const idx = i + 1;
            const isLast = i === thumbs.length - 1 && remaining > 0;
            return (
              <button
                key={item.url + idx}
                type="button"
                onClick={() => setLightboxIndex(idx)}
                className="group relative overflow-hidden bg-neutral-100"
                aria-label={isLast ? `Voir tous les ${media.length} médias` : `Voir le média ${idx + 1}`}
              >
                <MediaThumb item={item} alt={`${alt} ${idx + 1}`} index={idx} />
                {item.kind === 'video' && <VideoOverlay />}
                {isLast && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/55 transition group-hover:bg-black/65">
                    <span className="font-display text-3xl font-black text-white">
                      +{remaining}
                    </span>
                  </div>
                )}
              </button>
            );
          })}

          {/* Bouton "Voir toutes les photos" overlay bottom-right desktop */}
          <button
            type="button"
            onClick={() => setLightboxIndex(0)}
            className="absolute bottom-4 right-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-neutral-900 shadow-lg transition hover:scale-105"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="9" cy="9" r="2" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
            Voir {media.length} média{media.length > 1 ? 's' : ''}
          </button>
        </div>
      </div>

      {/* ═══ LIGHTBOX ═══ */}
      {lightboxIndex !== null && (
        <Lightbox
          media={media}
          initialIndex={lightboxIndex}
          alt={alt}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  );
}

/* ─────────────────────────────────────────────────── *
 *  Thumb image / video                                *
 * ─────────────────────────────────────────────────── */

function MediaThumb({
  item, alt, index, hero = false,
}: { item: MediaItem; alt: string; index: number; hero?: boolean }) {
  if (item.kind === 'video') {
    // Poster vidéo : on essaie d'afficher la 1ʳᵉ frame via <video preload="metadata">.
    // C'est natif, pas besoin de générer un poster server-side.
    return (
      <video
        src={item.url}
        muted
        playsInline
        preload="metadata"
        className="h-full w-full object-cover transition group-hover:scale-105"
        aria-label={alt}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={item.url}
      alt={alt}
      loading={hero ? 'eager' : 'lazy'}
      decoding="async"
      className="h-full w-full object-cover transition group-hover:scale-105"
    />
  );
}

function VideoOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/15">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 shadow-xl">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="ml-1 text-neutral-900">
          <polygon points="6 4 20 12 6 20 6 4" />
        </svg>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────── *
 *  Lightbox plein écran                               *
 * ─────────────────────────────────────────────────── */

function Lightbox({
  media, initialIndex, alt, onClose,
}: {
  media: MediaItem[];
  initialIndex: number;
  alt: string;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Bloque le scroll du body sous la modal + restore au cleanup
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Échap pour fermer
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') goTo(Math.min(media.length - 1, index + 1));
      else if (e.key === 'ArrowLeft')  goTo(Math.max(0, index - 1));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, media.length]);

  // Scroll initial au bon index
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTo({ left: el.clientWidth * initialIndex, behavior: 'instant' as ScrollBehavior });
    });
  }, [initialIndex]);

  // Préchargement : précharge l'image N+1 et N-1 pour rendre le swipe instantané
  useEffect(() => {
    const preload = (i: number) => {
      const m = media[i];
      if (m && m.kind === 'image') {
        const img = new Image();
        img.src = m.url;
      }
    };
    preload(index + 1);
    preload(index - 1);
  }, [index, media]);

  const onScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const newIndex = Math.round(el.scrollLeft / el.clientWidth);
    if (newIndex !== index && newIndex >= 0 && newIndex < media.length) {
      setIndex(newIndex);
    }
  }, [index, media.length]);

  const goTo = useCallback((next: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ left: el.clientWidth * next, behavior: 'smooth' });
  }, []);

  const current = media[index];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Galerie plein écran"
      className="fixed inset-0 z-[200] bg-black"
    >
      {/* Top bar : counter + close */}
      <div className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between gap-3 bg-gradient-to-b from-black/70 to-transparent p-4">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold text-white backdrop-blur-md">
          {current?.kind === 'video' ? (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4" /></svg>
          ) : (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="9" cy="9" r="2" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
          )}
          <span>{index + 1} / {media.length}</span>
        </div>
        <button
          onClick={onClose}
          aria-label="Fermer"
          className="rounded-full bg-white/15 p-2.5 text-white backdrop-blur-md transition hover:bg-white/25"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Boutons prev/next (desktop only) */}
      {index > 0 && (
        <button
          onClick={() => goTo(index - 1)}
          aria-label="Précédent"
          className="absolute left-4 top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-white/15 p-3 text-white backdrop-blur-md transition hover:bg-white/25 md:flex"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      )}
      {index < media.length - 1 && (
        <button
          onClick={() => goTo(index + 1)}
          aria-label="Suivant"
          className="absolute right-4 top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-white/15 p-3 text-white backdrop-blur-md transition hover:bg-white/25 md:flex"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      )}

      {/* Carousel scroll-snap */}
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto scroll-smooth scrollbar-hide"
      >
        {media.map((item, i) => (
          <div
            key={item.url + i}
            className="flex h-full w-full shrink-0 snap-start snap-always items-center justify-center"
          >
            {item.kind === 'video' ? (
              <video
                src={item.url}
                controls
                autoPlay={i === index}
                playsInline
                preload="metadata"
                className="max-h-full max-w-full"
                aria-label={`${alt} vidéo ${i + 1}`}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.url}
                alt={`${alt} ${i + 1}`}
                loading={Math.abs(i - index) <= 1 ? 'eager' : 'lazy'}
                decoding="async"
                className="max-h-full max-w-full object-contain"
                draggable={false}
              />
            )}
          </div>
        ))}
      </div>

      {/* Bottom dots (mobile : indique le scroll position) */}
      <div className="pointer-events-none absolute bottom-6 left-0 right-0 flex justify-center gap-1.5">
        {media.length <= 12 && media.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all ${
              i === index ? 'w-6 bg-white' : 'w-1.5 bg-white/40'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
