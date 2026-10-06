'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n/client';

export interface RecentItem { kind: 'trip' | 'activity'; slug: string; title: string; image: string | null; price: number | null }
const KEY = 'soutra.recent.v1';
const MAX = 8;

function read(): RecentItem[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => x && typeof x.slug === 'string' && typeof x.title === 'string').slice(0, MAX) : [];
  } catch { return []; }
}

/** Mémorise (localement, sur cet appareil) la fiche consultée. Ne rend rien. */
export function RecentTracker(item: RecentItem) {
  useEffect(() => {
    try {
      const rest = read().filter((x) => !(x.kind === item.kind && x.slug === item.slug));
      localStorage.setItem(KEY, JSON.stringify([item, ...rest].slice(0, MAX)));
    } catch { /* stockage indisponible : sans effet */ }
  }, [item.kind, item.slug]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

const PATH = { trip: '/voyages', activity: '/activites' } as const;

/** « Reprendre où vous étiez » : invisible tant que rien n'a été consulté. */
export function RecentlyViewed() {
  const { t, lp, fmtXOF } = useI18n();
  const [items, setItems] = useState<RecentItem[]>([]);
  useEffect(() => { setItems(read()); }, []);
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="recent" className="mx-auto max-w-7xl px-4 pt-10 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between gap-3">
        <h2 id="recent" className="font-display text-xl font-extrabold text-night">{t('recent.title')}</h2>
        <button type="button" onClick={() => { try { localStorage.removeItem(KEY); } catch { /* noop */ } setItems([]); }}
          className="text-sm font-medium text-neutral-700 underline hover:text-primary-700">{t('recent.clear')}</button>
      </div>
      <ul className="-mx-4 mt-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        {items.map((it) => (
          <li key={`${it.kind}-${it.slug}`} className="w-60 shrink-0 snap-start">
            <Link href={lp(`${PATH[it.kind]}/${it.slug}`)} className="group flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-2 shadow-sm transition hover:shadow-md">
              {it.image
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={it.image} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
                : <span aria-hidden className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-2xl">🌴</span>}
              <span className="min-w-0">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-primary-700">{t(`recent.kind.${it.kind}` as 'recent.kind.trip')}</span>
                <span className="block truncate text-sm font-bold text-dark">{it.title}</span>
                {it.price != null && <span className="block text-xs text-neutral-700">{t('common.from')} {fmtXOF(it.price)}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
