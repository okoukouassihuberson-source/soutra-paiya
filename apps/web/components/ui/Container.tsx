import { cn } from '@/lib/cn';
import type { HTMLAttributes } from 'react';

interface Props extends HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
}

const SIZES = {
  sm: 'max-w-2xl',
  md: 'max-w-4xl',
  lg: 'max-w-6xl',
  xl: 'max-w-7xl',
  full: 'max-w-none',
};

/** Conteneur centré avec padding horizontal responsive. */
export function Container({ className, size = 'lg', ...rest }: Props) {
  return (
    <div
      className={cn(
        'mx-auto w-full px-4 sm:px-6 lg:px-8',
        SIZES[size],
        className,
      )}
      {...rest}
    />
  );
}
