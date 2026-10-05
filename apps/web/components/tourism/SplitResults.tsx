'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n/client';
import type { Area, MapItem } from './ResultsMap';

// Leaflet touche `window` à l'import : chargement client uniquement.
const ResultsMap = dynamic(() => import('./ResultsMap'), {
  ssr: false,
  loading: () => <div className="h-full min-h-[420px] w-full animate-pulse rounded-2xl bg-neutral-100" />,
});

/**
 * Mise en page « liste + carte » (≥ lg) ou carte seule. La liste (rendue côté serveur) est passée
 * en `children` ; chaque carte porte `data-map-id`. Le survol d'une carte met l'épingle en évidence,
 * un clic sur une épingle fait défiler la liste jusqu'à la carte correspondante.
 * « Rechercher dans cette zone » réécrit lat/lng/rayon dans l'URL.
 */
export function SplitResults({ items, user, mode, children }: {
  items: MapItem[]; user?: [number, number]; mode: 'split' | 'map'; children?: React.ReactNode;
}) {
  const { t, tn } = useI18n();
  const router = useRouter(); const pathname = usePathname();
  const [hover, setHover] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);

  const idAt = (el: EventTarget | null) => (el as HTMLElement | null)?.closest?.('[data-map-id]')?.getAttribute('data-map-id') ?? null;

  const select = useCallback((id: string) => {
    setHover(id);
    const el = list.current?.querySelector<HTMLElement>(`[data-map-id="${CSS.escape(id)}"]`);
    el?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
  }, []);

  useEffect(() => {
    list.current?.querySelectorAll('[data-map-hot]').forEach((n) => n.removeAttribute('data-map-hot'));
    if (hover) list.current?.querySelector(`[data-map-id="${CSS.escape(hover)}"]`)?.setAttribute('data-map-hot', '');
  }, [hover]);

  const searchArea = (a: Area) => {
    const q = new URLSearchParams(window.location.search);
    q.set('lat', String(a.lat)); q.set('lng', String(a.lng)); q.set('radius', String(a.radiusKm)); q.set('sort', 'distance'); q.delete('page');
    router.push(`${pathname}?${q.toString()}`);
  };

  const map = items.length === 0
    ? <p className="rounded-2xl bg-neutral-50 p-8 text-center text-neutral-600">{t('split.noGps')}</p>
    : <ResultsMap items={items} user={user} highlightId={hover} onSelect={select} onSearchArea={searchArea}
        className="h-full min-h-[420px] w-full rounded-2xl border border-neutral-200" />;

  if (mode === 'map') {
    return <div className="h-[72vh] min-h-[420px]" role="region" aria-label={t('split.mapTitle')}>{map}</div>;
  }
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <div ref={list} onMouseOver={(e) => setHover(idAt(e.target))} onMouseLeave={() => setHover(null)} onFocus={(e) => setHover(idAt(e.target))} onBlur={() => setHover(null)}
        className="[&_[data-map-hot]>*]:ring-2 [&_[data-map-hot]>*]:ring-primary-500 [&_[data-map-hot]>*]:ring-offset-2">
        {children}
      </div>
      <div className="hidden lg:block">
        <div className="sticky top-20 h-[calc(100vh-6rem)] min-h-[420px]" role="region" aria-label={t('split.mapTitle')}>
          <p className="sr-only" aria-live="polite">{tn('split.results', items.length, { n: items.length })}</p>
          {map}
        </div>
      </div>
    </div>
  );
}
