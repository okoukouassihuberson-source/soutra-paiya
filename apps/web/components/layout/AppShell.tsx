'use client';

import { Suspense, useState, type ReactNode } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
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
export function AppShell(props: Props) {
  // Wrap dans Suspense car useSearchParams nécessite un boundary
  // côté Next 14 (App Router) lors du build static.
  return (
    <Suspense fallback={<AppShellInner {...props} _currentUrl={null} />}>
      <AppShellWithUrl {...props} />
    </Suspense>
  );
}

function AppShellWithUrl(props: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const qs = searchParams?.toString();
  const currentUrl = qs ? `${pathname}?${qs}` : pathname;
  return <AppShellInner {...props} _currentUrl={currentUrl} />;
}

function AppShellInner({
  navItems,
  appLabel,
  homeHref = '/',
  user,
  headerActions,
  sidebarFooter,
  children,
  _currentUrl,
}: Props & { _currentUrl: string | null }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const currentUrl = _currentUrl;

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
          pathname={currentUrl}
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
          pathname={currentUrl}
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
      {bottomItems.length > 0 && <BottomNav items={bottomItems} pathname={currentUrl} />}
    </div>
  );
}

/**
 * Matche un href contre l'URL actuelle (pathname + query).
 *   • mode 'exact'  : égalité stricte, avec un cas spécial : si l'href cible
 *     `?tab=dashboard` et qu'on est sur le pathname sans query, on considère
 *     « dashboard » comme l'onglet par défaut (donc actif).
 *   • mode 'prefix' (default) : matche juste le pathname (avant ?), strict
 *     ou prefix-with-slash. Idéal pour les sous-routes /pro/x/y.
 */
export function isActiveNav(href: string, currentUrl: string | null, mode: 'exact' | 'prefix' = 'prefix'): boolean {
  if (!currentUrl) return false;
  if (mode === 'exact') {
    if (currentUrl === href) return true;
    const [hPath, hQuery] = href.split('?');
    const [cPath, cQuery] = currentUrl.split('?');
    if (hPath !== cPath) return false;
    if (!cQuery && hQuery) return hQuery === 'tab=dashboard';
    return hQuery === cQuery;
  }
  const hPath = href.split('?')[0];
  const cPath = currentUrl.split('?')[0];
  if (hPath === '/') return cPath === '/';
  return cPath === hPath || cPath.startsWith(hPath + '/');
}
