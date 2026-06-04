// ============================================================================
// VoiceConversation — modal plein écran de conversation vocale continue.
//
// Cycle : écoute → final transcript → askAssistant (Claude) → speak réponse →
//         re-écoute automatique.
//
// Pour quitter, l'utilisateur tap "Stop". Le micro et le TTS sont arrêtés
// proprement (cleanup au démontage).
//
// Fallback Expo Go : si STT indispo (cas Expo Go SDK 53+), on affiche un
// message clair "Lance un dev build" plutôt que crasher.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, Modal, Pressable, StyleSheet, Animated, Easing, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { typography, radius, spacing, formatXOF, type ColorPalette } from '@soutra/shared';
import { useColors } from '@/lib/theme';
import { voice } from '@/lib/voice';
import { askAssistant, runAction, type ChatMessage, type AssistantAction, type PayReservationResult } from '@/lib/assistant';
import { PaymentConfirmModal } from '@/components/PaymentConfirmModal';

type Status = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

const STATUS_LABEL: Record<Status, string> = {
  idle: 'Tap le micro pour parler',
  listening: 'Parle, je t\'écoute…',
  thinking: 'Sia réfléchit…',
  speaking: 'Sia te répond…',
  error: 'Oups, quelque chose a échoué',
};

const STATUS_COLOR: Record<Status, 'primary' | 'success' | 'amber' | 'neutral' | 'danger'> = {
  idle: 'neutral',
  listening: 'success',
  thinking: 'amber',
  speaking: 'primary',
  error: 'danger',
};

type Props = {
  visible: boolean;
  /** Historique transmis à Claude (sans le message de bienvenue). */
  initialHistory?: ChatMessage[];
  onClose: () => void;
  /** Callback : permet au parent de stocker l'historique mis à jour. */
  onHistoryChange?: (history: ChatMessage[]) => void;
};

export function VoiceConversation({
  visible,
  initialHistory = [],
  onClose,
  onHistoryChange,
}: Props) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const router = useRouter();

  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [partialTranscript, setPartialTranscript] = useState('');
  const [lastUserText, setLastUserText] = useState('');
  const [lastSiaText, setLastSiaText] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  // Phase 4 : modal de confirmation paiement déclenché par action authenticate_and_pay
  const [paymentReq, setPaymentReq] = useState<
    | { reservation_id: string; amount_xof: number; venue_name?: string }
    | null
  >(null);
  const historyRef = useRef<ChatMessage[]>(initialHistory);
  const pulse = useRef(new Animated.Value(1)).current;
  const sttAvailable = useMemo(() => voice.isSttAvailable(), []);
  const ttsAvailable = useMemo(() => voice.isTtsAvailable(), []);

  // Récupère la position au mount pour que les tools search_venues soient
  // géo-pertinents.
  useEffect(() => {
    if (!visible) return;
    let active = true;
    (async () => {
      try {
        const { status: perm } = await Location.getForegroundPermissionsAsync();
        if (perm !== 'granted') return;
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (active) setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      } catch { /* fallback Abidjan côté serveur */ }
    })();
    return () => { active = false; };
  }, [visible]);

  // ─── Pulse animation pendant écoute/parole ────────────────────────────
  useEffect(() => {
    if (status !== 'listening' && status !== 'speaking') {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.35, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [status, pulse]);

  // ─── Démarre l'écoute (utilisé par le cycle continu) ──────────────────
  const startListening = useCallback(async () => {
    if (!sttAvailable) {
      setError('Reconnaissance vocale indisponible. Lance un dev build pour activer le micro.');
      setStatus('error');
      return;
    }
    setError(null);
    setPartialTranscript('');
    setStatus('listening');

    await voice.startListening({
      locale: 'fr-FR',
      continuous: false,
      onPartial: (text) => setPartialTranscript(text),
      onFinal: (text) => {
        setPartialTranscript('');
        if (text && text.trim().length > 0) {
          void handleUserMessage(text.trim());
        } else {
          setStatus('idle');
        }
      },
      onError: (msg) => {
        // Ignore les "no-speech" / "no-match" — c'est juste un silence
        if (/no.?speech|no.?match|recognizer.busy/i.test(msg)) {
          setStatus('idle');
          return;
        }
        setError(msg);
        setStatus('error');
      },
    });
  }, [sttAvailable]);

  // ─── Helper : ferme le modal + navigue (cas action navigate) ──────────
  const handleCloseAndNavigate = useCallback(async (
    action: Extract<AssistantAction, { type: 'navigate' }>,
  ) => {
    await voice.stopListening();
    await voice.stopSpeaking();
    setStatus('idle');
    // Ferme d'abord pour éviter que le modal masque l'écran cible.
    onClose();
    // Petit delay pour laisser le modal s'animer out avant de naviguer.
    setTimeout(() => { runAction(action, router); }, 200);
  }, [onClose, router]);

  // ─── Pipeline : user dit → Claude → Sia parle → re-écoute ─────────────
  const handleUserMessage = useCallback(async (text: string) => {
    setLastUserText(text);
    setStatus('thinking');

    const next: ChatMessage[] = [...historyRef.current, { role: 'user', content: text }];
    historyRef.current = next;
    onHistoryChange?.(next);

    try {
      const res = await askAssistant(next, coords ?? undefined);
      const reply = res.reply?.trim() || 'Je n\'ai pas bien compris, peux-tu répéter ?';
      setLastSiaText(reply);

      const after: ChatMessage[] = [...next, { role: 'assistant', content: reply }];
      historyRef.current = after;
      onHistoryChange?.(after);

      const navAction = res.actions?.find((a) => a.type === 'navigate') as
        | Extract<AssistantAction, { type: 'navigate' }>
        | undefined;
      const payAction = res.actions?.find((a) => a.type === 'authenticate_and_pay') as
        | Extract<AssistantAction, { type: 'authenticate_and_pay' }>
        | undefined;

      // Le payment a priorité : il interrompt le cycle d'écoute pour
      // afficher le modal PIN. La nav est gérée seulement s'il n'y a
      // pas de paiement.
      const afterSpeech = () => {
        if (payAction) {
          // Stop le micro, ouvre le modal de PIN. La reprise de l'écoute
          // se fait sur callback success/cancel du modal.
          void voice.stopListening();
          setStatus('idle');
          setPaymentReq({
            reservation_id: payAction.reservation_id,
            amount_xof: payAction.amount_xof,
            venue_name: payAction.venue_name,
          });
          return;
        }
        if (navAction) {
          // L'utilisateur a demandé "ouvre X" : ferme le modal vocal + navigue.
          void handleCloseAndNavigate(navAction);
          return;
        }
        // Pas d'action → re-démarre l'écoute pour le tour suivant.
        void startListening();
      };

      if (ttsAvailable) {
        setStatus('speaking');
        await voice.speak(reply, {
          locale: 'fr-FR',
          onDone: afterSpeech,
          onError: afterSpeech,
        });
      } else {
        afterSpeech();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur Sia';
      setError(msg);
      setStatus('error');
      // Retire le dernier message user pour permettre une retry propre.
      historyRef.current = historyRef.current.slice(0, -1);
      onHistoryChange?.(historyRef.current);
    }
  }, [ttsAvailable, onHistoryChange, startListening, coords, handleCloseAndNavigate]);

  // ─── Auto-démarrage à l'ouverture du modal ────────────────────────────
  useEffect(() => {
    if (!visible) return;
    setLastUserText('');
    setLastSiaText('');
    setPartialTranscript('');
    setError(null);
    // Petit délai pour laisser le modal monter
    const t = setTimeout(() => {
      // Saluer si l'historique est vide, sinon écouter direct.
      if (historyRef.current.length === 0 && ttsAvailable) {
        const greeting = 'Bonjour ! Je suis Sia. Comment puis-je t\'aider ?';
        setLastSiaText(greeting);
        setStatus('speaking');
        void voice.speak(greeting, {
          locale: 'fr-FR',
          onDone: () => { void startListening(); },
          onError: () => { void startListening(); },
        });
      } else {
        void startListening();
      }
    }, 300);
    return () => clearTimeout(t);
  }, [visible, ttsAvailable, startListening]);

  // ─── Cleanup au démontage / fermeture ─────────────────────────────────
  useEffect(() => {
    return () => {
      void voice.stopListening();
      void voice.stopSpeaking();
    };
  }, []);

  const handleClose = useCallback(async () => {
    await voice.stopListening();
    await voice.stopSpeaking();
    setStatus('idle');
    setPaymentReq(null);
    onClose();
  }, [onClose]);

  // ─── Callbacks PaymentConfirmModal (Phase 4) ──────────────────────────
  const handlePaymentSuccess = useCallback(async (result: PayReservationResult) => {
    setPaymentReq(null);
    const confirmText = `Paiement confirmé : ${formatXOF(result.amount_paid_xof)} débité de ton wallet. Nouveau solde : ${formatXOF(result.new_balance_xof)}.`;
    setLastSiaText(confirmText);
    const after: ChatMessage[] = [
      ...historyRef.current,
      { role: 'assistant', content: confirmText },
    ];
    historyRef.current = after;
    onHistoryChange?.(after);
    if (ttsAvailable) {
      setStatus('speaking');
      await voice.speak(confirmText, {
        locale: 'fr-FR',
        onDone: () => { void startListening(); },
        onError: () => setStatus('idle'),
      });
    } else {
      setStatus('idle');
    }
  }, [ttsAvailable, onHistoryChange, startListening]);

  const handlePaymentCancel = useCallback(() => {
    setPaymentReq(null);
    // Reprend l'écoute pour laisser l'utilisateur dire "non finalement annule"
    // ou enchaîner sur autre chose.
    void startListening();
  }, [startListening]);

  const handleMicTap = useCallback(async () => {
    if (status === 'listening') {
      await voice.stopListening();
      setStatus('idle');
      return;
    }
    if (status === 'speaking') {
      await voice.stopSpeaking();
      void startListening();
      return;
    }
    if (status === 'idle' || status === 'error') {
      void startListening();
    }
  }, [status, startListening]);

  // ─── Render ───────────────────────────────────────────────────────────
  const color = c[STATUS_COLOR[status] as 'primary'] ?? c.primary;
  // Pour neutral/danger, fallback sur la palette de base
  const ringBg = (() => {
    switch (STATUS_COLOR[status]) {
      case 'primary': return c.primary[100];
      case 'success': return '#D1FAE5';
      case 'amber':   return '#FEF3C7';
      case 'danger':  return '#FEE2E2';
      default:        return c.neutral[100];
    }
  })();
  const ringFg = (() => {
    switch (STATUS_COLOR[status]) {
      case 'primary': return c.primary[500];
      case 'success': return c.success;
      case 'amber':   return '#D97706';
      case 'danger':  return c.danger;
      default:        return c.neutral[500];
    }
  })();

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Sia</Text>
            <Text style={s.subtitle}>Ton assistant vocal Soutra-Playce</Text>
          </View>
          <Pressable onPress={handleClose} hitSlop={10} style={s.closeBtn}>
            <Ionicons name="close" size={22} color={c.dark} />
          </Pressable>
        </View>

        {/* Conversation transcript scrollable */}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.transcript}>
          {lastUserText && (
            <View style={[s.bubble, s.bubbleUser]}>
              <Text style={s.bubbleLabel}>Toi</Text>
              <Text style={s.bubbleText}>{lastUserText}</Text>
            </View>
          )}
          {(partialTranscript && status === 'listening') && (
            <View style={[s.bubble, s.bubbleUser, { opacity: 0.6 }]}>
              <Text style={s.bubbleLabel}>Toi (en cours…)</Text>
              <Text style={s.bubbleText}>{partialTranscript}</Text>
            </View>
          )}
          {lastSiaText && (
            <View style={[s.bubble, s.bubbleSia]}>
              <Text style={[s.bubbleLabel, { color: c.primary[700] }]}>Sia</Text>
              <Text style={s.bubbleText}>{lastSiaText}</Text>
            </View>
          )}
          {!lastUserText && !lastSiaText && (
            <Text style={s.placeholder}>
              {sttAvailable
                ? 'Dis quelque chose pour commencer : "Trouve-moi un maquis à Cocody", "Comment recharger mon wallet ?", "Réserve une table pour 4 demain soir"…'
                : 'Reconnaissance vocale indisponible sur Expo Go. Lance un dev build pour parler à Sia.'}
            </Text>
          )}
          {error && (
            <View style={s.errorBox}>
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}
        </ScrollView>

        {/* Status pill + Mic button */}
        <View style={s.bottom}>
          <View style={[s.statusPill, { backgroundColor: ringBg }]}>
            <Text style={[s.statusText, { color: ringFg }]}>
              {STATUS_LABEL[status]}
            </Text>
          </View>

          <Pressable
            onPress={handleMicTap}
            disabled={!sttAvailable && status === 'idle'}
            style={({ pressed }) => [
              s.micRing,
              { backgroundColor: ringBg, opacity: !sttAvailable ? 0.4 : 1 },
              pressed && { opacity: 0.85 },
            ]}
            accessibilityLabel={status === 'listening' ? 'Arrêter d\'écouter' : 'Parler à Sia'}
          >
            <Animated.View
              style={[
                s.micCore,
                { backgroundColor: ringFg, transform: [{ scale: pulse }] },
              ]}
            >
              <Ionicons
                name={
                  status === 'listening' ? 'mic'
                  : status === 'speaking' ? 'volume-high'
                  : status === 'thinking' ? 'sync'
                  : 'mic-outline'
                }
                size={36}
                color="#fff"
              />
            </Animated.View>
          </Pressable>

          <Text style={s.hint}>
            Tap pour {status === 'listening' ? 'mettre en pause' : 'parler'}
          </Text>
        </View>

        {/* Modal PIN au-dessus de la conversation vocale (Phase 4) */}
        {paymentReq && (
          <PaymentConfirmModal
            visible={true}
            reservationId={paymentReq.reservation_id}
            amountXof={paymentReq.amount_xof}
            venueName={paymentReq.venue_name}
            onSuccess={handlePaymentSuccess}
            onCancel={handlePaymentCancel}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.light },
    header: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
      borderBottomWidth: 1, borderBottomColor: c.neutral[100],
    },
    title: { fontSize: typography.fontSize.xl, fontWeight: '800', color: c.dark },
    subtitle: { fontSize: typography.fontSize.xs, color: c.neutral[600], marginTop: 2 },
    closeBtn: {
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: c.neutral[100],
      alignItems: 'center', justifyContent: 'center',
    },

    transcript: { padding: spacing.lg, gap: spacing.md },
    bubble: {
      padding: spacing.md, borderRadius: radius.lg,
      borderWidth: 1,
    },
    bubbleUser: {
      backgroundColor: c.neutral[50],
      borderColor: c.neutral[200],
      alignSelf: 'flex-end',
      maxWidth: '85%',
    },
    bubbleSia: {
      backgroundColor: c.primary[50],
      borderColor: c.primary[200],
      alignSelf: 'flex-start',
      maxWidth: '85%',
    },
    bubbleLabel: {
      fontSize: 10, fontWeight: '800', textTransform: 'uppercase',
      letterSpacing: 0.3, marginBottom: 4, color: c.neutral[600],
    },
    bubbleText: { fontSize: typography.fontSize.base, color: c.dark, lineHeight: 22 },
    placeholder: {
      fontSize: typography.fontSize.sm, color: c.neutral[500],
      textAlign: 'center', fontStyle: 'italic', lineHeight: 22,
      paddingHorizontal: spacing.lg,
    },
    errorBox: {
      backgroundColor: '#FEE2E2', borderColor: '#FCA5A5', borderWidth: 1,
      borderRadius: radius.lg, padding: spacing.md,
    },
    errorText: { fontSize: typography.fontSize.sm, color: '#B91C1C' },

    bottom: {
      paddingHorizontal: spacing.lg, paddingTop: spacing.md,
      paddingBottom: spacing.md, alignItems: 'center', gap: spacing.md,
      borderTopWidth: 1, borderTopColor: c.neutral[100],
    },
    statusPill: {
      paddingHorizontal: spacing.md, paddingVertical: 6,
      borderRadius: radius.full,
    },
    statusText: { fontSize: typography.fontSize.xs, fontWeight: '700' },
    micRing: {
      width: 116, height: 116, borderRadius: 58,
      alignItems: 'center', justifyContent: 'center',
    },
    micCore: {
      width: 88, height: 88, borderRadius: 44,
      alignItems: 'center', justifyContent: 'center',
      shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4,
    },
    hint: { fontSize: typography.fontSize.xs, color: c.neutral[500] },
  });
}
