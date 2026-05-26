'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { IconButton } from '@/components/ui/IconButton';
import { Avatar } from '@/components/ui/Avatar';
import type { ShellUser } from './AppShell';

interface Props {
  appLabel: string;
  homeHref: string;
  user?: ShellUser;
  actions?: ReactNode;
  onMenuClick: () => void;
}

/** Barre supérieure fixed-top, visible sur mobile/tablet uniquement (< lg). */
export function Topbar({ appLabel, homeHref, user, actions, onMenuClick }: Props) {
  return (
    <header
      className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-2 border-b border-neutral-200 bg-white/85 px-3 backdrop-blur lg:hidden"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <IconButton aria-label="Ouvrir le menu" onClick={onMenuClick} variant="ghost">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </IconButton>

      <Link href={homeHref} className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden
          className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-extrabold text-white shadow-sm"
          style={{ background: 'linear-gradient(135deg,#FF6B1A,#E5500D)' }}
        >
          SP
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-sm font-extrabold tracking-tight text-dark">
            Soutra-Playce
          </div>
          <div className="truncate text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
            {appLabel}
          </div>
        </div>
      </Link>

      <div className="ml-auto flex items-center gap-1">
        {actions}
        {user && <Avatar name={user.name} src={user.avatarUrl} size="sm" />}
      </div>
    </header>
  );
}
