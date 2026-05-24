// Design tokens — Soutra-Playce
// Source unique pour Tailwind (web) et StyleSheet (mobile).

export const colors = {
  // Brand
  primary: {
    50:  '#FFF1E6',
    100: '#FFE0CC',
    200: '#FFC299',
    300: '#FFA366',
    400: '#FF8533',
    500: '#FF6B1A', // Soutra Orange — CTA principal
    600: '#E5500D',
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
  dark: '#1A1D2E',     // Nuit Abidjan
  light: '#FAF7F2',    // Sable
  danger: '#E63946',   // SOS Red
  warning: '#FFC93C',  // Akwaba Yellow
  success: '#00B894',
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
} as const;

export const typography = {
  fontFamily: {
    display: 'Cabinet Grotesk, Inter, system-ui, sans-serif',
    body: 'Inter, system-ui, sans-serif',
    mono: 'JetBrains Mono, ui-monospace, monospace',
  },
  fontSize: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 20,
    xl: 25,
    '2xl': 31,
    '3xl': 39,
    '4xl': 49,
  },
  fontWeight: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
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
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const shadow = {
  sm: '0 1px 2px rgba(0,0,0,0.05)',
  md: '0 4px 6px -1px rgba(0,0,0,0.1)',
  lg: '0 10px 15px -3px rgba(0,0,0,0.1)',
  xl: '0 20px 25px -5px rgba(0,0,0,0.15)',
} as const;
