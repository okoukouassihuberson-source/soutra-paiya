import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Image, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, radius, spacing } from '@soutra/shared';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { listMessages, sendMessage, markChatRead, type ChatMessage } from '@/lib/chat';

export default function ChatScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [other, setOther] = useState<{ id: string; name: string; avatar: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      // Charge les messages + identifie l'autre membre.
      const [{ data: members }, msgs] = await Promise.all([
        (supabase as any)
          .from('chat_members')
          .select('user_id')
          .eq('chat_id', id),
        listMessages(id),
      ]);
      const otherId = (members || []).map((m: any) => m.user_id).find((uid: string) => uid !== user?.id);
      if (otherId) {
        const { data: prof } = await (supabase as any)
          .from('profiles')
          .select('id, full_name, phone, avatar_url')
          .eq('id', otherId)
          .single();
        setOther({ id: otherId, name: prof?.full_name || prof?.phone || 'Inconnu', avatar: prof?.avatar_url || null });
      }
      setMessages(msgs);
      // Marque comme lu après chargement.
      await markChatRead(id);
    } catch (err: any) {
      Alert.alert('Erreur', err?.message ?? 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }, [id, user?.id]);

  useEffect(() => { load(); }, [load]);

  // Realtime : nouveaux messages dans cette conversation.
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`chat-${id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${id}` },
        (payload: any) => {
          const m = payload.new as ChatMessage;
          // Si c'est mon message envoyé par moi sur ce device, il est déjà dans la liste -> évite le doublon.
          setMessages((prev) => prev.some((x) => x.id === m.id) ? prev : [...prev, m]);
          // Marque lu si on est sur l'écran.
          if (m.sender_id !== user?.id) markChatRead(id);
          // Auto-scroll en bas.
          setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, user?.id]);

  async function handleSend() {
    if (!id || !body.trim() || sending) return;
    const text = body;
    setBody('');
    setSending(true);
    try {
      const msg = await sendMessage(id, text);
      setMessages((prev) => prev.some((x) => x.id === msg.id) ? prev : [...prev, msg]);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    } catch (err: any) {
      setBody(text);  // restore on error
      Alert.alert('Erreur', err?.message ?? 'Envoi échoué.');
    } finally {
      setSending(false);
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}><Ionicons name="chevron-back" size={26} color={colors.dark} /></Pressable>
        <View style={s.headerCenter}>
          {other?.avatar ? (
            <Image source={{ uri: other.avatar }} style={s.headerAvatar} />
          ) : other ? (
            <View style={s.headerAvatarPlaceholder}>
              <Text style={s.headerAvatarTxt}>{other.name.charAt(0).toUpperCase()}</Text>
            </View>
          ) : null}
          <Text style={s.headerName} numberOfLines={1}>{other?.name || 'Conversation'}</Text>
        </View>
        <View style={{ width: 26 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        {loading ? (
          <View style={s.center}><ActivityIndicator size="large" color={colors.primary[500]} /></View>
        ) : (
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
          >
            {messages.length === 0 && (
              <Text style={s.emptyText}>Aucun message pour l'instant. Lance la conversation 👋</Text>
            )}
            {messages.map((m) => {
              const mine = m.sender_id === user?.id;
              return (
                <View key={m.id} style={[s.bubbleRow, mine && s.bubbleRowMine]}>
                  <View style={[s.bubble, mine ? s.bubbleMine : s.bubbleOther]}>
                    {m.body && <Text style={[s.bubbleText, mine && s.bubbleTextMine]}>{m.body}</Text>}
                    <Text style={[s.bubbleTime, mine && s.bubbleTimeMine]}>{formatTime(m.created_at)}</Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        )}

        <View style={s.composer}>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="Écris un message…"
            placeholderTextColor={colors.neutral[400]}
            style={s.input}
            multiline
            maxLength={4000}
          />
          <Pressable onPress={handleSend} disabled={!body.trim() || sending} style={[s.sendBtn, (!body.trim() || sending) && s.sendBtnDisabled]}>
            {sending ? <ActivityIndicator color="#fff" /> : <Ionicons name="send" size={20} color="#fff" />}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.light },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.neutral[200],
    backgroundColor: '#fff',
  },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerAvatar: { width: 36, height: 36, borderRadius: 18 },
  headerAvatarPlaceholder: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary[500], alignItems: 'center', justifyContent: 'center' },
  headerAvatarTxt: { color: '#fff', fontWeight: '700' },
  headerName: { flex: 1, fontSize: typography.fontSize.base, fontWeight: '700', color: colors.dark },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { textAlign: 'center', fontSize: typography.fontSize.sm, color: colors.neutral[500], marginTop: spacing.xl },
  bubbleRow: { flexDirection: 'row', justifyContent: 'flex-start' },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '78%', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.lg },
  bubbleOther: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.neutral[200], borderBottomLeftRadius: 4 },
  bubbleMine: { backgroundColor: colors.primary[500], borderBottomRightRadius: 4 },
  bubbleText: { fontSize: typography.fontSize.sm, color: colors.dark, lineHeight: 20 },
  bubbleTextMine: { color: '#fff' },
  bubbleTime: { marginTop: 4, fontSize: 10, color: colors.neutral[500], textAlign: 'right' },
  bubbleTimeMine: { color: 'rgba(255,255,255,0.7)' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.neutral[200], backgroundColor: '#fff' },
  input: { flex: 1, maxHeight: 120, padding: spacing.md, fontSize: typography.fontSize.sm, color: colors.dark, backgroundColor: colors.neutral[100], borderRadius: radius.lg },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary[500], alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: colors.neutral[300] },
});
