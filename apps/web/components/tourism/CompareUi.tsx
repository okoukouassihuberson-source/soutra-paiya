'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { stripLocale } from '@/lib/i18n/config';
import { useI18n } from '@/lib/i18n/client';
import { useCompare } from '@/lib/compare';

/** Case « Comparer » posée sur une carte de voyage (hors du lien : pas d'élément interactif imbriqué). */
export function CompareToggle({ slug, title }: { slug: string; title: string }) {
  const { t } = useI18n();
  const { slugs, toggle, full } = useCompare();
  const on = slugs.includes(slug);
  const blocked = full && !on;
  return (
    <button type="button" onClick={() => toggle(slug)} aria-pressed={on} disabled={blocked}
      aria-label={on ? t('cmp.removeAria', { title }) : t('cmp.addAria', { title })} title={blocked ? t('cmp.full') : undefined}
      className={`absolute right-3 top-3 z-10 inline-flex min-h-[32px] items-center gap-1.5 rounded-full border px-3 text-xs font-bold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${on ? 'border-primary-500 bg-primary-500 text-night' : 'border-neutral-300 bg-white/95 text-neutral-800 hover:border-primary-400'}`}>
      <span aria-hidden>{on ? '✓' : '⇄'}</span>{on ? t('cmp.added') : t('cmp.add')}
    </button>
  );
}

/** Barre flottante « n voyages sélectionnés → Comparer ». Absente des fiches voyage (barre de réservation) et de la page de comparaison. */
export function CompareBar() {
  const { t, tn, lp } = useI18n();
  const { path } = stripLocale(usePathname() ?? '/');
  const { slugs, clear } = useCompare();
  const detail = /^\/voyages\/(?!nationaux$|internationaux$)[^/]+$/.test(path);
  if (slugs.length === 0 || detail) return null;
  const ready = slugs.length >= 2;
  return (
    <section aria-label={t('cmp.title')} className="fixed left-1/2 z-40 w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 rounded-2xl border border-neutral-200 bg-white p-3 shadow-2xl xl:bottom-6"
      style={{ bottom: 'calc(72px + env(safe-area-inset-bottom, 0px))' }}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 text-sm">
          <p className="font-bold text-dark">{tn('cmp.bar', slugs.length)}</p>
          {!ready && <p className="text-xs text-neutral-600">{t('cmp.needTwo')}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={clear} className="rounded-full px-3 py-2 text-sm font-medium text-neutral-700 underline">{t('cmp.clear')}</button>
          {ready
            ? <Link href={lp(`/voyages/comparer?s=${slugs.map(encodeURIComponent).join(',')}`)} className="min-h-[40px] rounded-full bg-primary-500 px-5 py-2.5 text-sm font-bold text-night hover:bg-primary-400">{t('cmp.go')}</Link>
            : <span aria-disabled className="min-h-[40px] cursor-not-allowed rounded-full bg-neutral-200 px-5 py-2.5 text-sm font-bold text-neutral-600">{t('cmp.go')}</span>}
        </div>
      </div>
    </section>
  );
}

/** Page de comparaison : recopie la sélection du lien dans le stockage local, ou la lit s'il est vide. */
export function CompareSync({ slugs }: { slugs: string[] }) {
  const router = useRouter();
  const { lp } = useI18n();
  const { replace } = useCompare();
  useEffect(() => {
    if (slugs.length > 0) { replace(slugs); return; }
    try {
      const stored = JSON.parse(localStorage.getItem('soutra.compare.v1') ?? '[]');
      if (Array.isArray(stored) && stored.length > 0) router.replace(lp(`/voyages/comparer?s=${stored.map((s: string) => encodeURIComponent(s)).join(',')}`));
    } catch { /* noop */ }
  }, [slugs.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export function CopyLink() {
  const { t } = useI18n();
  const [done, setDone] = useState(false);
  return (
    <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(window.location.href); setDone(true); setTimeout(() => setDone(false), 2000); } catch { /* noop */ } }}
      className="rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 hover:border-primary-400" aria-live="polite">
      {done ? `✓ ${t('cmp.copied')}` : t('cmp.share')}
    </button>
  );
}
