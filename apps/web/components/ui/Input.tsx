'use client';

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  leftIcon?: ReactNode;
  rightAdornment?: ReactNode;
  /** Largeur fluide (default true). */
  fullWidth?: boolean;
}

export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { className, label, hint, error, leftIcon, rightAdornment, fullWidth = true, id, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <div className={cn(fullWidth && 'w-full')}>
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-600">
          {label}
        </label>
      )}
      <div
        className={cn(
          'flex items-center gap-2 rounded-xl border bg-white px-3 transition-all',
          'border-neutral-200 focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-500/20',
          error && 'border-danger focus-within:border-danger focus-within:ring-red-500/20',
        )}
      >
        {leftIcon && <span aria-hidden className="text-neutral-400">{leftIcon}</span>}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          className={cn(
            'min-w-0 flex-1 bg-transparent py-3 text-base text-dark placeholder:text-neutral-400',
            'outline-none disabled:opacity-50',
            className,
          )}
          {...rest}
        />
        {rightAdornment}
      </div>
      {error ? (
        <p id={`${inputId}-error`} className="mt-1.5 text-xs font-medium text-danger">{error}</p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="mt-1.5 text-xs text-neutral-500">{hint}</p>
      ) : null}
    </div>
  );
});
