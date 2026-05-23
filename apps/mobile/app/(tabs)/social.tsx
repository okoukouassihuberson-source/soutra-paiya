import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Image, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, typography, radius, spacing } from '@soutra/shared';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { listFeed, toggleLike, deletePost, type Post } from '@/lib/social';
import { StoriesStrip } from '@/components/StoriesStrip';

export default function Social() {
  const router = useRouter();
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyLike, setBusyLike] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await listFeed({ userIdForLikes: user?.id ?? null });
      setPosts(data);
    } catch (err: any) {
      console.error('[social] load feed error:', err);
      Alert.alert('Erreur', err?.message ?? 'Impossible de charger le fil.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime : nouveaux posts -> ajout en tête de feed ; nouveaux likes ->
  // mise à jour du compteur côté client (le trigger SQL recalcule like_count
  // côté serveur, mais on n'a pas envie d'attendre un round-trip pour l'afficher).
  useEffect(() => {
    const channel = supabase
      .channel('social-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, () => {
        // Recharge complète (simple + correct ; on optimisera si besoin).
        load();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'posts' }, (payload: any) => {
        const next = payload.new as Post;
        setPosts((prev) => prev.map((p) => (p.id === next.id ? { ...p, ...next } : p)));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  async function handleLike(p: Post) {
    if (!user?.id) {
      Alert.alert('Connexion requise', 'Connecte-toi pour aimer un post.');
      return;
    }
    if (busyLike === p.id) return;
    setBusyLike(p.id);
    const wasLiked = !!p.liked_by_me;
    // Optimistic update du compteur ET du flag.
    setPosts((prev) => prev.map((x) =>
      x.id === p.id ? { ...x, liked_by_me: !wasLiked, like_count: Math.max(0, x.like_count + (wasLiked ? -1 : 1)) } : x
    ));
    try {
      await toggleLike(p.id, user.id, wasLiked);
    } catch (err: any) {
      // Rollback en cas d'erreur RLS.
      setPosts((prev) => prev.map((x) =>
        x.id === p.id ? { ...x, liked_by_me: wasLiked, like_count: Math.max(0, x.like_count + (wasLiked ? 1 : -1)) } : x
      ));
      Alert.alert('Erreur', err?.message ?? 'Action impossible.');
    } finally {
      setBusyLike(null);
    }
  }

  async function handleDelete(p: Post) {
    Alert.alert('Supprimer ce post ?', 'Cette action est définitive.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive', onPress: async () => {
          try {
            await deletePost(p.id);
            setPosts((prev) => prev.filter((x) => x.id !== p.id));
          } catch (err: any) {
            Alert.alert('Erreur', err?.message ?? 'Suppression impossible.');
          }
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Text style={s.title}>Communauté</Text>
        <View style={s.headerActions}>
          <Pressable onPress={() => router.push('/chats')} style={s.headerIcon} hitSlop={10}>
            <Ionicons name="chatbubbles-outline" size={22} color={colors.dark} />
          </Pressable>
          <Pressable onPress={() => router.push('/discover')} style={s.headerIcon} hitSlop={10}>
            <Ionicons name="people" size={22} color={colors.dark} />
          </Pressable>
          <Pressable onPress={() => router.push('/post-create')} style={s.fab} hitSlop={10}>
            <Ionicons name="add" size={22} color="#fff" />
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={colors.primary[500]} />
        </View>
      ) : posts.length === 0 ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
          <StoriesStrip />
          <View style={s.center}>
            <Ionicons name="chatbubbles-outline" size={64} color={colors.neutral[300]} />
            <Text style={s.emptyTitle}>Le fil est encore vide</Text>
            <Text style={s.emptyText}>Sois le premier à partager une sortie, un événement ou un coup de cœur.</Text>
            <Pressable onPress={() => router.push('/post-create')} style={s.emptyBtn}>
              <Text style={s.emptyBtnText}>Publier un post</Text>
            </Pressable>
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: spacing['2xl'] }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(); }}
            />
          }
        >
          <StoriesStrip />
          {posts.map((p) => (
            <View key={p.id} style={s.card}>
              <View style={s.cardHeader}>
                <View style={s.avatar}>
                  {p.author?.avatar_url ? (
                    <Image source={{ uri: p.author.avatar_url }} style={s.avatarImg} />
                  ) : (
                    <Text style={s.avatarTxt}>{(p.author?.full_name || p.author?.phone || '?').charAt(0).toUpperCase()}</Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.author}>{p.author?.full_name || p.author?.phone || 'Anonyme'}</Text>
                  <Text style={s.time}>{relativeTime(p.created_at)}</Text>
                </View>
                {p.user_id === user?.id && (
                  <Pressable onPress={() => handleDelete(p)} hitSlop={10}>
                    <Ionicons name="ellipsis-horizontal" size={20} color={colors.neutral[500]} />
                  </Pressable>
                )}
              </View>

              {p.body ? <Text style={s.body}>{p.body}</Text> : null}
              {p.image_url ? (
                <Image source={{ uri: p.image_url }} style={s.image} resizeMode="cover" />
              ) : null}

              <View style={s.actions}>
                <Pressable onPress={() => handleLike(p)} style={s.actionBtn} hitSlop={8}>
                  <Ionicons
                    name={p.liked_by_me ? 'heart' : 'heart-outline'}
                    size={22}
                    color={p.liked_by_me ? colors.danger : colors.neutral[600]}
                  />
                  <Text style={[s.actionLabel, p.liked_by_me && { color: colors.danger }]}>
                    {p.like_count > 0 ? p.like_count : ''}
                  </Text>
                </Pressable>
              </View>
            </View>
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
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `il y a ${days} j`;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.light },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.neutral[200],
  },
  title: { fontSize: typography.fontSize.xl, fontWeight: '700', color: colors.dark },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headerIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.neutral[100],
    alignItems: 'center', justifyContent: 'center',
  },
  fab: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.primary[500],
    alignItems: 'center', justifyContent: 'center',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyTitle: { marginTop: spacing.base, fontSize: typography.fontSize.base, fontWeight: '700', color: colors.dark },
  emptyText: { marginTop: spacing.xs, fontSize: typography.fontSize.sm, color: colors.neutral[500], textAlign: 'center', maxWidth: 280 },
  emptyBtn: { marginTop: spacing.lg, backgroundColor: colors.primary[500], paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.lg },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: typography.fontSize.sm },
  card: {
    backgroundColor: '#fff',
    marginHorizontal: spacing.lg, marginTop: spacing.md,
    borderRadius: radius.lg, overflow: 'hidden',
    borderWidth: 1, borderColor: colors.neutral[200],
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  avatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: colors.primary[500],
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarTxt: { color: '#fff', fontWeight: '700', fontSize: typography.fontSize.base },
  author: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.dark },
  time: { fontSize: typography.fontSize.xs, color: colors.neutral[500] },
  body: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm, fontSize: typography.fontSize.sm, color: colors.dark, lineHeight: 20 },
  image: { width: '100%', aspectRatio: 4 / 3, backgroundColor: colors.neutral[100] },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.neutral[100] },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  actionLabel: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.neutral[700] },
});
