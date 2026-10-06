'use client';

import { useEffect, useState } from 'react';

type Choice = 'system' | 'light' | 'dark';
const KEY = 'soutra.theme';
const OPTIONS: { v: Choice; label: string; icon: string }[] = [
  { v: 'system', label: 'Automatique', icon: '🖥️' },
  { v: 'light', label: 'Clair', icon: '☀️' },
  { v: 'dark', label: 'Sombre', icon: '🌙' },
];

/** Choix d'apparence à trois états (Automatique = préférence du système). */
export function ThemeSelect() {
  const [choice, setChoice] = useState<Choice>('system');
  useEffect(() => {
    try { const s = localStorage.getItem(KEY); setChoice(s === 'light' || s === 'dark' ? s : 'system'); } catch { /* noop */ }
  }, []);

  const apply = (v: Choice) => {
    setChoice(v);
    try { if (v === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, v); } catch { /* noop */ }
    const dark = v === 'dark' || (v === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  };

  return (
    <div role="radiogroup" aria-label="Apparence" className="inline-flex rounded-xl border border-neutral-300 bg-neutral-100 p-1 text-sm font-semibold">
      {OPTIONS.map((o) => (
        <button key={o.v} type="button" role="radio" aria-checked={choice === o.v} onClick={() => apply(o.v)}
          className={`flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 transition ${choice === o.v ? 'bg-white text-dark shadow-sm ring-1 ring-neutral-300' : 'text-neutral-700 hover:text-dark'}`}>
          <span aria-hidden>{o.icon}</span>{o.label}
        </button>
      ))}
    </div>
  );
}
