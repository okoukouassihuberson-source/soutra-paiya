import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Image, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, radius, spacing } from '@soutra/shared';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { listChats, type ChatListItem } from '@/lib/chat';

export default function Chats() {
  const router = useRouter();
  const { user } = useAuth();
  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await listChats();
      setChats(data);
    } catch (err: any) {
      Alert.alert('Erreur', err?.message ?? 'Chargement impossible.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Realtime : tout nouveau message recharge la liste (pour mettre à jour
  // le preview + le compteur unread). Pas de patch granulaire — la liste
  // est courte.
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel('chats-list')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, load]);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}><Ionicons name="chevron-back" size={26} color={colors.dark} /></Pressable>
        <Text style={s.title}>Messages</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={colors.primary[500]} /></View>
      ) : chats.length === 0 ? (
        <View style={s.center}>
          <Ionicons name="chatbubbles-outline" size={64} color={colors.neutral[300]} />
          <Text style={s.emptyTitle}>Pas encore de conversation</Text>
          <Text style={s.emptyText}>Ouvre un chat depuis tes matchs ou en cliquant sur un profil.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: spacing['2xl'] }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          {chats.map((c) => (
            <Pressable
              key={c.chat_id}
              onPress={() => router.push({ pathname: '/chat/[id]', params: { id: c.chat_id } })}
              style={({ pressed }) => [s.row, pressed && { backgroundColor: colors.neutral[100] }]}
            >
              <View style={s.avatar}>
                {c.other_avatar ? (
                  <Image source={{ uri: c.other_avatar }} style={s.avatarImg} />
                ) : (
                  <Text style={s.avatarTxt}>{(c.other_name || '?').charAt(0).toUpperCase()}</Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <View style={s.rowTop}>
                  <Text style={s.name} numberOfLines={1}>{c.other_name || 'Inconnu'}</Text>
                  {c.last_message_at && (
                    <Text style={s.time}>{relativeTime(c.last_message_at)}</Text>
                  )}
                </View>
                <View style={s.rowBottom}>
                  <Text style={[s.preview, c.unread_count > 0 && s.previewUnread]} numberOfLines={1}>
                    {c.last_sender_id === user?.id ? 'Toi : ' : ''}{c.last_message || 'Aucun message'}
                  </Text>
                  {c.unread_count > 0 && (
                    <View style={s.unreadBadge}>
                      <Text style={s.unreadText}>{c.unread_count > 99 ? '99+' : c.unread_count}</Text>
                    </View>
                  )}
                </View>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
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
  if (days < 7) return `${days} j`;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.light },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.neutral[200],
  },
  title: { fontSize: typography.fontSize.base, fontWeight: '700', color: colors.dark },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyTitle: { marginTop: spacing.base, fontSize: typography.fontSize.base, fontWeight: '700', color: colors.dark },
  emptyText: { marginTop: spacing.xs, fontSize: typography.fontSize.sm, color: colors.neutral[500], textAlign: 'center', maxWidth: 280 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.neutral[100] },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primary[500], alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg: { width: '100%', height: '100%' },
  avatarTxt: { color: '#fff', fontWeight: '700', fontSize: typography.fontSize.lg },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  name: { fontSize: typography.fontSize.base, fontWeight: '700', color: colors.dark, flex: 1, marginRight: spacing.md },
  time: { fontSize: typography.fontSize.xs, color: colors.neutral[500] },
  rowBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  preview: { flex: 1, fontSize: typography.fontSize.sm, color: colors.neutral[600] },
  previewUnread: { color: colors.dark, fontWeight: '700' },
  unreadBadge: { marginLeft: spacing.sm, minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.primary[500], alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  unreadText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
