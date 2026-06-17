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
// Icône panier pour les onglets boutique (Catalogue + Commandes)
const IcoCart = (p: React.SVGProps<SVGSVGElement>) => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
    <circle cx="9" cy="21" r="1" />
    <circle cx="20" cy="21" r="1" />
    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
  </svg>
);
const IcoBox = (p: React.SVGProps<SVGSVGElement>) => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);
// Icônes Hôtel (lit + clé)
const IcoBed = (p: React.SVGProps<SVGSVGElement>) => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M2 4v16" /><path d="M22 4v16" /><path d="M2 8h20" />
    <path d="M2 16h20" /><path d="M6 8v4h12V8" />
  </svg>
);
const IcoKey = (p: React.SVGProps<SVGSVGElement>) => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
    <circle cx={8} cy={15} r={4} />
    <path d="M10.5 12.5 21 2" /><path d="M16 8l3-3" /><path d="M21 7l-3-3" />
  </svg>
);

const NAV: NavItem[] = [
  { id: 'dashboard',     label: 'Dashboard',    href: '/pro?tab=dashboard',     icon: <IcoGrid />,      inBottomNav: true, match: 'exact' },
  { id: 'reservations',  label: 'Réservations', href: '/pro?tab=reservations',  icon: <IcoCalendar />,  inBottomNav: true, match: 'exact' },
  { id: 'events',        label: 'Événements',   href: '/pro?tab=events',        icon: <IcoTicket />,    inBottomNav: true, match: 'exact' },
  { id: 'menu',          label: 'Menu',         href: '/pro?tab=menu',          icon: <IcoUtensils />,                     match: 'exact' },
  // Onglets BOUTIQUE — visibles uniquement si le venue a une catégorie compatible
  // (gate côté pro/page.tsx via la prop venue.category). Si non compatible, le
  // tab simplement ne rend rien et la sidebar le masque via CSS.
  { id: 'shop-products', label: 'Catalogue',    href: '/pro?tab=shop-products', icon: <IcoBox />,                          match: 'exact' },
  { id: 'shop-orders',   label: 'Commandes',    href: '/pro?tab=shop-orders',   icon: <IcoCart />,                         match: 'exact' },
  // Onglets HÔTEL — visibles si businessType='hotel_rooms' (gate dans pro/page.tsx)
  { id: 'hotel-rooms',   label: 'Chambres',     href: '/pro?tab=hotel-rooms',   icon: <IcoBed />,                          match: 'exact' },
  { id: 'hotel-bookings',label: 'Réservations chambres', href: '/pro?tab=hotel-bookings', icon: <IcoKey />,                match: 'exact' },
  { id: 'finances',      label: 'Finances',     href: '/pro?tab=finances',      icon: <IcoWallet />,    inBottomNav: true, match: 'exact' },
  { id: 'marketing',     label: 'Marketing',    href: '/pro?tab=marketing',     icon: <IcoMegaphone />,                    match: 'exact' },
  { id: 'settings',      label: 'Paramètres',   href: '/pro?tab=settings',      icon: <IcoGear />,                         match: 'exact' },
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
