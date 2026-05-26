'use client';

import Link from 'next/link';
import { cn } from '@/lib/cn';
import { isActiveNav, type NavItem } from './AppShell';

interface Props {
  items: NavItem[];
  pathname: string | null;
}

/** Bottom-tab navigation iOS/Android style. Visible < lg uniquement. */
export function BottomNav({ items, pathname }: Props) {
  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white/95 backdrop-blur lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <ul
        className="mx-auto grid max-w-md"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map((item) => {
          const active = isActiveNav(item.href, pathname, item.match);
          return (
            <li key={item.id}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 py-2 text-[10px] font-semibold transition-colors',
                  active ? 'text-primary-600' : 'text-neutral-500 active:text-dark',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-lg transition-colors',
                    active && 'bg-primary-50',
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
  );
}
