'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n/client';
import type { SearchHit, SearchResponse } from '@/app/api/search/route';

type GroupKey = 'destinations' | 'trips' | 'activities' | 'venues';
interface Row { key: string; label: string; sub: string; href: string; image: string | null; price?: number | null; group: string; sia?: boolean }

const GROUPS: GroupKey[] = ['destinations', 'trips', 'activities', 'venues'];

/** Bouton de la barre + palette de recherche globale (Ctrl/⌘ K ou « / »). */
export function CommandPalette() {
  const { t, lp, locale, fmtXOF } = useI18n();
  const router = useRouter();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [data, setData] = useState<SearchResponse | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  const close = useCallback(() => { setOpen(false); opener.current?.focus?.(); }, []);

  // Raccourcis globaux.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement | null)?.isContentEditable;
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); opener.current = document.activeElement as HTMLElement; setOpen((o) => !o); }
      else if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey) { e.preventDefault(); opener.current = document.activeElement as HTMLElement; setOpen(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Ouverture : focus + blocage du scroll de fond.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => input.current?.focus());
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Recherche débouncée, requêtes obsolètes annulées.
  useEffect(() => {
    const term = q.trim();
    if (!open || term.length < 2) { setData(null); setState('idle'); return; }
    setState('loading');
    const ctl = new AbortController();
    const id = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(term)}&locale=${locale}`, { signal: ctl.signal });
        if (!r.ok) throw new Error(String(r.status));
        setData((await r.json()) as SearchResponse); setState('idle'); setActive(0);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setState('error');
      }
    }, 220);
    return () => { clearTimeout(id); ctl.abort(); };
  }, [q, open, locale]);

  const rows: Row[] = useMemo(() => {
    const term = q.trim();
    if (term.length < 2) {
      const quick = [
        ['explorer', '/explorer'], ['promotions', '/promotions'], ['trips', '/voyages/nationaux'], ['activities', '/activites'],
      ] as const;
      return quick.map(([k, href]) => ({ key: `p-${k}`, label: t(`pal.page.${k}` as 'pal.page.trips'), sub: '', href: lp(href), image: null, group: t('pal.quick') }));
    }
    const out: Row[] = [];
    if (data) for (const g of GROUPS) for (const h of data[g] as SearchHit[]) {
      out.push({ key: `${g}-${h.id}`, label: h.title, sub: h.subtitle, href: h.href, image: h.image, price: h.price, group: t(`pal.g.${g}` as 'pal.g.trips') });
    }
    out.push({ key: 'sia', label: t('pal.askSia', { q: term }), sub: '', href: lp(`/assistant?q=${encodeURIComponent(term)}`), image: null, group: '✦ Soutra', sia: true });
    return out;
  }, [data, q, t, lp]);

  const go = (r: Row | undefined) => { if (!r) return; setOpen(false); setQ(''); router.push(r.href); };

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(rows.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(rows[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  }

  useEffect(() => { document.getElementById(`${uid}-o${active}`)?.scrollIntoView({ block: 'nearest' }); }, [active, uid]);

  const term = q.trim();
  const noHits = term.length >= 2 && state === 'idle' && data && rows.length === 1;
  let lastGroup = '';

  return (
    <>
      <button type="button" onClick={(e) => { opener.current = e.currentTarget; setOpen(true); }} aria-haspopup="dialog" aria-label={t('pal.open')}
        className="inline-flex items-center gap-2 rounded-full border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-600 transition hover:border-primary-400 hover:text-primary-700">
        <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <span className="hidden lg:inline">{t('pal.open')}</span>
        <kbd className="hidden whitespace-nowrap rounded border border-neutral-300 bg-neutral-50 px-1.5 py-0.5 font-sans text-[11px] text-neutral-600 lg:inline">{t('pal.shortcut')}</kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center px-3 pt-[8vh] sm:pt-[12vh]" role="presentation">
          <div className="absolute inset-0 bg-night/60 backdrop-blur-sm" onClick={close} aria-hidden />
          <div role="dialog" aria-modal="true" aria-label={t('pal.title')} className="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/10">
            <div className="flex items-center gap-3 border-b border-neutral-200 px-4">
              <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0 text-neutral-500"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} onKeyDown={onInputKey}
                role="combobox" aria-expanded="true" aria-controls={`${uid}-list`} aria-activedescendant={rows[active] ? `${uid}-o${active}` : undefined} aria-autocomplete="list"
                maxLength={60} autoComplete="off" spellCheck={false} placeholder={t('pal.placeholder')} aria-label={t('pal.title')}
                className="min-w-0 flex-1 border-0 bg-transparent py-4 text-base text-dark placeholder:text-neutral-500 focus:outline-none focus:ring-0" />
              <button type="button" onClick={close} className="rounded-lg border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50">Esc</button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto overscroll-contain p-2">
              <p className="px-3 py-1 text-xs text-neutral-600" role="status" aria-live="polite">
                {term.length > 0 && term.length < 2 ? t('pal.minChars') : state === 'loading' ? t('pal.searching') : state === 'error' ? t('pal.error') : noHits ? t('pal.none', { q: term }) : ''}
              </p>
              <ul id={`${uid}-list`} role="listbox" aria-label={t('pal.title')}>
                {rows.map((r, idx) => {
                  const header = r.group !== lastGroup ? r.group : null;
                  lastGroup = r.group;
                  return (
                    <li key={r.key} role="presentation">
                      {header && <p className="px-3 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wide text-neutral-600">{header}</p>}
                      <a id={`${uid}-o${idx}`} role="option" aria-selected={idx === active} href={r.href}
                        onClick={(e) => { e.preventDefault(); go(r); }} onMouseMove={() => setActive(idx)}
                        className={`flex items-center gap-3 rounded-xl px-3 py-2 ${idx === active ? 'bg-primary-50 ring-1 ring-primary-300' : ''}`}>
                        {r.sia
                          ? <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-night text-lg text-primary-400">✦</span>
                          : r.image
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={r.image} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                            : <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-lg">{r.key.startsWith('p-') ? '→' : '📍'}</span>}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-dark">{r.label}</span>
                          {r.sub && <span className="block truncate text-xs text-neutral-600">{r.sub}</span>}
                        </span>
                        {r.price ? <span className="shrink-0 text-xs font-semibold text-primary-700">{fmtXOF(r.price)}</span> : null}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
            <p className="hidden border-t border-neutral-200 bg-neutral-50 px-4 py-2 text-xs text-neutral-600 sm:block">{t('pal.hint')}</p>
          </div>
        </div>
      )}
    </>
  );
}
