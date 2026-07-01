# Design system Soutra-Explore (web)

Composants UI réutilisables + AppShell responsive pour les espaces authentifiés (Pro, Admin).

## Composants UI (`components/ui/`)

```tsx
import { Button, Card, Input, Sheet, Avatar, Badge, Skeleton, IconButton, Container } from '@/components/ui';
```

| Composant | Variants / Sizes | Notes |
|---|---|---|
| `Button` | primary / secondary / ghost / outline / danger · sm / md / lg | `loading`, `leftIcon`, `rightIcon`, `fullWidth` |
| `Card` | default / elevated / outlined / subtle · padding none/sm/md/lg | `interactive` ajoute hover |
| `Input` | — | `label`, `hint`, `error`, `leftIcon`, `rightAdornment` ; gère a11y (aria-describedby) |
| `Sheet` | side bottom / left / right / center | Modal centré desktop, bottom-sheet mobile. Fermeture Esc + backdrop |
| `Avatar` | xs / sm / md / lg / xl | Initiale stable selon nom si pas de `src`, image via next/image |
| `Badge` | tones neutral / primary / success / warning / danger / info | |
| `Skeleton` | `width`, `height` (Tailwind), `circle` | |
| `IconButton` | ghost / subtle / outline · sm / md / lg | `aria-label` obligatoire |
| `Container` | sm / md / lg / xl / full | Centré + padding horizontal responsive |

Toutes les variantes utilisent les tokens du design system partagé (`@soutra/shared` : couleurs, typographies, radius).

## AppShell (`components/layout/`)

Layout responsive premium : sidebar fixe à gauche en desktop, drawer + topbar + bottom-nav en mobile.

### Usage type

```tsx
// app/pro/layout.tsx
import { AppShell, type NavItem, IcoGrid, IcoCalendar, IcoWallet, IcoGear } from '@/components/layout';

const NAV: NavItem[] = [
  { id: 'home',  label: 'Dashboard',    href: '/pro',              icon: <IcoGrid />,     inBottomNav: true, match: 'exact' },
  { id: 'res',   label: 'Réservations', href: '/pro/reservations', icon: <IcoCalendar />, inBottomNav: true },
  { id: 'fin',   label: 'Finances',     href: '/pro/finances',     icon: <IcoWallet />,   inBottomNav: true },
  { id: 'set',   label: 'Paramètres',   href: '/pro/settings',     icon: <IcoGear />,     inBottomNav: true },
];

export default function ProLayout({ children, user }: { children: ReactNode; user: any }) {
  return (
    <AppShell
      appLabel="Espace Pro"
      navItems={NAV}
      user={{ name: user.full_name, subtitle: 'Établissement actif' }}
      sidebarFooter={<SignOutButton />}
    >
      {children}
    </AppShell>
  );
}
```

### Caractéristiques

- **Responsive auto** : breakpoint `lg` (1024px). Au-dessous, topbar fixe + bottom-nav. Au-dessus, sidebar fixe 256px.
- **Drawer mobile** : hamburger → `Sheet side="left"` qui rend la même `Sidebar`.
- **Safe areas iOS** : `env(safe-area-inset-top|bottom)` pour les notches et la home-bar.
- **Active state** : `usePathname()` + helper `isActiveNav` (mode `exact` ou `prefix`).
- **Bottom-nav** : automatiquement composée des items avec `inBottomNav: true` (max 5).
- **Icônes** : set SVG inline (`Icons.tsx`) — `IcoGrid`, `IcoCalendar`, `IcoTicket`, `IcoUtensils`, `IcoWallet`, `IcoMegaphone`, `IcoGear`, `IcoUsers`, `IcoStore`, `IcoChart`, `IcoBell`, `IcoHome`, `IcoLogout`. Stroke-2 par défaut, stylable via `currentColor`. Aucune lib externe.

## Architecture des PRs

Cette PR (#2/6) livre **les fondations**. L'AppShell n'est pas encore appliqué à `/pro` et `/admin` car leur refonte (PR 3 et 4) découpera les pages monolithiques actuelles en sous-routes (`/pro/reservations`, `/pro/events`, …) qui composeront proprement avec la sidebar du shell.

- ✅ PR 1 — PWA infra (#36)
- ✅ PR 2 — Design system + AppShell + refonte `/login`
- ⏳ PR 3 — Refonte `/pro` (1527 lignes) en sous-routes utilisant l'AppShell
- ⏳ PR 4 — Refonte `/admin` (1217 lignes) idem
- ⏳ PR 5 — Refonte landing `/` responsive
- ⏳ PR 6 — Performance (lazy, dynamic imports, Lighthouse > 90)
