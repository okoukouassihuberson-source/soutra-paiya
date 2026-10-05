import { colorsDark, type ColorPalette } from '@soutra/shared';

// Couleurs sémantiques de l'espace organisateur (clair / sombre). Module pur (sans React Native) : testé en Node.
export type ToneKey = 'amber' | 'green' | 'blue' | 'grey' | 'red' | 'orange';

export const TONES_LIGHT: Record<ToneKey, { bg: string; fg: string }> = {
  amber: { bg: '#FEF3C7', fg: '#92400E' }, green: { bg: '#D1FAE5', fg: '#065F46' }, blue: { bg: '#DBEAFE', fg: '#1E40AF' },
  grey: { bg: '#E5E7EB', fg: '#374151' }, red: { bg: '#FEE2E2', fg: '#B91C1C' }, orange: { bg: '#FFEDD5', fg: '#9A3412' },
};
// Fonds translucides : superposés à `c.light` (fond d'écran) ou à la surface des cartes.
export const TONES_DARK: Record<ToneKey, { bg: string; fg: string }> = {
  amber: { bg: 'rgba(245,158,11,0.20)', fg: '#FCD34D' }, green: { bg: 'rgba(16,185,129,0.20)', fg: '#6EE7B7' }, blue: { bg: 'rgba(59,130,246,0.22)', fg: '#93C5FD' },
  grey: { bg: 'rgba(148,163,184,0.22)', fg: '#CBD5E1' }, red: { bg: 'rgba(239,68,68,0.22)', fg: '#FCA5A5' }, orange: { bg: 'rgba(249,115,22,0.22)', fg: '#FDBA74' },
};

export function orgTones(c: ColorPalette) {
  const dark = c.light === colorsDark.light;
  const pill = dark ? TONES_DARK : TONES_LIGHT;
  return {
    dark,
    surface: dark ? c.neutral[100] : '#fff',   // cartes, champs, puces
    onPrimary: '#101828',                      // texte sur fond orange (contraste AA)
    pill,
    ok: pill.green, err: pill.red,
    warn: dark ? '#FCD34D' : '#92400E',
    green: '#047857', danger: '#DC2626',
    resultText: dark ? '#E5E7EB' : '#111827',
  };
}
