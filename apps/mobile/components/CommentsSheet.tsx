import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, TextInput, Image, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, radius, spacing } from '@soutra/shared';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { listComments, createComment, deleteComment, type Comment } from '@/lib/comments';

type Props = {
  postId: string | null;
  visible: boolean;
  onClose: () => void;
  onCountChange?: (postId: string, delta: number) => void;
};

export function CommentsSheet({ postId, visible, onClose, onCountChange }: Props) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!postId) return;
    setLoading(true);
    try {
      const data = await listComments(postId);
      setComments(data);
    } catch (err: any) {
      Alert.alert('Erreur', err?.message ?? 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    if (visible && postId) {
      setComments([]);
      setBody('');
      load();
    }
  }, [visible, postId, load]);

  // Realtime : nouveaux commentaires d'autres utilisateurs s'affichent live.
  useEffect(() => {
    if (!visible || !postId) return;
    const channel = supabase
      .channel(`comments-${postId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'post_comments', filter: `post_id=eq.${postId}` },
        () => load(),
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'post_comments', filter: `post_id=eq.${postId}` },
        () => load(),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [visible, postId, load]);

  async function handleSend() {
    if (!user?.id || !postId || !body.trim() || sending) return;
    setSending(true);
    const text = body;
    setBody('');
    try {
      const c = await createComment({ postId, userId: user.id, body: text });
      // Optimistic ajout local (le Realtime fera aussi un load() — dédoublonné par id).
      setComments((prev) => prev.some((x) => x.id === c.id) ? prev : [...prev, c]);
      onCountChange?.(postId, +1);
    } catch (err: any) {
      setBody(text);
      Alert.alert('Erreur', err?.message ?? 'Envoi échoué.');
    } finally {
      setSending(false);
    }
  }

  async function handleDelete(c: Comment) {
    Alert.alert('Supprimer ce commentaire ?', 'Cette action est définitive.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive', onPress: async () => {
          try {
            await deleteComment(c.id);
            setComments((prev) => prev.filter((x) => x.id !== c.id));
            if (postId) onCountChange?.(postId, -1);
          } catch (err: any) {
            Alert.alert('Erreur', err?.message ?? 'Suppression impossible.');
          }
        },
      },
    ]);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <View style={s.sheet}>
        <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
          <View style={s.handle} />
          <View style={s.header}>
            <Text style={s.title}>Commentaires</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.dark} />
            </Pressable>
          </View>

          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            {loading ? (
              <View style={s.center}><ActivityIndicator size="large" color={colors.primary[500]} /></View>
            ) : comments.length === 0 ? (
              <View style={s.center}>
                <Ionicons name="chatbubble-outline" size={48} color={colors.neutral[300]} />
                <Text style={s.emptyText}>Pas encore de commentaire. Sois le premier.</Text>
              </View>
            ) : (
              <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
                {comments.map((c) => (
                  <View key={c.id} style={s.row}>
                    <View style={s.avatar}>
                      {c.author?.avatar_url ? (
                        <Image source={{ uri: c.author.avatar_url }} style={s.avatarImg} />
                      ) : (
                        <Text style={s.avatarTxt}>{(c.author?.full_name || c.author?.phone || '?').charAt(0).toUpperCase()}</Text>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={s.rowTop}>
                        <Text style={s.author}>{c.author?.full_name || c.author?.phone || 'Anonyme'}</Text>
                        <Text style={s.time}>{relativeTime(c.created_at)}</Text>
                      </View>
                      <Text style={s.body}>{c.body}</Text>
                    </View>
                    {c.user_id === user?.id && (
                      <Pressable onPress={() => handleDelete(c)} hitSlop={10} style={{ paddingLeft: spacing.sm }}>
                        <Ionicons name="trash-outline" size={18} color={colors.neutral[400]} />
                      </Pressable>
                    )}
                  </View>
                ))}
              </ScrollView>
            )}

            <View style={s.composer}>
              <TextInput
                value={body}
                onChangeText={(v) => v.length <= 1000 && setBody(v)}
                placeholder="Écris un commentaire…"
                placeholderTextColor={colors.neutral[400]}
                style={s.input}
                multiline
              />
              <Pressable onPress={handleSend} disabled={!body.trim() || sending} style={[s.sendBtn, (!body.trim() || sending) && s.sendBtnDisabled]}>
                {sending ? <ActivityIndicator color="#fff" /> : <Ionicons name="send" size={20} color="#fff" />}
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function relativeTime(iso: string): string {
  const d = new Date(iso);
  const diff = Math.max(0, Date.now() - d.getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'à l\'instant';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  const days = Math.floor(h / 24);
  return `${days} j`;
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '78%', backgroundColor: colors.light, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  handle: { width: 40, height: 4, backgroundColor: colors.neutral[300], borderRadius: 2, alignSelf: 'center', marginTop: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.neutral[200] },
  title: { fontSize: typography.fontSize.base, fontWeight: '700', color: colors.dark },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyText: { marginTop: spacing.sm, fontSize: typography.fontSize.sm, color: colors.neutral[500] },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.neutral[100] },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primary[500], alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg: { width: '100%', height: '100%' },
  avatarTxt: { color: '#fff', fontWeight: '700', fontSize: typography.fontSize.sm },
  rowTop: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  author: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.dark, flex: 1 },
  time: { fontSize: typography.fontSize.xs, color: colors.neutral[500] },
  body: { fontSize: typography.fontSize.sm, color: colors.dark, lineHeight: 20, marginTop: 2 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.neutral[200], backgroundColor: '#fff' },
  input: { flex: 1, maxHeight: 120, padding: spacing.md, fontSize: typography.fontSize.sm, color: colors.dark, backgroundColor: colors.neutral[100], borderRadius: radius.lg },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary[500], alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: colors.neutral[300] },
});
