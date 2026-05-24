/**
 * VoiceSearchSheet — modal d'écoute vocale, transcription live.
 *
 * Utilise `expo-speech-recognition` qui s'appuie sur la STT native du
 * device (SFSpeechRecognizer iOS, RecognitionListener Android).
 * Gratuit, rapide, fonctionne hors-ligne quand la langue est téléchargée.
 *
 * Limites :
 * - Nécessite un dev build (pas Expo Go SDK 53+).
 * - Si le module natif n'est pas dispo, on log un warning et on ferme
 *   proprement sans crash.
 */

import { useEffect, useRef, useState } from 'react';
import { View, Text, Modal, Pressable, StyleSheet, Animated, Easing, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, radius, spacing } from '@soutra/shared';

// Le module est en `require` dynamique pour éviter le crash si la lib
// native n'est pas linkée (cas Expo Go).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ExpoSpeechRecognitionModule: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ExpoSpeechRecognitionModule = require('expo-speech-recognition').ExpoSpeechRecognitionModule;
} catch {
  ExpoSpeechRecognitionModule = null;
}

type Props = {
  visible: boolean;
  /** Langue BCP-47. Par défaut fr-FR (notre user-base est francophone). */
  locale?: string;
  onClose: () => void;
  onResult: (text: string) => void;
};

export function VoiceSearchSheet({ visible, onClose, onResult, locale = 'fr-FR' }: Props) {
  const [transcript, setTranscript] = useState('');
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pulse = useRef(new Animated.Value(1)).current;

  // Animation pulse du micro pendant l'écoute.
  useEffect(() => {
    if (!listening) { pulse.setValue(1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.4, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [listening, pulse]);

  // Démarrage / arrêt de la reconnaissance quand la modale s'ouvre/ferme.
  useEffect(() => {
    if (!visible) return;
    if (!ExpoSpeechRecognitionModule) {
      setError('Reconnaissance vocale indisponible (lance un dev build).');
      return;
    }

    let cancelled = false;
    setTranscript('');
    setError(null);

    (async () => {
      try {
        // Permissions micro + reconnaissance (iOS).
        const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (!perm.granted) {
          setError('Autorisation refusée. Va dans les réglages du téléphone.');
          return;
        }
        if (cancelled) return;

        // Listeners.
        const subResult = ExpoSpeechRecognitionModule.addListener('result', (e: { results: { transcript: string }[]; isFinal?: boolean }) => {
          const t = e.results?.[0]?.transcript;
          if (typeof t === 'string') setTranscript(t);
        });
        const subEnd = ExpoSpeechRecognitionModule.addListener('end', () => {
          setListening(false);
        });
        const subErr = ExpoSpeechRecognitionModule.addListener('error', (e: { error: string; message?: string }) => {
          setError(e.message || e.error || 'Erreur de reconnaissance');
          setListening(false);
        });

        // Démarrage.
        ExpoSpeechRecognitionModule.start({
          lang: locale,
          interimResults: true,
          continuous: false,
          maxAlternatives: 1,
        });
        if (!cancelled) setListening(true);

        return () => {
          subResult.remove(); subEnd.remove(); subErr.remove();
          try { ExpoSpeechRecognitionModule.stop(); } catch { /* noop */ }
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg || 'Impossible de démarrer le micro');
      }
    })();

    return () => {
      cancelled = true;
      try { ExpoSpeechRecognitionModule?.stop(); } catch { /* noop */ }
    };
  }, [visible, locale]);

  function handleConfirm() {
    const text = transcript.trim();
    if (!text) {
      onClose();
      return;
    }
    onResult(text);
  }

  function handleRestart() {
    if (!ExpoSpeechRecognitionModule) return;
    setTranscript('');
    setError(null);
    try {
      ExpoSpeechRecognitionModule.stop();
      ExpoSpeechRecognitionModule.start({ lang: locale, interimResults: true, continuous: false });
      setListening(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.backdrop}>
        <SafeAreaView style={s.sheet} edges={['bottom']}>
          <View style={s.handle} />

          <View style={s.header}>
            <Text style={s.title}>Recherche vocale</Text>
            <Pressable onPress={onClose} hitSlop={10} style={s.closeBtn}>
              <Ionicons name="close" size={20} color={colors.dark} />
            </Pressable>
          </View>

          {error ? (
            <View style={s.body}>
              <View style={[s.micWrap, { backgroundColor: '#fee2e2' }]}>
                <Ionicons name="mic-off" size={40} color={colors.danger} />
              </View>
              <Text style={s.errorText}>{error}</Text>
              <Pressable onPress={onClose} style={s.actionBtn}>
                <Text style={s.actionBtnText}>Fermer</Text>
              </Pressable>
            </View>
          ) : (
            <View style={s.body}>
              <Animated.View style={[s.micWrap, { transform: [{ scale: pulse }] }]}>
                <View style={s.micInner}>
                  <Ionicons name={listening ? 'mic' : 'mic-outline'} size={40} color="#fff" />
                </View>
              </Animated.View>

              <Text style={s.status}>
                {listening ? 'Parle maintenant…' : transcript ? 'Tap « Rechercher » ou réessaie' : 'Initialisation…'}
              </Text>

              <View style={s.transcriptBox}>
                <Text style={s.transcript}>
                  {transcript || <Text style={s.placeholder}>« Maquis près de moi », « pizza Cocody »…</Text>}
                </Text>
              </View>

              <View style={s.actions}>
                <Pressable onPress={handleRestart} style={({ pressed }) => [s.actionBtnGhost, pressed && { opacity: 0.7 }]}>
                  <Ionicons name="refresh" size={16} color={colors.dark} />
                  <Text style={s.actionBtnGhostText}>Réessayer</Text>
                </Pressable>
                <Pressable
                  onPress={handleConfirm}
                  disabled={!transcript}
                  style={({ pressed }) => [
                    s.actionBtn,
                    !transcript && s.actionBtnDisabled,
                    pressed && transcript && { opacity: 0.9, transform: [{ scale: 0.97 }] },
                  ]}
                >
                  <Ionicons name="search" size={16} color="#fff" />
                  <Text style={s.actionBtnText}>Rechercher</Text>
                </Pressable>
              </View>
            </View>
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

/** Renvoie true si le module natif est dispo (dev build), false si Expo Go. */
export function isVoiceRecognitionAvailable(): boolean {
  return !!ExpoSpeechRecognitionModule;
}

const s = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: colors.light, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: spacing.lg },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.neutral[300], alignSelf: 'center', marginTop: spacing.sm, marginBottom: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.neutral[100] },
  title: { fontSize: typography.fontSize.base, fontWeight: '700', color: colors.dark },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.neutral[100], alignItems: 'center', justifyContent: 'center' },
  body: { padding: spacing.xl, alignItems: 'center' },
  micWrap: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg, backgroundColor: 'rgba(255,107,26,0.15)' },
  micInner: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primary[500], alignItems: 'center', justifyContent: 'center' },
  status: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.dark, marginBottom: spacing.md, textAlign: 'center' },
  transcriptBox: { width: '100%', minHeight: 80, padding: spacing.md, backgroundColor: '#fff', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.neutral[200], marginBottom: spacing.lg },
  transcript: { fontSize: typography.fontSize.base, color: colors.dark, lineHeight: 24 },
  placeholder: { color: colors.neutral[400], fontStyle: 'italic' },
  errorText: { fontSize: typography.fontSize.sm, color: colors.danger, textAlign: 'center', marginBottom: spacing.lg },
  actions: { flexDirection: 'row', gap: spacing.md, width: '100%' },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.md, backgroundColor: colors.primary[500], borderRadius: radius.full, shadowColor: colors.primary[500], shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  actionBtnDisabled: { opacity: 0.4, shadowOpacity: 0 },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: typography.fontSize.sm },
  actionBtnGhost: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.md, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.neutral[200], borderRadius: radius.full },
  actionBtnGhostText: { color: colors.dark, fontWeight: '700', fontSize: typography.fontSize.sm },
});
