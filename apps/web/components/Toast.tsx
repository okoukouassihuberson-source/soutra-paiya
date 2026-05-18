'use client';

import { useCallback, useState } from 'react';

export type ToastVariant = 'success' | 'info' | 'warning' | 'error';

export interface Toast {
  id: string;
  variant: ToastVariant;
  title: string;
  body?: string;
}

/**
 * File de toasts en mémoire. `push` empile un toast (auto-dismiss après 6 s) ;
 * la liste est bornée à `max` pour éviter l'accumulation lors de pics d'events.
 */
export function useToasts(max = 4) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id =
        globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
      setToasts((current) => [{ id, ...toast }, ...current].slice(0, max));
      setTimeout(() => dismiss(id), 6000);
      return id;
    },
    [dismiss, max],
  );

  return { toasts, push, dismiss };
}

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success: 'border-secondary-500 bg-secondary-50 text-secondary-700',
  info: 'border-accent-500 bg-white text-dark',
  warning: 'border-warning bg-white text-dark',
  error: 'border-danger bg-red-50 text-danger',
};

const VARIANT_ICON: Record<ToastVariant, string> = {
  success: '✅',
  info: '🔔',
  warning: '⚠️',
  error: '⛔',
};

/** Pile de toasts en haut à droite. Sans dépendance externe. */
export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-[min(92vw,360px)] flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={`toast-enter pointer-events-auto rounded-md border-l-4 p-3 shadow-lg ${VARIANT_STYLES[toast.variant]}`}
        >
          <div className="flex items-start gap-2">
            <span aria-hidden>{VARIANT_ICON[toast.variant]}</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{toast.title}</div>
              {toast.body && (
                <div className="mt-0.5 text-xs opacity-80">{toast.body}</div>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Fermer"
              className="text-xs opacity-50 transition hover:opacity-100"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
