import { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, radius, spacing } from '@soutra/shared';
import { ScreenHeader } from '@/components/ScreenHeader';
import { askAssistant, type ChatMessage } from '@/lib/assistant';
import { parseSiaIntent } from '@/lib/sia-intents';
import { siaSpeak, siaStopSpeaking, isTtsAvailable } from '@/lib/sia-tts';
import { VoiceSearchSheet, isVoiceRecognitionAvailable } from '@/components/VoiceSearchSheet';

/**
 * SIA — Soutra Intelligent Assistant.
 *
 * Spec PO PR6 audit UX :
 *   "L'utilisateur peut parler à SIA. SIA peut répondre vocalement.
 *    Conversation bidirectionnelle. SIA doit pouvoir ouvrir Accueil,
 *    Explorer, Soutra-Pay, Fidélité, Profil, Paramètres par commande
 *    vocale. IA contextuelle, FR + français ivoirien."
 *
 * Pipeline :
 *   1. User parle ou tape → texte
 *   2. parseSiaIntent (local, instantané) → si match nav, route + speak retour
 *   3. Sinon → askAssistant (Edge Function chatbot, Claude Haiku 4.5)
 *   4. Réponse affichée + lue vocalement (siaSpeak) si TTS activé
 */

const SUGGESTIONS = [
  'SIA, ouvre mon wallet',
  'SIA, montre les hôtels',
  'SIA, affiche ma fidélité',
  'Comment recharger mon wallet ?',
];

const WELCOME: ChatMessage = {
  role: 'assistant',
  content: 'Salut, moi c\'est SIA — Soutra Intelligent Assistant. Tape ou parle pour me poser une question, ou dis-moi "SIA ouvre…" pour naviguer.',
};

export default function Assistant() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [ttsOn, setTtsOn] = useState(isTtsAvailable());
  const scrollRef = useRef<ScrollView | null>(null);
  const voiceAvailable = isVoiceRecognitionAvailable();

  const send = useCallback(async (text: string) => {
    const body = text.trim();
    if (!body || sending) return;

    // 1) Intent parser local : si nav match, on route direct (pas de
    //    coût LLM, instantané).
    const intent = parseSiaIntent(body);
    if (intent.kind === 'navigate') {
      setMessages((prev) => [
        ...prev,
        { role: 'user', content: body },
        { role: 'assistant', content: intent.spoken },
      ]);
      setInput('');
      if (ttsOn) siaSpeak(intent.spoken);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 30);
      // Petit délai pour que la bulle apparaisse avant la navigation.
      setTimeout(() => router.push(intent.pathname as any), 350);
      return;
    }

    // 2) Sinon → LLM Claude via Edge Function.
    const next: ChatMessage[] = [...messages, { role: 'user', content: body }];
    setMessages(next);
    setInput('');
    setSending(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 30);

    try {
      // Exclude le message de bienvenue de l'historique envoyé au modèle.
      const history = next.filter((m) => m !== WELCOME);
      const res = await askAssistant(history);
      setMessages((prev) => [...prev, { role: 'assistant', content: res.reply }]);
      if (ttsOn) siaSpeak(res.reply);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 30);
    } catch (err: any) {
      const msg = err?.message ?? 'Échec de la requête';
      // Retire le dernier message user pour permettre un réessai propre.
      setMessages((prev) => prev.slice(0, -1));
      setInput(body);
      Alert.alert('SIA indisponible', msg);
    } finally {
      setSending(false);
    }
  }, [messages, sending, ttsOn, router]);

  const onVoiceResult = useCallback((text: string) => {
    setVoiceOpen(false);
    if (text.trim()) send(text);
  }, [send]);

  const toggleTts = useCallback(() => {
    if (!isTtsAvailable()) {
      Alert.alert(
        'Voix non disponible',
        'Le moteur de synthèse vocale n\'est pas embarqué dans cette version. Tu auras la voix de SIA au prochain build.',
      );
      return;
    }
    if (ttsOn) siaStopSpeaking();
    setTtsOn((v) => !v);
  }, [ttsOn]);

  function resetConversation() {
    Alert.alert('Réinitialiser ?', 'Tu vas perdre la conversation en cours.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Réinitialiser', style: 'destructive', onPress: () => {
        siaStopSpeaking();
        setMessages([WELCOME]);
      }},
    ]);
  }

  const showSuggestions = messages.length === 1 && messages[0] === WELCOME;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader
        title="🎙️ SIA"
        subtitle="Soutra Intelligent Assistant"
        trailing={(
          <View style={{ flexDirection: 'row', gap: spacing.xs }}>
            <Pressable onPress={toggleTts} hitSlop={10} style={[s.iconBtn, ttsOn && s.iconBtnActive]}>
              <Ionicons
                name={ttsOn ? 'volume-high' : 'volume-mute'}
                size={18}
                color={ttsOn ? colors.primary[600] : colors.neutral[600]}
              />
            </Pressable>
            {messages.length > 1 && (
              <Pressable onPress={resetConversation} hitSlop={10} style={s.iconBtn}>
                <Ionicons name="refresh" size={18} color={colors.dark} />
              </Pressable>
            )}
          </View>
        )}
      />

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
                  <Text style={{ fontSize: 14 }}>🎙️</Text>
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
                <Text style={{ fontSize: 14 }}>🎙️</Text>
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
              <Text style={s.suggestionsTitle}>Essaie</Text>
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
          {/* Bouton micro flottant (PR6 audit UX) */}
          {voiceAvailable && (
            <Pressable
              onPress={() => setVoiceOpen(true)}
              disabled={sending}
              style={({ pressed }) => [
                s.micBtn,
                sending && { opacity: 0.5 },
                pressed && { opacity: 0.85, transform: [{ scale: 0.95 }] },
              ]}
            >
              <Ionicons name="mic" size={20} color="#fff" />
            </Pressable>
          )}
          <TextInput
            value={input}
            onChangeText={(v) => v.length <= 4000 && setInput(v)}
            placeholder="Parle ou tape… (ex: SIA ouvre mon wallet)"
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

      <VoiceSearchSheet
        visible={voiceOpen}
        onClose={() => setVoiceOpen(false)}
        onResult={onVoiceResult}
        locale="fr-FR"
      />
    </SafeAreaView>
  );
}

function Dot({ delay }: { delay: number }) {
  return <View style={[s.dot, { opacity: delay === 0 ? 1 : delay === 150 ? 0.7 : 0.4 }]} />;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.light },
  iconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.neutral[200] },
  iconBtnActive: { backgroundColor: colors.primary[50], borderColor: colors.primary[300] },
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
  micBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.primary[500],
    alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.primary[500], shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  input: { flex: 1, maxHeight: 120, padding: spacing.md, fontSize: typography.fontSize.sm, color: colors.dark, backgroundColor: colors.neutral[100], borderRadius: radius.lg },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary[500], alignItems: 'center', justifyContent: 'center', shadowColor: colors.primary[500], shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  sendBtnDisabled: { backgroundColor: colors.neutral[300], shadowOpacity: 0 },
});
