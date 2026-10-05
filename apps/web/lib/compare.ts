'use client';

import { useCallback, useEffect, useState } from 'react';

export const COMPARE_MAX = 3;
const KEY = 'soutra.compare.v1';
const EVT = 'soutra:compare';

function read(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, COMPARE_MAX) : [];
  } catch { return []; }
}
function write(list: string[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, COMPARE_MAX))); } catch { /* stockage indisponible */ }
  window.dispatchEvent(new Event(EVT));
}

/** Sélection de voyages à comparer (slugs), partagée entre composants et onglets. */
export function useCompare() {
  const [slugs, setSlugs] = useState<string[]>([]);
  useEffect(() => {
    const sync = () => setSlugs(read());
    sync();
    window.addEventListener(EVT, sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener(EVT, sync); window.removeEventListener('storage', sync); };
  }, []);
  const toggle = useCallback((slug: string) => {
    const cur = read();
    write(cur.includes(slug) ? cur.filter((s) => s !== slug) : cur.length < COMPARE_MAX ? [...cur, slug] : cur);
  }, []);
  const replace = useCallback((list: string[]) => write(list), []);
  const clear = useCallback(() => write([]), []);
  return { slugs, toggle, replace, clear, full: slugs.length >= COMPARE_MAX };
}
