'use client';

import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import {
  AppShell,
  type NavItem,
  type ShellUser,
  IcoGrid, IcoCalendar, IcoTicket, IcoUtensils,
  IcoWallet, IcoMegaphone, IcoGear, IcoLogout,
  IcoChart,
} from '@/components/layout';
import { Button } from '@/components/ui';
import { supabaseBrowser } from '@/lib/supabase';
import {
  businessTypeOf,
  modulesForBusinessType,
  type ProModule,
} from '@soutra/shared';

/**
 * Wrapper Client Component pour l'AppShell de /pro.
 *
 * Les liens utilisent ?tab=XXX au lieu de sous-routes : la page /pro/page.tsx
 * reste monolithique pour cette PR — sa refonte profonde en routes séparées
 * sera faite plus tard. Cela permet d'avoir le shell responsive immédiatement
 * sans casser la logique métier (1500+ lignes).
 *
 * PR2 onboarding : la sidebar est filtrée dynamiquement selon le businessType
 * du venue actif (Restaurant → Réservations/Menu ; Hôtel → Chambres/Bookings ;
 * Magasin → Catalogue/Commandes ; etc.). Le venue actif vient de ?venue=ID
 * dans l'URL si présent, sinon du 1er venue de l'owner (fallback).
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

/**
 * Catalogue complet des onglets Pro. Une fois calculée, la nav effective
 * = filtrée selon les modules disponibles pour le businessType du venue
 * actif (cf. MODULES_BY_BUSINESS_TYPE dans @soutra/shared).
 */
const ALL_NAV_ITEMS: Record<ProModule, NavItem> = {
  'dashboard':      { id: 'dashboard',      label: 'Dashboard',              href: '/pro?tab=dashboard',      icon: <IcoGrid />,      inBottomNav: true, match: 'exact' },
  'reservations':   { id: 'reservations',   label: 'Réservations',           href: '/pro?tab=reservations',   icon: <IcoCalendar />,  inBottomNav: true, match: 'exact' },
  'events':         { id: 'events',         label: 'Événements',             href: '/pro?tab=events',         icon: <IcoTicket />,    inBottomNav: true, match: 'exact' },
  'menu':           { id: 'menu',           label: 'Menu',                   href: '/pro?tab=menu',           icon: <IcoUtensils />,                     match: 'exact' },
  'shop-products':  { id: 'shop-products',  label: 'Catalogue',              href: '/pro?tab=shop-products',  icon: <IcoBox />,                          match: 'exact' },
  'shop-orders':    { id: 'shop-orders',    label: 'Commandes',              href: '/pro?tab=shop-orders',    icon: <IcoCart />,                         match: 'exact' },
  'hotel-rooms':    { id: 'hotel-rooms',    label: 'Chambres',               href: '/pro?tab=hotel-rooms',    icon: <IcoBed />,                          match: 'exact' },
  'hotel-bookings': { id: 'hotel-bookings', label: 'Réservations chambres',  href: '/pro?tab=hotel-bookings', icon: <IcoKey />,                          match: 'exact' },
  'analytics':      { id: 'analytics',      label: 'Analytics',              href: '/pro?tab=analytics',      icon: <IcoChart />,                        match: 'exact' },
  'finances':       { id: 'finances',       label: 'Finances',               href: '/pro?tab=finances',       icon: <IcoWallet />,    inBottomNav: true, match: 'exact' },
  'marketing':      { id: 'marketing',      label: 'Marketing',              href: '/pro?tab=marketing',      icon: <IcoMegaphone />,                    match: 'exact' },
  'settings':       { id: 'settings',       label: 'Paramètres',             href: '/pro?tab=settings',       icon: <IcoGear />,                         match: 'exact' },
};

/** Fallback safe quand l'user n'a pas encore de venue : nav minimale. */
const FALLBACK_MODULES: ProModule[] = ['dashboard', 'analytics', 'marketing', 'finances', 'settings'];

export function ProShell({ user, children }: { user: ShellUser; children: ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const supabase = supabaseBrowser();

  // Catégorie du venue actif. Lue depuis la DB côté client pour piloter le
  // filtrage de la nav. Si l'URL contient ?venue=ID on prend ce venue ; sinon
  // on prend le premier venue dont le user est owner.
  const venueIdFromUrl = searchParams?.get('venue') ?? null;
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Sur /pro/onboard le user n'a pas encore de venue → on skip la requête
  // pour économiser un round-trip Supabase. La règle des hooks impose
  // toutefois d'appeler useEffect inconditionnellement (le bypass JSX est
  // plus bas, après tous les hooks).
  const isOnboard = !!pathname?.startsWith('/pro/onboard');

  useEffect(() => {
    if (isOnboard) return;
    let mounted = true;
    (async () => {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) return;
      let query = (supabase as any)
        .from('venues')
        .select('category')
        .eq('owner_id', u.id);
      if (venueIdFromUrl) {
        query = query.eq('id', venueIdFromUrl);
      }
      query = query.limit(1).maybeSingle();
      const { data } = await query;
      if (mounted) setActiveCategory((data as { category?: string } | null)?.category ?? null);
    })();
    return () => { mounted = false; };
  }, [supabase, venueIdFromUrl, isOnboard]);

  const navItems = useMemo<NavItem[]>(() => {
    // Tant qu'on n'a pas la catégorie : nav minimale (évite un flash de la
    // nav complète puis filtrage).
    if (activeCategory === null) {
      return FALLBACK_MODULES.map((m) => ALL_NAV_ITEMS[m]);
    }
    const bt = businessTypeOf(activeCategory);
    const modules = modulesForBusinessType(bt);
    return modules.map((m) => ALL_NAV_ITEMS[m]);
  }, [activeCategory]);

  const onSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  // PR3 onboarding : le wizard /pro/onboard tourne en pleine largeur sans
  // sidebar (le user n'a pas encore de venue, donc pas de navigation utile).
  // On bypass AppShell — l'auth garde-fou reste assurée par apps/web/app/pro/layout.tsx
  // côté server. Le early return DOIT rester après tous les hooks (React rules).
  if (isOnboard) {
    return <>{children}</>;
  }

  return (
    <AppShell
      appLabel="Espace Pro"
      homeHref="/"
      navItems={navItems}
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
