import type { ReactNode } from 'react';
import Link from 'next/link';

/** Signature visuelle Soutra : un point de localisation orange relié par un trait (le « tracé »). */
export function PinLine({ className = '' }: { className?: string }) {
  return (
    <span aria-hidden className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className="relative flex h-2.5 w-2.5"><span className="absolute inset-0 rounded-full bg-primary-500" /><span className="absolute -inset-1 rounded-full border border-primary-500/40" /></span>
      <span className="h-px w-8 bg-gradient-to-r from-primary-500 to-transparent" />
    </span>
  );
}

export function SectionHeading({ id, eyebrow, title, sub, action, tone = 'light' }: {
  id: string; eyebrow?: string; title: ReactNode; sub?: string; action?: { href: string; label: string }; tone?: 'light' | 'dark';
}) {
  const dark = tone === 'dark';
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="max-w-2xl">
        {eyebrow && <p className={`flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] ${dark ? 'text-primary-300' : 'text-primary-700'}`}><PinLine />{eyebrow}</p>}
        <h2 id={id} className={`mt-2 font-display text-[1.75rem] font-extrabold leading-tight tracking-tight sm:text-4xl ${dark ? 'text-white' : 'text-night'}`}>{title}</h2>
        {sub && <p className={`mt-2 text-base ${dark ? 'text-white/70' : 'text-neutral-600'}`}>{sub}</p>}
      </div>
      {action && (
        <Link href={action.href} className={`group inline-flex min-h-[44px] items-center gap-1.5 text-sm font-bold ${dark ? 'text-primary-300' : 'text-primary-700'}`}>
          {action.label}
          <svg aria-hidden className="transition-transform group-hover:translate-x-1 motion-reduce:transition-none" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </Link>
      )}
    </div>
  );
}

export function Stars({ value, className = '' }: { value: number; className?: string }) {
  return (
    <span className={`inline-flex text-amber-500 ${className}`} role="img" aria-label={`${value}/5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} aria-hidden width="14" height="14" viewBox="0 0 24 24" fill={n <= Math.round(value) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" /></svg>
      ))}
    </span>
  );
}
