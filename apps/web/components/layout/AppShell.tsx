'use client';

import { useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { BottomNav } from './BottomNav';
import { Sheet } from '@/components/ui/Sheet';
import { cn } from '@/lib/cn';

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: ReactNode;
  /** Affiché dans la bottom-nav mobile. Si false, sidebar uniquement. */
  inBottomNav?: boolean;
  /** Match strict ou prefix pour `isActive`. Default prefix. */
  match?: 'exact' | 'prefix';
}

export interface ShellUser {
  name: string;
  subtitle?: string;
  avatarUrl?: string | null;
}

interface Props {
  /** Items de navigation (sidebar + optionnellement bottom-nav). */
  navItems: NavItem[];
  /** Nom de l'espace affiché dans la sidebar (« Espace Pro », « Admin »…). */
  appLabel: string;
  /** href de retour à l'accueil (logo). */
  homeHref?: string;
  /** Informations utilisateur pour le footer sidebar / topbar. */
  user?: ShellUser;
  /** Slot personnalisé en haut à droite (notifications, actions). */
  headerActions?: ReactNode;
  /** Pied de sidebar custom (sign-out, settings…). */
  sidebarFooter?: ReactNode;
  children: ReactNode;
}

/**
 * App shell premium responsive :
 *   • Mobile  : topbar fixe + drawer latéral (Sidebar dans un Sheet) + bottom-nav
 *   • Desktop : sidebar fixe à gauche, content à droite
 *
 * S'utilise depuis n'importe quel `layout.tsx` segment-level pour wrapper
 * les pages de cet espace (/pro, /admin…). Le shell est purement présentationnel,
 * la nav est définie par les `navItems` passés en props.
 */
export function AppShell({
  navItems,
  appLabel,
  homeHref = '/',
  user,
  headerActions,
  sidebarFooter,
  children,
}: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  const bottomItems = navItems.filter((i) => i.inBottomNav).slice(0, 5);

  return (
    <div className="min-h-screen bg-light text-dark">
      {/* Topbar — mobile only */}
      <Topbar
        appLabel={appLabel}
        homeHref={homeHref}
        user={user}
        actions={headerActions}
        onMenuClick={() => setDrawerOpen(true)}
      />

      {/* Sidebar drawer — mobile only */}
      <Sheet
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        side="left"
        title={appLabel}
      >
        <Sidebar
          variant="drawer"
          appLabel={appLabel}
          homeHref={homeHref}
          navItems={navItems}
          pathname={pathname}
          user={user}
          footer={sidebarFooter}
          onItemClick={() => setDrawerOpen(false)}
        />
      </Sheet>

      {/* Sidebar fixe — desktop only */}
      <div className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">
        <Sidebar
          variant="fixed"
          appLabel={appLabel}
          homeHref={homeHref}
          navItems={navItems}
          pathname={pathname}
          user={user}
          footer={sidebarFooter}
        />
      </div>

      {/* Contenu principal */}
      <main
        className={cn(
          'lg:pl-64',
          // padding-top = hauteur topbar mobile ; padding-bottom = hauteur bottom-nav mobile (+safe-area).
          'pt-14 lg:pt-0',
          bottomItems.length > 0 ? 'pb-20 lg:pb-0' : 'pb-0',
        )}
        style={{
          paddingBottom: bottomItems.length > 0
            ? 'calc(env(safe-area-inset-bottom, 0px) + 80px)'
            : undefined,
        }}
      >
        {children}
      </main>

      {/* Bottom-nav mobile */}
      {bottomItems.length > 0 && <BottomNav items={bottomItems} pathname={pathname} />}
    </div>
  );
}

export function isActiveNav(href: string, pathname: string | null, mode: 'exact' | 'prefix' = 'prefix'): boolean {
  if (!pathname) return false;
  if (mode === 'exact') return pathname === href;
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(href + '/');
}
