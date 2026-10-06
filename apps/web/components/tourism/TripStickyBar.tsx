'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n/client';

/** Barre de réservation collante (mobile/tablette) : prix + bouton qui défile vers le formulaire. */
export function TripStickyBar({ price, cta, targetId = 'booking' }: { price: number; cta: string; targetId?: string }) {
  const { t, fmtXOF } = useI18n();
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setVisible(!e.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, [targetId]);
  if (!visible) return null;
  return (
    <section aria-label={t('tripx.reserve')} className="fixed inset-x-0 z-30 border-t border-neutral-200 bg-white/95 px-4 py-2.5 shadow-[0_-8px_24px_rgba(0,0,0,.08)] backdrop-blur lg:hidden"
      style={{ bottom: 'calc(56px + env(safe-area-inset-bottom, 0px))' }}>
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
        <p className="text-lg font-bold text-primary-700">{t('tripx.stickyFrom', { price: fmtXOF(price) })}</p>
        <button type="button" aria-label={t('tripx.jumpToBooking')}
          onClick={() => document.getElementById(targetId)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })}
          className="min-h-[44px] rounded-full bg-primary-500 px-6 font-bold text-night hover:bg-primary-400">{cta}</button>
      </div>
    </section>
  );
}
