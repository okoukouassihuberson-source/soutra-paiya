'use client';

import { useCallback, useEffect, useState } from 'react';

export const COMPARE_MAX = 3;
export type CompareKind = 'trip' | 'venue';
// « trip » garde la clé historique : les sélections déjà faites restent valides.
const KEYS: Record<CompareKind, string> = { trip: 'soutra.compare.v1', venue: 'soutra.compare.venue.v1' };
const EVT = 'soutra:compare';

export const compareKey = (kind: CompareKind) => KEYS[kind];

function read(kind: CompareKind): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEYS[kind]) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, COMPARE_MAX) : [];
  } catch { return []; }
}
function write(kind: CompareKind, list: string[]) {
  try { localStorage.setItem(KEYS[kind], JSON.stringify(list.slice(0, COMPARE_MAX))); } catch { /* stockage indisponible */ }
  window.dispatchEvent(new Event(EVT));
}

/** Sélection d'éléments à comparer (slugs), partagée entre composants et onglets. */
export function useCompare(kind: CompareKind = 'trip') {
  const [slugs, setSlugs] = useState<string[]>([]);
  useEffect(() => {
    const sync = () => setSlugs(read(kind));
    sync();
    window.addEventListener(EVT, sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener(EVT, sync); window.removeEventListener('storage', sync); };
  }, [kind]);
  const toggle = useCallback((slug: string) => {
    const cur = read(kind);
    write(kind, cur.includes(slug) ? cur.filter((s) => s !== slug) : cur.length < COMPARE_MAX ? [...cur, slug] : cur);
  }, [kind]);
  const replace = useCallback((list: string[]) => write(kind, list), [kind]);
  const clear = useCallback(() => write(kind, []), [kind]);
  return { slugs, toggle, replace, clear, full: slugs.length >= COMPARE_MAX };
}
