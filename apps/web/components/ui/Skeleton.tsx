import { cn } from '@/lib/cn';
import type { HTMLAttributes } from 'react';

interface Props extends HTMLAttributes<HTMLDivElement> {
  /** Hauteur en classes Tailwind (ex. "h-4"). Default h-4. */
  height?: string;
  /** Largeur Tailwind (ex. "w-full"). Default w-full. */
  width?: string;
  /** Rond (avatar / icone). */
  circle?: boolean;
}

export function Skeleton({ className, height = 'h-4', width = 'w-full', circle, ...rest }: Props) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'animate-pulse bg-neutral-200/70',
        height,
        width,
        circle ? 'rounded-full' : 'rounded-md',
        className,
      )}
      {...rest}
    />
  );
}
