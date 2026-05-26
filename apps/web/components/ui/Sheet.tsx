'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Position : bottom (mobile bottom-sheet), left (sidebar drawer), center (modal). */
  side?: 'bottom' | 'left' | 'right' | 'center';
  /** Largeur max sur desktop. */
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
  /** Titre optionnel pour a11y. */
  title?: string;
  children: ReactNode;
  className?: string;
}

const MAX_W: Record<NonNullable<Props['maxWidth']>, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-xl',
};

/**
 * Sheet adaptatif : modal centré sur desktop, bottom-sheet ou drawer sur mobile.
 * - `side="bottom"` : slide-up depuis le bas (idéal mobile)
 * - `side="left"|"right"` : drawer latéral (navigation mobile)
 * - `side="center"` : modal classique
 *
 * Fermeture : clic backdrop, Escape, ou onClose programmatique. Le focus
 * est restauré sur l'élément qui avait ouvert le sheet (best-effort).
 */
export function Sheet({
  open,
  onClose,
  side = 'bottom',
  maxWidth = 'md',
  title,
  children,
  className,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    // Auto-focus le premier élément focusable du sheet (sinon le sheet lui-même).
    requestAnimationFrame(() => {
      const target = ref.current?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      (target ?? ref.current)?.focus();
    });
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      // Restaure le focus sur le déclencheur.
      if (triggerRef.current && 'focus' in triggerRef.current) {
        (triggerRef.current as HTMLElement).focus();
      }
    };
  }, [open, onClose]);

  if (!open) return null;

  const panelPosition =
    side === 'bottom'
      ? 'inset-x-0 bottom-0 rounded-t-3xl sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:inset-x-auto'
      : side === 'center'
        ? 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 max-h-[90vh] w-[calc(100%-24px)] rounded-2xl'
        : side === 'left'
          ? 'left-0 top-0 h-full w-[88%] max-w-sm rounded-r-2xl'
          : 'right-0 top-0 h-full w-[88%] max-w-sm rounded-l-2xl';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[200] flex"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Fermer"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px] animate-sheet-fade"
      />
      {/* Panel */}
      <div
        ref={ref}
        tabIndex={-1}
        className={cn(
          'absolute bg-light shadow-2xl outline-none',
          'flex flex-col overflow-hidden',
          side === 'bottom' ? `sm:w-full ${MAX_W[maxWidth]}` : '',
          panelPosition,
          side === 'bottom' && 'animate-sheet-slide-up',
          side === 'center' && 'animate-sheet-zoom',
          side === 'left' && 'animate-sheet-slide-right',
          side === 'right' && 'animate-sheet-slide-left',
          className,
        )}
        style={{ paddingBottom: side === 'bottom' ? 'env(safe-area-inset-bottom, 0px)' : undefined }}
      >
        {side === 'bottom' && (
          <div aria-hidden className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-neutral-200 sm:hidden" />
        )}
        {title && (
          <header className="border-b border-neutral-100 px-5 pb-3 pt-4 sm:pt-5">
            <h2 className="text-lg font-bold text-dark">{title}</h2>
          </header>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>
      </div>
    </div>
  );
}
