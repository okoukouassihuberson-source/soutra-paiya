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
      },
    },
  },
  plugins: [],
};
export default config;
