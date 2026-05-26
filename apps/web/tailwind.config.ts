import type { Config } from 'tailwindcss';
import { colors, typography, radius } from '@soutra/shared';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: colors.primary,
        secondary: colors.secondary,
        accent: colors.accent,
        dark: colors.dark,
        light: colors.light,
        danger: colors.danger,
        warning: colors.warning,
        success: colors.success,
        neutral: colors.neutral,
      },
      fontFamily: {
        display: typography.fontFamily.display.split(',').map(s => s.trim()),
        body: typography.fontFamily.body.split(',').map(s => s.trim()),
        mono: typography.fontFamily.mono.split(',').map(s => s.trim()),
      },
      borderRadius: {
        sm: `${radius.sm}px`,
        md: `${radius.md}px`,
        lg: `${radius.lg}px`,
        xl: `${radius.xl}px`,
      },
      animation: {
        'float': 'float 6s ease-in-out infinite',
        'glow-pulse': 'glowPulse 3s ease-in-out infinite',
        'sheet-fade': 'sheetFade 200ms ease-out',
        'sheet-slide-up': 'sheetSlideUp 220ms cubic-bezier(0.16, 1, 0.3, 1)',
        'sheet-zoom': 'sheetZoom 180ms cubic-bezier(0.16, 1, 0.3, 1)',
        'sheet-slide-right': 'sheetSlideRight 220ms cubic-bezier(0.16, 1, 0.3, 1)',
        'sheet-slide-left': 'sheetSlideLeft 220ms cubic-bezier(0.16, 1, 0.3, 1)',
        'fade-in': 'sheetFade 180ms ease-out',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-12px)' },
        },
        glowPulse: {
          '0%, 100%': { opacity: '0.5' },
          '50%': { opacity: '1' },
        },
        sheetFade: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        sheetSlideUp: {
          from: { transform: 'translateY(16px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        sheetZoom: {
          from: { transform: 'translate(-50%, -50%) scale(0.96)', opacity: '0' },
          to: { transform: 'translate(-50%, -50%) scale(1)', opacity: '1' },
        },
        sheetSlideRight: {
          from: { transform: 'translateX(-100%)' },
          to: { transform: 'translateX(0)' },
        },
        sheetSlideLeft: {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [],
};
export default config;
