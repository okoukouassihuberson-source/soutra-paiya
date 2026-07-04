'use client';

import { useState } from 'react';

/**
 * Badge logo Soutra-Playce.
 *
 * Affiche /logo.png si le fichier est déployé, sinon fallback sur le badge
 * dégradé orange « SP » (préserve un état visuel propre si l'image n'a pas
 * encore été placée dans /public).
 *
 * Utilisé par Topbar + Sidebar de l'AppShell.
 */
export function BrandMark({ size = 'md', className = '' }: {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const [imgError, setImgError] = useState(false);

  const sizeClass =
    size === 'xs' ? 'h-7 w-7' :
    size === 'sm' ? 'h-8 w-8' :
    size === 'lg' ? 'h-10 w-10' :
                    'h-9 w-9';

  if (imgError) {
    return (
      <span
        aria-hidden
        className={`flex items-center justify-center rounded-xl text-sm font-extrabold text-white shadow-sm ${sizeClass} ${className}`}
        style={{ background: 'linear-gradient(135deg,#FF6B1A,#E5500D)' }}
      >
        SP
      </span>
    );
  }

  return (
    <img
      src="/logo.png"
      alt="Soutra-Playce"
      width={64}
      height={64}
      onError={() => setImgError(true)}
      className={`rounded-xl object-contain ${sizeClass} ${className}`}
      decoding="async"
      loading="eager"
    />
  );
}
