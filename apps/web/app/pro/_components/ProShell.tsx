'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  AppShell,
  type NavItem,
  type ShellUser,
  IcoGrid, IcoCalendar, IcoTicket, IcoUtensils,
  IcoWallet, IcoMegaphone, IcoGear, IcoLogout,
} from '@/components/layout';
import { Button } from '@/components/ui';
import { supabaseBrowser } from '@/lib/supabase';

/**
 * Wrapper Client Component pour l'AppShell de /pro.
 *
 * Les liens utilisent ?tab=XXX au lieu de sous-routes : la page /pro/page.tsx
 * reste monolithique pour cette PR — sa refonte profonde en routes séparées
 * sera faite plus tard. Cela permet d'avoir le shell responsive immédiatement
 * sans casser la logique métier (1500+ lignes).
 */
const NAV: NavItem[] = [
  { id: 'dashboard',    label: 'Dashboard',    href: '/pro?tab=dashboard',    icon: <IcoGrid />,      inBottomNav: true, match: 'exact' },
  { id: 'reservations', label: 'Réservations', href: '/pro?tab=reservations', icon: <IcoCalendar />,  inBottomNav: true, match: 'exact' },
  { id: 'events',       label: 'Événements',   href: '/pro?tab=events',       icon: <IcoTicket />,    inBottomNav: true, match: 'exact' },
  { id: 'menu',         label: 'Menu',         href: '/pro?tab=menu',         icon: <IcoUtensils />,                     match: 'exact' },
  { id: 'finances',     label: 'Finances',     href: '/pro?tab=finances',     icon: <IcoWallet />,    inBottomNav: true, match: 'exact' },
  { id: 'marketing',    label: 'Marketing',    href: '/pro?tab=marketing',    icon: <IcoMegaphone />,                    match: 'exact' },
  { id: 'settings',     label: 'Paramètres',   href: '/pro?tab=settings',     icon: <IcoGear />,                         match: 'exact' },
];

export function ProShell({ user, children }: { user: ShellUser; children: ReactNode }) {
  const router = useRouter();
  const supabase = supabaseBrowser();

  const onSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <AppShell
      appLabel="Espace Pro"
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
