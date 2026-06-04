import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { colors, typography, radius, spacing } from '@soutra/shared';
import { ScreenHeader } from '@/components/ScreenHeader';
import { askAssistant, runAction, type ChatMessage, type AssistantAction, type PayReservationResult } from '@/lib/assistant';
import { voice } from '@/lib/voice';
import { VoiceConversation } from '@/components/VoiceConversation';
import { PaymentConfirmModal } from '@/components/PaymentConfirmModal';
import { formatXOF } from '@soutra/shared';

const SUGGESTIONS = [
  'Comment recharger mon wallet ?',
  'Où trouver un maquis à Cocody ?',
  'C\'est quoi un split bill ?',
  'Comment payer mon acompte ?',
];

const WELCOME: ChatMessage = {
  role: 'assistant',
  content: 'Bonjour ! Je suis Sia, ton assistant vocal Soutra-Playce. Demande-moi comment utiliser l\'app, où sortir à Abidjan, ou tap le micro en haut pour me parler directement.',
};

export default function Assistant() {
  const params = useLocalSearchParams<{ voice?: string }>();
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [readAloud, setReadAloud] = useState(false);     // Toggle TTS auto des réponses
  const [voiceMode, setVoiceMode] = useState(false);     // Modal conversation continue
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  // Modal de paiement vocal (Phase 4) — déclenché par action authenticate_and_pay
  const [paymentReq, setPaymentReq] = useState<
    | { reservation_id: string; amount_xof: number; venue_name?: string }
    | null
  >(null);
  const scrollRef = useRef<ScrollView | null>(null);

  // Ouvre direct le mode vocal si l'utilisateur a tapé "Parler à Sia" depuis
  // un autre écran (?voice=1 dans l'URL).
  useEffect(() => {
    if (params.voice === '1') setVoiceMode(true);
  }, [params.voice]);

  // Récupère la position (best-effort) pour que les tools search_venues
  // soient géo-pertinents. Échec silencieux → fallback Abidjan côté serveur.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (active) setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      } catch { /* noop */ }
    })();
    return () => { active = false; };
  }, []);

  // Cleanup TTS si l'écran est démonté pendant une lecture.
  useEffect(() => {
    return () => { void voice.stopSpeaking(); };
  }, []);

  /**
   * Applique les actions après la réponse. Deux types d'actions :
   * - navigate : ouvre une route Expo Router
   * - authenticate_and_pay : ouvre le PaymentConfirmModal (PIN + débit wallet)
   *
   * Si "Lire les réponses" est ON, on attend la fin du TTS avant d'agir
   * pour que l'utilisateur sache ce qui va se passer.
   */
  function applyActions(actions: AssistantAction[] | undefined, replyText: string) {
    if (!actions || actions.length === 0) return;

    // Le délai est basé sur la longueur du texte (~150 mots/min en TTS humain).
    const delayMs = readAloud && voice.isTtsAvailable()
      ? Math.min(8000, Math.max(1500, replyText.length * 60))
      : 0;

    const apply = () => {
      // Priorité au paiement (action sensible — interrompt tout)
      const payAction = actions.find((a) => a.type === 'authenticate_and_pay');
      if (payAction && payAction.type === 'authenticate_and_pay') {
        setPaymentReq({
          reservation_id: payAction.reservation_id,
          amount_xof: payAction.amount_xof,
          venue_name: payAction.venue_name,
        });
        return;
      }
      const navAction = actions.find((a) => a.type === 'navigate');
      if (navAction) runAction(navAction, router);
    };

    if (delayMs > 0) setTimeout(apply, delayMs);
    else apply();
  }

  /**
   * Appelé quand le PaymentConfirmModal aboutit. On ajoute un message
   * système dans la conversation et on speak un résumé.
   */
  function handlePaymentSuccess(res: PayReservationResult) {
    setPaymentReq(null);
    const confirmText = `Paiement de ${formatXOF(res.amount_paid_xof)} confirmé. Nouveau solde wallet : ${formatXOF(res.new_balance_xof)}.`;
    setMessages((prev) => [...prev, { role: 'assistant', content: confirmText }]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 30);
    if (readAloud && voice.isTtsAvailable()) {
      void voice.speak(confirmText, { locale: 'fr-FR' });
    }
  }

  async function send(text: string) {
    const body = text.trim();
    if (!body || sending) return;
    const next: ChatMessage[] = [...messages, { role: 'user', content: body }];
    setMessages(next);
    setInput('');
    setSending(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 30);

    try {
      // Exclude le message de bienvenue de l'historique envoyé au modèle
      // (c'est du faux contexte produit local, pas une vraie conversation).
      const history = next.filter((m) => m !== WELCOME);
      const res = await askAssistant(history, coords ?? undefined);
      setMessages((prev) => [...prev, { role: 'assistant', content: res.reply }]);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 30);
      // Lecture vocale auto si le toggle est on (best-effort, ne bloque pas l'UI).
      if (readAloud && voice.isTtsAvailable()) {
        void voice.speak(res.reply, { locale: 'fr-FR' });
      }
      // Exécute les actions (navigate, etc.) après la lecture si toggle ON.
      applyActions(res.actions, res.reply);
    } catch (err: any) {
      const msg = err?.message ?? 'Échec de la requête';
      // On retire le dernier message user pour permettre une réessai propre.
      setMessages((prev) => prev.slice(0, -1));
      setInput(body);
      Alert.alert('Assistant indisponible', msg);
    } finally {
      setSending(false);
    }
  }

  function resetConversation() {
    Alert.alert('Réinitialiser ?', 'Tu vas perdre la conversation en cours.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Réinitialiser', style: 'destructive', onPress: () => setMessages([WELCOME]) },
    ]);
  }

  const showSuggestions = messages.length === 1 && messages[0] === WELCOME;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader
        title="Sia"
        subtitle="Ton assistant vocal Soutra-Playce"
        trailing={(
          <View style={{ flexDirection: 'row', gap: spacing.xs }}>
            {/* Toggle "Lire les réponses à voix haute" */}
            <Pressable
              onPress={() => {
                setReadAloud((v) => {
                  const next = !v;
                  if (!next) void voice.stopSpeaking();
                  return next;
                });
              }}
              hitSlop={10}
              style={[s.iconBtn, readAloud && { backgroundColor: colors.primary[50], borderColor: colors.primary[500] }]}
              accessibilityLabel={readAloud ? 'Couper la lecture vocale' : 'Activer la lecture vocale'}
            >
              <Ionicons
                name={readAloud ? 'volume-high' : 'volume-mute-outline'}
                size={18}
                color={readAloud ? colors.primary[600] : colors.dark}
              />
            </Pressable>

            {/* Bouton mode vocal (conversation continue) */}
            <Pressable
              onPress={() => setVoiceMode(true)}
              hitSlop={10}
              style={[s.iconBtn, { backgroundColor: colors.primary[500], borderColor: colors.primary[500] }]}
              accessibilityLabel="Mode vocal — parler à Sia"
            >
              <Ionicons name="mic" size={18} color="#fff" />
            </Pressable>

            {/* Reset */}
            {messages.length > 1 && (
              <Pressable onPress={resetConversation} hitSlop={10} style={s.iconBtn}>
                <Ionicons name="refresh" size={18} color={colors.dark} />
              </Pressable>
            )}
          </View>
        )}
      />

      {/* Modal de conversation vocale continue */}
      <VoiceConversation
        visible={voiceMode}
        initialHistory={messages.filter((m) => m !== WELCOME)}
        onClose={() => setVoiceMode(false)}
        onHistoryChange={(h) => setMessages([WELCOME, ...h])}
      />

      {/* Modal de paiement vocal (Phase 4) */}
      {paymentReq && (
        <PaymentConfirmModal
          visible={true}
          reservationId={paymentReq.reservation_id}
          amountXof={paymentReq.amount_xof}
          venueName={paymentReq.venue_name}
          onSuccess={handlePaymentSuccess}
          onCancel={() => setPaymentReq(null)}
        />
      )}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={s.scroll}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {messages.map((m, i) => (
            <View key={i} style={[s.bubbleRow, m.role === 'user' && s.bubbleRowUser]}>
              {m.role === 'assistant' && (
                <View style={s.avatar}>
                  <Ionicons name="sparkles" size={14} color="#fff" />
                </View>
              )}
              <View style={[s.bubble, m.role === 'user' ? s.bubbleUser : s.bubbleAssistant]}>
                <Text style={[s.bubbleText, m.role === 'user' && s.bubbleTextUser]}>{m.content}</Text>
              </View>
            </View>
          ))}

          {sending && (
            <View style={s.bubbleRow}>
              <View style={s.avatar}>
                <Ionicons name="sparkles" size={14} color="#fff" />
              </View>
              <View style={[s.bubble, s.bubbleAssistant, s.typing]}>
                <Dot delay={0} />
                <Dot delay={150} />
                <Dot delay={300} />
              </View>
            </View>
          )}

          {showSuggestions && (
            <View style={s.suggestionsWrap}>
              <Text style={s.suggestionsTitle}>Suggestions</Text>
              <View style={s.suggestions}>
                {SUGGESTIONS.map((q) => (
                  <Pressable
                    key={q}
                    onPress={() => send(q)}
                    style={({ pressed }) => [s.suggestion, pressed && { opacity: 0.7, transform: [{ scale: 0.97 }] }]}
                  >
                    <Text style={s.suggestionText}>{q}</Text>
                    <Ionicons name="arrow-forward" size={14} color={colors.primary[600]} />
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </ScrollView>

        <View style={s.composer}>
          <TextInput
            value={input}
            onChangeText={(v) => v.length <= 4000 && setInput(v)}
            placeholder="Pose ta question…"
            placeholderTextColor={colors.neutral[400]}
            style={s.input}
            multiline
            editable={!sending}
            onSubmitEditing={() => send(input)}
          />
          <Pressable
            onPress={() => send(input)}
            disabled={!input.trim() || sending}
            style={({ pressed }) => [
              s.sendBtn,
              (!input.trim() || sending) && s.sendBtnDisabled,
              pressed && input.trim() && !sending && { opacity: 0.9, transform: [{ scale: 0.97 }] },
            ]}
          >
            {sending ? <ActivityIndicator color="#fff" /> : <Ionicons name="send" size={18} color="#fff" />}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Dot({ delay }: { delay: number }) {
  // Simple animation par CSS-equivalent : on utilise juste 3 dots affichés —
  // l'effet visuel est suffisant. Pour un vrai pulse, voir Animated.
  return <View style={[s.dot, { opacity: delay === 0 ? 1 : delay === 150 ? 0.7 : 0.4 }]} />;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.light },
  iconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.neutral[200] },
  scroll: { padding: spacing.lg, paddingBottom: spacing['2xl'], gap: spacing.md },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  bubbleRowUser: { justifyContent: 'flex-end' },
  avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary[500], alignItems: 'center', justifyContent: 'center' },
  bubble: { maxWidth: '78%', paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, borderRadius: radius.lg },
  bubbleAssistant: { backgroundColor: '#fff', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.neutral[200] },
  bubbleUser: { backgroundColor: colors.primary[500], borderBottomRightRadius: 4 },
  bubbleText: { fontSize: typography.fontSize.sm, color: colors.dark, lineHeight: 20 },
  bubbleTextUser: { color: '#fff' },
  typing: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.neutral[500] },
  suggestionsWrap: { marginTop: spacing.lg },
  suggestionsTitle: { fontSize: typography.fontSize.xs, fontWeight: '700', color: colors.neutral[500], textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm },
  suggestions: { gap: spacing.sm },
  suggestion: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderWidth: 1, borderColor: colors.primary[100], borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  suggestionText: { flex: 1, fontSize: typography.fontSize.sm, color: colors.dark, fontWeight: '600' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.neutral[200], backgroundColor: '#fff' },
  input: { flex: 1, maxHeight: 120, padding: spacing.md, fontSize: typography.fontSize.sm, color: colors.dark, backgroundColor: colors.neutral[100], borderRadius: radius.lg },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary[500], alignItems: 'center', justifyContent: 'center', shadowColor: colors.primary[500], shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  sendBtnDisabled: { backgroundColor: colors.neutral[300], shadowOpacity: 0 },
});
