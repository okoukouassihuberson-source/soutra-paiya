import Image from 'next/image';
import { cn } from '@/lib/cn';

interface Props {
  src?: string | null;
  name?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZES = {
  xs: { box: 'h-7 w-7', text: 'text-xs', px: 28 },
  sm: { box: 'h-9 w-9', text: 'text-sm', px: 36 },
  md: { box: 'h-11 w-11', text: 'text-base', px: 44 },
  lg: { box: 'h-14 w-14', text: 'text-lg', px: 56 },
  xl: { box: 'h-20 w-20', text: 'text-2xl', px: 80 },
};

/** Couleur stable dérivée du nom — pour des avatars en initiale variés mais déterministes. */
function colorFromName(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  const palette = ['#FF6B1A', '#00B894', '#0984E3', '#7C3AED', '#E63946', '#F59E0B', '#10B981', '#3B82F6'];
  return palette[Math.abs(h) % palette.length];
}

export function Avatar({ src, name, size = 'md', className }: Props) {
  const { box, text, px } = SIZES[size];
  const initial = (name?.trim().charAt(0) || '?').toUpperCase();

  if (src) {
    return (
      <Image
        src={src}
        alt={name ?? 'Avatar'}
        width={px}
        height={px}
        className={cn(box, 'shrink-0 rounded-full object-cover', className)}
      />
    );
  }

  return (
    <span
      aria-label={name ?? 'Avatar'}
      className={cn(
        box,
        'inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white',
        text,
        className,
      )}
      style={{ background: colorFromName(name ?? '?') }}
    >
      {initial}
    </span>
  );
}
