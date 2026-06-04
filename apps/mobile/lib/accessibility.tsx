// ============================================================================
// accessibility.tsx — mode accessibilité 100% voix pour Sia (Phase 6).
//
// État global persisté en AsyncStorage. Quand activé :
//   • L'app ouvre directement le modal vocal au lancement (au lieu du home)
//   • Les écrans pivot (venue, tickets, wallet, pro) speak leur contenu au mount
//   • Sia parle automatiquement chaque réponse (TTS forcé, pas de toggle)
//   • L'always-listening reste actif après chaque tour (Phase 1 déjà OK)
//
// Cible : malvoyants, non-voyants, personnes âgées, ou tout utilisateur qui
// veut une expérience 100% vocale.
// ============================================================================

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { voice, type VoiceLocale } from './voice';

const STORAGE_KEY = 'soutra:accessibilityMode';

type Ctx = {
  /** True si le mode accessibilité est actif. */
  enabled: boolean;
  /** Hydratée depuis AsyncStorage au mount (undefined avant). */
  hydrated: boolean;
  setEnabled: (on: boolean) => Promise<void>;
};

const AccessibilityCtx = createContext<Ctx | null>(null);

export function AccessibilityProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate au mount
  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (!mounted) return;
        setEnabledState(v === '1');
        setHydrated(true);
      })
      .catch(() => { if (mounted) setHydrated(true); });
    return () => { mounted = false; };
  }, []);

  const setEnabled = useCallback(async (on: boolean) => {
    setEnabledState(on);
    await AsyncStorage.setItem(STORAGE_KEY, on ? '1' : '0');
  }, []);

  const value = useMemo(() => ({ enabled, hydrated, setEnabled }), [enabled, hydrated, setEnabled]);

  return (
    <AccessibilityCtx.Provider value={value}>
      {children}
    </AccessibilityCtx.Provider>
  );
}

export function useAccessibilityMode(): Ctx {
  const ctx = useContext(AccessibilityCtx);
  if (!ctx) {
    // Provider absent — fallback sécurisé : mode désactivé.
    return {
      enabled: false,
      hydrated: true,
      setEnabled: async () => { /* no-op */ },
    };
  }
  return ctx;
}

/**
 * Hook : speak le résumé d'un écran au focus si l'accessibilité est on.
 * Le `text` peut être une string ou une factory (utile si le contenu dépend
 * de données async — on attend qu'elles soient prêtes avant de speak).
 *
 * Stop la lecture au blur (changement d'écran).
 */
export function useSpokenScreen(
  text: string | (() => string | null),
  opts: { locale?: VoiceLocale; enabled?: boolean } = {},
): void {
  const { enabled: accessibility } = useAccessibilityMode();
  // Override possible : `opts.enabled=false` désactive même en mode accessibility
  const shouldSpeak = (opts.enabled ?? true) && accessibility;

  useFocusEffect(
    useCallback(() => {
      if (!shouldSpeak || !voice.isTtsAvailable()) return;
      const resolved = typeof text === 'function' ? text() : text;
      if (!resolved || resolved.trim().length === 0) return;
      // Petit délai pour laisser l'écran s'animer in
      const t = setTimeout(() => {
        void voice.speak(resolved, { locale: opts.locale ?? 'fr-FR' });
      }, 350);
      return () => {
        clearTimeout(t);
        void voice.stopSpeaking();
      };
    // text peut être une factory qui change à chaque render — on assume que
    // les callers stabilisent eux-mêmes via useMemo si nécessaire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shouldSpeak, typeof text === 'string' ? text : '__factory__', opts.locale]),
  );
}
