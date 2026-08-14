// Design tokens — Soutra Playce (redesign 2026)
// Remplace packages/shared/src/theme/tokens.ts
//
// FUSION avec la version de `main` : `BRAND`, `colors`, `colorsDark`, `ColorPalette` et
// la convention de dark mode sont conservés à l'identique. Les ajouts du redesign sont
// marqués « NEW » et déclinés dans les DEUX palettes, sinon le mode sombre casse.
//
// Convention pour le dark mode (inchangée) :
// - les couleurs brand (primary, secondary, accent, danger, warning, success)
//   restent identiques entre light et dark (on garde l'identité visuelle).
// - `dark` = couleur du TEXTE PRINCIPAL : en light c'est sombre, en dark
//   c'est clair. NE PAS lire ce token comme « couleur foncée ».
// - `light` = couleur du FOND PRINCIPAL : en light c'est crème, en dark
//   c'est noir.
// - `neutral` : l'échelle est INVERSÉE en dark (neutral[100] dark <-> [800] light).

const BRAND = {
  primary: {
    50:  '#FFF1E6',
    100: '#FFE0CC',
    200: '#FFC299',
    300: '#FFA366',
    400: '#FF8533',
    500: '#FF6B1A', // Soutra Orange — CTA principal
    600: '#E5500D', // état pressed du CTA
    700: '#B33D07',
    800: '#802A05',
    900: '#4D1A03',
  },
  secondary: {
    50:  '#E6FAF6',
    500: '#00B894', // Soutra-Pay Green — paiement, confiance
    600: '#009A7B',
    700: '#007A60',
  },
  accent: {
    500: '#0984E3', // Lagune Blue — liens
  },
  danger: '#E63946',   // SOS Red
  warning: '#FFC93C',  // Akwaba Yellow
  success: '#00B894',
} as const;

export const colors = {
  ...BRAND,
  dark: '#1A1D2E',     // Texte principal (light theme : Nuit Abidjan)
  light: '#FAF7F2',    // Fond principal (light theme : Sable)
  neutral: {
    50:  '#F8FAFC',
    100: '#F1F5F9',
    200: '#E2E8F0',
    300: '#CBD5E1',
    400: '#94A3B8',
    500: '#64748B',
    600: '#475569',
    700: '#334155',
    800: '#1E293B',
    900: '#0F172A',
  },

  // NEW — surfaces du redesign. L'app tourne sur un fond sable, pas sur du blanc pur :
  // les cartes blanches ne se détachent qu'à cette condition.
  surface: {
    canvas: '#F7F4EF',   // fond d'écran
    card:   '#FFFFFF',   // cartes, listes, feuilles
    sunken: '#EDE8E0',   // pilules inactives, avatars, boutons désactivés
    inverse: '#1A1D2E',  // cartes solde / fidélité
    hairline: 'rgba(26,29,46,0.08)', // séparateurs
  },

  // NEW — texte sur fond sable. Un seul encre, décliné en opacité.
  ink: {
    strong: '#1A1D2E',
    muted:  'rgba(26,29,46,0.55)',
    faint:  'rgba(26,29,46,0.42)',
    onDark: '#FFFFFF',
    onDarkMuted: 'rgba(255,255,255,0.60)',
  },

  // NEW — badges d'état. Paire fond/texte obligatoire, jamais une couleur seule :
  // c'est ce qui rend l'état lisible en plein soleil et en mode sombre.
  state: {
    openBg: '#0E7C5E',   openFg: '#FFFFFF',   // « Ferme à 23h »
    closedBg: 'rgba(26,29,46,0.62)', closedFg: '#FFFFFF',
    pendingBg: '#FEF3C7', pendingFg: '#92400E', // « En attente »
    liveBg: '#E4EDFB',   liveFg: '#12447F',   // « En préparation »
    doneBg: '#DCF5EC',   doneFg: '#0B5F48',   // payé, séquestre, confirmé
    alertBg: '#FEE2E2',  alertFg: '#991B1B',
  },

  // NEW — montants
  money: {
    credit: '#0E7C5E',   // montant entrant
    debit:  '#1A1D2E',   // montant sortant
    escrow: '#0B5F48',   // séquestre
  },
} as const;

// Palette dark — même shape, valeurs inversées sur dark/light/neutral.
// Les screens utilisent `useColors()` pour récupérer la bonne palette au runtime.
export const colorsDark = {
  ...BRAND,
  dark: '#F5F5F7',     // Texte principal en dark theme (gris très clair)
  light: '#0E1116',    // Fond principal en dark theme (presque noir)
  neutral: {
    50:  '#0F172A',
    100: '#1E293B',
    200: '#334155',
    300: '#475569',
    400: '#64748B',
    500: '#94A3B8',
    600: '#CBD5E1',
    700: '#E2E8F0',
    800: '#F1F5F9',
    900: '#F8FAFC',
  },

  // NEW — en dark, la hiérarchie s'inverse : le fond descend, la carte remonte.
  // `card` n'est jamais noir pur, sinon les élévations disparaissent.
  surface: {
    canvas: '#0E1116',
    card:   '#171B22',
    sunken: '#232833',
    inverse: '#F5F5F7',  // carte solde en clair sur fond sombre
    hairline: 'rgba(245,245,247,0.10)',
  },

  // NEW — encre claire, mêmes paliers d'opacité qu'en light.
  ink: {
    strong: '#F5F5F7',
    muted:  'rgba(245,245,247,0.58)',
    faint:  'rgba(245,245,247,0.42)',
    onDark: '#1A1D2E',        // texte posé sur `surface.inverse`, donc sombre ici
    onDarkMuted: 'rgba(26,29,46,0.62)',
  },

  // NEW — fonds de badge assombris, textes remontés en luminosité pour tenir
  // le contraste AA sur `surface.card`.
  state: {
    openBg: '#12A87D',   openFg: '#06231B',
    closedBg: 'rgba(245,245,247,0.22)', closedFg: '#F5F5F7',
    pendingBg: '#3B2E10', pendingFg: '#FCD97A',
    liveBg: '#152A45',   liveFg: '#9CC4F5',
    doneBg: '#0F2E25',   doneFg: '#7BE0BE',
    alertBg: '#3A1717',  alertFg: '#FCA5A5',
  },

  // NEW — le débit suit l'encre principale, comme en light.
  money: {
    credit: '#7BE0BE',
    debit:  '#F5F5F7',
    escrow: '#5CCFAB',
  },
} as const;

// Type structurel pour pouvoir typer indifféremment `colors` (light) et
// `colorsDark` — sans les types littéraux qui les rendraient incompatibles.
export type ColorPalette = {
  primary: { 50: string; 100: string; 200: string; 300: string; 400: string; 500: string; 600: string; 700: string; 800: string; 900: string };
  secondary: { 50: string; 500: string; 600: string; 700: string };
  accent: { 500: string };
  danger: string;
  warning: string;
  success: string;
  dark: string;
  light: string;
  neutral: { 50: string; 100: string; 200: string; 300: string; 400: string; 500: string; 600: string; 700: string; 800: string; 900: string };
  surface: { canvas: string; card: string; sunken: string; inverse: string; hairline: string };
  ink: { strong: string; muted: string; faint: string; onDark: string; onDarkMuted: string };
  state: {
    openBg: string; openFg: string;
    closedBg: string; closedFg: string;
    pendingBg: string; pendingFg: string;
    liveBg: string; liveFg: string;
    doneBg: string; doneFg: string;
    alertBg: string; alertFg: string;
  };
  money: { credit: string; debit: string; escrow: string };
};

// Outfit remplace Cabinet Grotesk : disponible sur Google Fonts, chargeable via
// expo-font, et lisible à 10 px sur les badges (ce que Cabinet Grotesk ne tient pas).
// Charger Outfit_400Regular / 500Medium / 600SemiBold / 700Bold.
export const typography = {
  fontFamily: {
    display: 'Outfit_700Bold',
    body: 'Outfit_400Regular',
    medium: 'Outfit_500Medium',
    semibold: 'Outfit_600SemiBold',
    mono: 'JetBrains Mono, ui-monospace, monospace',
  },
  fontSize: {
    xs: 11,    // badges, méta
    sm: 12.5,  // sous-titres
    base: 14,  // corps
    md: 15,    // libellés de liste
    lg: 17,    // titre de carte
    xl: 21,    // titre de section
    '2xl': 26, // titre d'écran
    '3xl': 32,
    '4xl': 40, // montants (dépôt, solde)
  },
  fontWeight: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
  // NEW — les gros titres et les montants se resserrent, le corps respire.
  letterSpacing: {
    tight: -0.6,
    snug: -0.3,
    normal: 0,
    caps: 0.9, // en-têtes de section en majuscules
  },
  lineHeight: {
    tight: 1.1,
    body: 1.45,
  },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
  '3xl': 64,
  gutter: 20, // NEW — marge horizontale de tous les écrans
} as const;

// Quatre rayons, pas plus. sm = badges, md = pilules et champs,
// lg = cartes, xl = feuilles modales.
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const shadow = {
  sm: '0 1px 3px rgba(26,29,46,0.07)',
  md: '0 2px 10px rgba(26,29,46,0.14)',
  lg: '0 6px 22px rgba(26,29,46,0.18)',
  xl: '0 20px 60px rgba(26,29,46,0.22)',
} as const;

// NEW — un seul endroit pour les règles tactiles.
export const touch = {
  minTarget: 44, // taille minimale d'une zone cliquable (iOS HIG et Material)
  pressScale: 0.985,
  tabBarHeight: 78,
} as const;
