'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  AppShell,
  type NavItem,
  type ShellUser,
  IcoGrid, IcoChart, IcoUsers, IcoStore, IcoWallet,
  IcoCalendar, IcoMegaphone, IcoGear, IcoLogout,
} from '@/components/layout';
import { Button } from '@/components/ui';
import { supabaseBrowser } from '@/lib/supabase';

/**
 * Wrapper Client Component pour l'AppShell de /admin.
 *
 * Comme pour /pro, les onglets sont pilotés par ?tab=XXX (pas de sous-routes
 * dans cette PR — la page admin/page.tsx reste monolithique). L'AppShell
 * fournit la nav responsive (sidebar desktop + topbar + bottom-nav mobile).
 */

// Icône bouclier pour l'onglet Sécurité (pas dans le set de base layout/Icons).
const IcoShield = (p: React.SVGProps<SVGSVGElement>) => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

const NAV: NavItem[] = [
  { id: 'overview',     label: "Vue d'ensemble", href: '/admin?tab=overview',     icon: <IcoGrid />,       inBottomNav: true, match: 'exact' },
  { id: 'analytics',    label: 'Analytics',      href: '/admin?tab=analytics',    icon: <IcoChart />,      inBottomNav: true, match: 'exact' },
  { id: 'users',        label: 'Utilisateurs',   href: '/admin?tab=users',        icon: <IcoUsers />,      inBottomNav: true, match: 'exact' },
  { id: 'venues',       label: 'Établissements', href: '/admin?tab=venues',       icon: <IcoStore />,      inBottomNav: true, match: 'exact' },
  { id: 'transactions', label: 'Transactions',   href: '/admin?tab=transactions', icon: <IcoWallet />,     inBottomNav: true, match: 'exact' },
  { id: 'reservations', label: 'Réservations',   href: '/admin?tab=reservations', icon: <IcoCalendar />,                      match: 'exact' },
  { id: 'marketing',    label: 'Marketing',      href: '/admin?tab=marketing',    icon: <IcoMegaphone />,                     match: 'exact' },
  { id: 'security',     label: 'Sécurité',       href: '/admin?tab=security',     icon: <IcoShield />,                        match: 'exact' },
  { id: 'settings',     label: 'Paramètres',     href: '/admin?tab=settings',     icon: <IcoGear />,                          match: 'exact' },
];

export function AdminShell({ user, children }: { user: ShellUser; children: ReactNode }) {
  const router = useRouter();
  const supabase = supabaseBrowser();

  const onSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <AppShell
      appLabel="Espace Admin"
      homeHref="/"
      navItems={NAV}
      user={user}
      sidebarFooter={
        <Button variant="ghost" size="sm" fullWidth onClick={onSignOut} leftIcon={<IcoLogout />}>
          Se déconnecter
        </Button>
      }
    >
      {children}
    </AppShell>
  );
}
