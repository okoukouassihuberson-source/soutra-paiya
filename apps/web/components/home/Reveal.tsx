'use client';

import { useEffect, useRef, type ElementType, type ReactNode } from 'react';

/**
 * Apparition progressive au scroll. Le rendu serveur est visible (pas de contenu
 * caché sans JS) ; au montage, seuls les blocs encore hors écran sont masqués puis
 * révélés par IntersectionObserver. Désactivé si prefers-reduced-motion (voir globals.css).
 */
export function Reveal({
  children, className = '', delay = 0, as: Tag = 'div',
}: { children: ReactNode; className?: string; delay?: number; as?: ElementType }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight * 0.92) return; // déjà à l'écran : on ne masque pas
    el.dataset.reveal = 'hidden';
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { el.dataset.reveal = 'shown'; io.disconnect(); }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag ref={ref} className={`reveal ${className}`} style={delay ? { transitionDelay: `${delay}ms` } : undefined}>
      {children}
    </Tag>
  );
}
