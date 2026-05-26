'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg';

const BASE =
  'inline-flex items-center justify-center gap-2 font-semibold transition-all duration-150 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 ' +
  'disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98] select-none ' +
  'whitespace-nowrap';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-primary-500 text-white shadow-md shadow-primary-500/25 hover:bg-primary-600 hover:shadow-lg hover:shadow-primary-500/30',
  secondary:
    'bg-neutral-100 text-dark hover:bg-neutral-200',
  ghost:
    'bg-transparent text-dark hover:bg-neutral-100',
  outline:
    'bg-white text-dark border border-neutral-200 hover:border-neutral-300 hover:shadow-sm',
  danger:
    'bg-danger text-white shadow-md shadow-red-500/25 hover:opacity-90',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3 text-xs rounded-full',
  md: 'h-11 px-5 text-sm rounded-full',
  lg: 'h-12 px-6 text-base rounded-full',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { className, variant = 'primary', size = 'md', loading, leftIcon, rightIcon, fullWidth, children, disabled, type, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      disabled={disabled || loading}
      className={cn(
        BASE,
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <span
          aria-hidden
          className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"
        />
      ) : (
        leftIcon
      )}
      {children}
      {!loading && rightIcon}
    </button>
  );
});
