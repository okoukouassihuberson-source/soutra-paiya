import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'default' | 'elevated' | 'outlined' | 'subtle';

const VARIANTS: Record<Variant, string> = {
  default:
    'bg-white border border-neutral-200 shadow-sm',
  elevated:
    'bg-white shadow-xl shadow-black/5',
  outlined:
    'bg-white border border-neutral-200',
  subtle:
    'bg-neutral-50 border border-neutral-100',
};

interface Props extends HTMLAttributes<HTMLDivElement> {
  variant?: Variant;
  /** Padding interne (default md). */
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Interactive : ajoute hover + cursor-pointer. */
  interactive?: boolean;
}

const PADDINGS = {
  none: '',
  sm: 'p-3',
  md: 'p-4 sm:p-5',
  lg: 'p-6 sm:p-8',
};

export const Card = forwardRef<HTMLDivElement, Props>(function Card(
  { className, variant = 'default', padding = 'md', interactive, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        'rounded-2xl transition-all',
        VARIANTS[variant],
        PADDINGS[padding],
        interactive && 'cursor-pointer hover:-translate-y-0.5 hover:shadow-lg',
        className,
      )}
      {...rest}
    />
  );
});
