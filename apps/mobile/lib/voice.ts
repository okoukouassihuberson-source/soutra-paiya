// ============================================================================
// voice.ts — abstraction TTS + STT pour l'assistant vocal "Sia".
//
// V1 (cette implémentation) :
//   • TTS : expo-speech (synthèse vocale OS natif, gratuit, hors-ligne)
//   • STT : expo-speech-recognition (SFSpeechRecognizer iOS,
//           Android.speech.RecognitionListener Android)
//
// V2/V5 pourront swap pour des APIs premium (ElevenLabs TTS, Whisper STT)
// sans toucher à l'UI grâce à l'interface VoiceModule ci-dessous.
//
// Fallback Expo Go : si les modules natifs ne sont pas linkés (cas Expo Go
// pour speech-recognition en SDK 53+), les méthodes renvoient une erreur
// claire au lieu de crasher l'app.
// ============================================================================

import { Platform } from 'react-native';

// Modules dynamiques — try/catch pour fallback Expo Go quand le module
// natif n'est pas linké.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let SpeechModule: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  SpeechModule = require('expo-speech');
} catch {
  SpeechModule = null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let SpeechRecognitionModule: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  SpeechRecognitionModule = require('expo-speech-recognition').ExpoSpeechRecognitionModule;
} catch {
  SpeechRecognitionModule = null;
}

export type VoiceLocale = 'fr-FR' | 'en-US' | 'fr-CI';

export interface SpeakOptions {
  locale?: VoiceLocale;
  rate?: number;       // 0.1..2, défaut 1
  pitch?: number;      // 0.5..2, défaut 1
  onDone?: () => void; // callback fin de lecture
  onError?: (msg: string) => void;
}

export interface ListenOptions {
  locale?: VoiceLocale;
  /**
   * Si true, l'écoute continue après la 1re phrase détectée (utile pour
   * la conversation continue). Côté iOS, géré nativement ; côté Android,
   * il faut souvent re-démarrer manuellement après chaque silence.
   */
  continuous?: boolean;
  /** Callback appelé à chaque partial result (avant le final). */
  onPartial?: (text: string) => void;
  /** Callback appelé quand l'utilisateur a fini de parler (silence détecté). */
  onFinal: (text: string) => void;
  /** Callback d'erreur (permission refusée, micro inaccessible, etc.). */
  onError?: (msg: string) => void;
}

export interface VoiceModule {
  /** True si l'OS expose la synthèse vocale (expo-speech). */
  isTtsAvailable(): boolean;
  /** True si l'OS expose la reconnaissance vocale (dev build requis). */
  isSttAvailable(): boolean;
  /** True si tout marche (TTS + STT). */
  isFullyAvailable(): boolean;
  /** Synthétise et lit `text` à voix haute. Stop le TTS précédent s'il tourne. */
  speak(text: string, opts?: SpeakOptions): Promise<void>;
  /** Stop immédiatement la lecture TTS courante (no-op si rien ne joue). */
  stopSpeaking(): Promise<void>;
  /** True si une lecture TTS est en cours. */
  isSpeaking(): Promise<boolean>;
  /** Demande la permission micro + reconnaissance (idempotent). */
  requestPermissions(): Promise<{ granted: boolean; canAskAgain: boolean }>;
  /** Démarre une session d'écoute. Stop la précédente s'il y en a une. */
  startListening(opts: ListenOptions): Promise<void>;
  /** Stop l'écoute courante (no-op si rien n'écoute). */
  stopListening(): Promise<void>;
}

// ─── État interne ──────────────────────────────────────────────────────────

let activeListeners: Array<{ remove: () => void }> = [];
let listening = false;

function clearListeners(): void {
  for (const sub of activeListeners) {
    try { sub.remove(); } catch { /* noop */ }
  }
  activeListeners = [];
}

// ─── Implémentation V1 ─────────────────────────────────────────────────────

export const voice: VoiceModule = {
  isTtsAvailable(): boolean {
    return SpeechModule != null;
  },
  isSttAvailable(): boolean {
    return SpeechRecognitionModule != null;
  },
  isFullyAvailable(): boolean {
    return this.isTtsAvailable() && this.isSttAvailable();
  },

  async speak(text: string, opts: SpeakOptions = {}): Promise<void> {
    if (!SpeechModule) {
      opts.onError?.('TTS indisponible — module expo-speech non chargé.');
      return;
    }
    const clean = sanitizeForTts(text);
    if (!clean) return;

    // Stop la lecture précédente pour éviter le chevauchement.
    try { await SpeechModule.stop(); } catch { /* noop */ }

    return new Promise<void>((resolve) => {
      try {
        SpeechModule.speak(clean, {
          language: opts.locale ?? 'fr-FR',
          rate: opts.rate ?? (Platform.OS === 'ios' ? 0.5 : 1), // iOS: 0.5 ≈ normal humain
          pitch: opts.pitch ?? 1,
          onDone: () => { opts.onDone?.(); resolve(); },
          onError: (e: unknown) => {
            const msg = e instanceof Error ? e.message : String(e);
            opts.onError?.(msg);
            resolve();
          },
          onStopped: () => resolve(),
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        opts.onError?.(msg);
        resolve();
      }
    });
  },

  async stopSpeaking(): Promise<void> {
    if (!SpeechModule) return;
    try { await SpeechModule.stop(); } catch { /* noop */ }
  },

  async isSpeaking(): Promise<boolean> {
    if (!SpeechModule) return false;
    try { return await SpeechModule.isSpeakingAsync(); } catch { return false; }
  },

  async requestPermissions(): Promise<{ granted: boolean; canAskAgain: boolean }> {
    if (!SpeechRecognitionModule) {
      return { granted: false, canAskAgain: false };
    }
    try {
      const res = await SpeechRecognitionModule.requestPermissionsAsync();
      return { granted: !!res.granted, canAskAgain: !!res.canAskAgain };
    } catch {
      return { granted: false, canAskAgain: false };
    }
  },

  async startListening(opts: ListenOptions): Promise<void> {
    if (!SpeechRecognitionModule) {
      opts.onError?.('STT indisponible — lance un dev build pour activer le micro.');
      return;
    }
    // Stop la session précédente pour éviter les doublons d'events.
    await this.stopListening();

    const perm = await this.requestPermissions();
    if (!perm.granted) {
      opts.onError?.('Autorisation micro refusée. Ouvre les réglages du téléphone.');
      return;
    }

    try {
      const subResult = SpeechRecognitionModule.addListener(
        'result',
        (e: { results?: { transcript: string }[]; isFinal?: boolean }) => {
          const t = e.results?.[0]?.transcript;
          if (typeof t !== 'string') return;
          if (e.isFinal) {
            opts.onFinal(t);
          } else {
            opts.onPartial?.(t);
          }
        },
      );
      const subEnd = SpeechRecognitionModule.addListener('end', () => {
        listening = false;
      });
      const subErr = SpeechRecognitionModule.addListener(
        'error',
        (e: { error: string; message?: string }) => {
          const msg = e.message || e.error || 'Erreur de reconnaissance';
          opts.onError?.(msg);
          listening = false;
        },
      );
      activeListeners.push(subResult, subEnd, subErr);

      SpeechRecognitionModule.start({
        lang: opts.locale ?? 'fr-FR',
        interimResults: true,
        continuous: !!opts.continuous,
        maxAlternatives: 1,
      });
      listening = true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      opts.onError?.(msg);
      listening = false;
    }
  },

  async stopListening(): Promise<void> {
    if (!SpeechRecognitionModule) return;
    if (listening) {
      try { SpeechRecognitionModule.stop(); } catch { /* noop */ }
      listening = false;
    }
    clearListeners();
  },
};

// ─── Helpers privés ────────────────────────────────────────────────────────

/**
 * Nettoie le texte avant de l'envoyer au TTS :
 * - Retire markdown bold/italic (`**xxx**` → `xxx`)
 * - Retire les emojis (qui sont prononcés à voix haute sur certains TTS)
 * - Retire les URLs (le TTS lit "https deux points slash slash…")
 * - Trim + max 400 chars (les longs paragraphes sont pénibles à écouter)
 */
function sanitizeForTts(raw: string): string {
  let t = raw
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\p{Extended_Pictographic}/gu, '');
  t = t.trim();
  if (t.length > 400) t = t.slice(0, 400) + '…';
  return t;
}
