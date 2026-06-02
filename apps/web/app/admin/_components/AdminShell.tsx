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

// Icône drapeau pour l'onglet Signalements.
const IcoFlag = (p: React.SVGProps<SVGSVGElement>) => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
    <line x1="4" y1="22" x2="4" y2="15" />
  </svg>
);

// Icône clé pour l'onglet Revendications (transfert de propriété).
const IcoKey = (p: React.SVGProps<SVGSVGElement>) => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
    <circle cx={8} cy={15} r={4} />
    <path d="M10.5 12.5 21 2" />
    <path d="M16 8l3-3" />
    <path d="M21 7l-3-3" />
  </svg>
);

// Icône plus pour l'onglet Contributions communautaires.
const IcoPlus = (p: React.SVGProps<SVGSVGElement>) => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
    <circle cx={12} cy={12} r={10} />
    <line x1="12" y1="8" x2="12" y2="16" />
    <line x1="8" y1="12" x2="16" y2="12" />
  </svg>
);

// Icône $ pour l'onglet Monétisation (Super Dashboard).
const IcoCash = (p: React.SVGProps<SVGSVGElement>) => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
    <line x1="12" y1="1" x2="12" y2="23" />
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
);

const NAV: NavItem[] = [
  { id: 'overview',     label: "Vue d'ensemble", href: '/admin?tab=overview',     icon: <IcoGrid />,       inBottomNav: true, match: 'exact' },
  { id: 'analytics',    label: 'Analytics',      href: '/admin?tab=analytics',    icon: <IcoChart />,      inBottomNav: true, match: 'exact' },
  { id: 'users',        label: 'Utilisateurs',   href: '/admin?tab=users',        icon: <IcoUsers />,      inBottomNav: true, match: 'exact' },
  { id: 'venues',       label: 'Établissements', href: '/admin?tab=venues',       icon: <IcoStore />,      inBottomNav: true, match: 'exact' },
  { id: 'reports',      label: 'Signalements',   href: '/admin?tab=reports',      icon: <IcoFlag />,       inBottomNav: true, match: 'exact' },
  { id: 'claims',       label: 'Revendications', href: '/admin?tab=claims',       icon: <IcoKey />,                           match: 'exact' },
  { id: 'submissions',  label: 'Contributions',  href: '/admin?tab=submissions',  icon: <IcoPlus />,                          match: 'exact' },
  { id: 'monetization', label: 'Monétisation',   href: '/admin?tab=monetization', icon: <IcoCash />,                          match: 'exact' },
  { id: 'transactions', label: 'Transactions',   href: '/admin?tab=transactions', icon: <IcoWallet />,                        match: 'exact' },
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
