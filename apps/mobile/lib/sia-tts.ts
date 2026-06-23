/**
 * SIA TTS — text-to-speech minimaliste avec fallback silencieux.
 *
 * Utilise expo-speech (gratuit, natif, fonctionne hors-ligne). Si la lib
 * n'est pas linkée (cas Expo Go ou build sans rebuild natif), les appels
 * ne plantent pas — on devient silencieux et l'UX reste fonctionnelle en
 * mode texte.
 *
 * Locale par défaut : fr-FR. La voix exacte dépend de l'OS.
 */

// Require dynamique : Expo Go ou bundle sans le module natif → on no-op.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Speech: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Speech = require('expo-speech');
} catch {
  Speech = null;
}

export function siaSpeak(text: string, opts?: { locale?: string }) {
  if (!Speech || !text) return;
  try {
    // Stop la précédente avant d'en démarrer une nouvelle pour éviter
    // l'overlap de voix en cas de réponses rapides.
    Speech.stop?.();
    Speech.speak?.(text, {
      language: opts?.locale ?? 'fr-FR',
      pitch: 1.0,
      rate: 1.0,
    });
  } catch {
    /* fallback silencieux */
  }
}

export function siaStopSpeaking() {
  if (!Speech) return;
  try { Speech.stop?.(); } catch { /* noop */ }
}

/** Indique si le TTS est dispo (utile pour griser le bouton volume si non). */
export function isTtsAvailable(): boolean {
  return !!Speech;
}
