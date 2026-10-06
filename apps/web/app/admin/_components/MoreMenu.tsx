'use client';

import { useEffect, useRef, useState } from 'react';

/** Menu « Plus » : range les actions secondaires ou rares (réglages, actions destructrices). Fermeture : Échap, clic extérieur. */
export function MoreMenu({ label = 'Plus', children }: { label?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div ref={box} className="relative">
      <button type="button" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((v) => !v)}
        className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-bold text-neutral-800 hover:border-primary-500">{label} ▾</button>
      {open && (
        <div role="group" aria-label={label} className="absolute right-0 z-20 mt-2 w-64 space-y-3 rounded-xl border border-neutral-200 bg-white p-3 shadow-xl">
          {children}
        </div>
      )}
    </div>
  );
}
