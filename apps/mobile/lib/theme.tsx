/**
 * Theme provider — light / dark / system (auto-detection).
 *
 * Le mode est persisté dans AsyncStorage. Au démarrage on lit la pref
 * stockée ; si rien, on tombe en mode `system` (suit la pref OS).
 *
 * Usage dans un composant :
 *   const c = useColors();          // palette active
 *   const { mode, setMode } = useTheme();  // pour le sélecteur de réglages
 *   const s = useMemo(() => makeStyles(c), [c]);  // factory de styles
 */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance, useColorScheme as useRNColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors as lightColors, colorsDark, type ColorPalette } from '@soutra/shared';

export type ThemeMode = 'light' | 'dark' | 'system';
type Resolved = 'light' | 'dark';

const STORAGE_KEY = 'soutra:theme-mode';

type Ctx = {
  mode: ThemeMode;          // pref user (peut être 'system')
  resolved: Resolved;       // mode effectif après résolution 'system'
  colors: ColorPalette;
  setMode: (m: ThemeMode) => Promise<void>;
};

const ThemeCtx = createContext<Ctx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('system');
  const systemScheme = useRNColorScheme(); // 'light' | 'dark' | null

  // Hydrate la pref persistée au mount.
  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!mounted) return;
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          setModeState(stored);
        }
      })
      .catch(() => { /* pref pas critique */ });
    return () => { mounted = false; };
  }, []);

  const resolved: Resolved = useMemo(() => {
    if (mode === 'system') return systemScheme === 'dark' ? 'dark' : 'light';
    return mode;
  }, [mode, systemScheme]);

  const colors = resolved === 'dark' ? colorsDark : lightColors;

  async function setMode(m: ThemeMode) {
    setModeState(m);
    try { await AsyncStorage.setItem(STORAGE_KEY, m); } catch { /* noop */ }
  }

  const value = useMemo<Ctx>(() => ({ mode, resolved, colors, setMode }), [mode, resolved, colors]);

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme(): Ctx {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

/** Raccourci : retourne juste la palette active. */
export function useColors(): ColorPalette {
  return useTheme().colors;
}

// Optionnel : permet à du code non-React (utilitaires) de lire le mode courant
// sans accrocher React. Suit la pref OS uniquement (pas la persistance user).
export function getSystemResolved(): Resolved {
  return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
}
