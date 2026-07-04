'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/cn';
import { BrandMark } from './BrandMark';
import { isActiveNav, type NavItem, type ShellUser } from './AppShell';

interface Props {
  variant: 'fixed' | 'drawer';
  appLabel: string;
  homeHref: string;
  navItems: NavItem[];
  pathname: string | null;
  user?: ShellUser;
  footer?: ReactNode;
  onItemClick?: () => void;
}

export function Sidebar({
  variant,
  appLabel,
  homeHref,
  navItems,
  pathname,
  user,
  footer,
  onItemClick,
}: Props) {
  return (
    <aside
      className={cn(
        'flex h-full flex-col bg-white',
        variant === 'fixed' && 'border-r border-neutral-200',
      )}
    >
      {/* Brand header — masqué en drawer (le Sheet a déjà son titre) */}
      {variant === 'fixed' && (
        <Link
          href={homeHref}
          className="flex items-center gap-3 border-b border-neutral-100 px-5 py-4"
        >
          <BrandMark size="md" />
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-extrabold tracking-tight text-dark">
              Soutra-Playce
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
              {appLabel}
            </span>
          </div>
        </Link>
      )}

      {/* Items */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const active = isActiveNav(item.href, pathname, item.match);
            return (
              <li key={item.id}>
                <Link
                  href={item.href}
                  onClick={onItemClick}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors',
                    active
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-neutral-600 hover:bg-neutral-100 hover:text-dark',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded-lg',
                      active ? 'bg-primary-500 text-white' : 'bg-neutral-100 text-neutral-500 group-hover:text-dark',
                    )}
                  >
                    {item.icon}
                  </span>
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="border-t border-neutral-100 p-3">
        {user && (
          <div className="mb-2 flex items-center gap-3 rounded-xl bg-neutral-50 p-2.5">
            <Avatar name={user.name} src={user.avatarUrl} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-dark">{user.name}</p>
              {user.subtitle && (
                <p className="truncate text-xs text-neutral-500">{user.subtitle}</p>
              )}
            </div>
          </div>
        )}
        {footer}
      </div>
    </aside>
  );
}
