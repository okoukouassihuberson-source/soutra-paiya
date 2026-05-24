import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Image, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { typography, radius, spacing, type ColorPalette } from '@soutra/shared';
import { useColors } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { listFeed, toggleLike, deletePost, type Post } from '@/lib/social';
import { StoriesStrip } from '@/components/StoriesStrip';
import { CommentsSheet } from '@/components/CommentsSheet';
import { TabHeader } from '@/components/TabHeader';
import { Skeleton } from '@/components/Skeleton';

export default function Social() {
  const router = useRouter();
  const { user } = useAuth();
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyLike, setBusyLike] = useState<string | null>(null);
  const [openSheetFor, setOpenSheetFor] = useState<string | null>(null);

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
      <TabHeader
        subtitle="Tendances, posts & matchs"
        trailing={(
          <View style={s.headerActions}>
            <Pressable onPress={() => router.push('/chats')} style={s.iconBtn} hitSlop={6}>
              <Ionicons name="chatbubbles-outline" size={20} color={c.dark} />
            </Pressable>
            <Pressable onPress={() => router.push('/discover')} style={s.iconBtn} hitSlop={6}>
              <Ionicons name="people" size={20} color={c.dark} />
            </Pressable>
            <Pressable onPress={() => router.push('/post-create')} style={s.fab} hitSlop={6}>
              <Ionicons name="add" size={22} color="#fff" />
            </Pressable>
          </View>
        )}
      />

      {loading ? (
        <ScrollView contentContainerStyle={{ paddingBottom: spacing['2xl'] }}>
          <StoriesStrip />
          <PostSkeleton c={c} />
          <PostSkeleton c={c} />
        </ScrollView>
      ) : posts.length === 0 ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
          <StoriesStrip />
          <View style={s.emptyBody}>
            <View style={s.emptyIconWrap}>
              <Ionicons name="chatbubbles" size={48} color={c.primary[400]} />
            </View>
            <Text style={s.emptyTitle}>Le fil est encore vide</Text>
            <Text style={s.emptyText}>Sois le premier à partager une sortie, un événement ou un coup de cœur.</Text>
            <Pressable
              onPress={() => router.push('/post-create')}
              style={({ pressed }) => [s.emptyBtn, pressed && { opacity: 0.9, transform: [{ scale: 0.97 }] }]}
            >
              <Ionicons name="add" size={18} color="#fff" />
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
                  <Pressable onPress={() => handleDelete(p)} hitSlop={10} style={s.menuBtn}>
                    <Ionicons name="ellipsis-horizontal" size={20} color={c.neutral[500]} />
                  </Pressable>
                )}
              </View>

              {p.body ? <Text style={s.body}>{p.body}</Text> : null}
              {p.image_url ? (
                <Image source={{ uri: p.image_url }} style={s.image} resizeMode="cover" />
              ) : null}

              <View style={s.actions}>
                <Pressable
                  onPress={() => handleLike(p)}
                  style={({ pressed }) => [s.actionBtn, pressed && { opacity: 0.7 }]}
                  hitSlop={8}
                >
                  <Ionicons
                    name={p.liked_by_me ? 'heart' : 'heart-outline'}
                    size={22}
                    color={p.liked_by_me ? c.danger : c.neutral[600]}
                  />
                  {p.like_count > 0 && (
                    <Text style={[s.actionLabel, p.liked_by_me && { color: c.danger }]}>
                      {p.like_count}
                    </Text>
                  )}
                </Pressable>
                <Pressable
                  onPress={() => setOpenSheetFor(p.id)}
                  style={({ pressed }) => [s.actionBtn, pressed && { opacity: 0.7 }]}
                  hitSlop={8}
                >
                  <Ionicons name="chatbubble-outline" size={20} color={c.neutral[600]} />
                  {p.comment_count > 0 && (
                    <Text style={s.actionLabel}>{p.comment_count}</Text>
                  )}
                </Pressable>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Bottom sheet partagé pour tous les posts */}
      <CommentsSheet
        postId={openSheetFor}
        visible={!!openSheetFor}
        onClose={() => setOpenSheetFor(null)}
        onCountChange={(postId, delta) => {
          setPosts((prev) => prev.map((p) =>
            p.id === postId ? { ...p, comment_count: Math.max(0, (p.comment_count || 0) + delta) } : p
          ));
        }}
      />
    </SafeAreaView>
  );
}

function PostSkeleton({ c }: { c: ColorPalette }) {
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <View style={s.card}>
      <View style={s.cardHeader}>
        <Skeleton width={38} height={38} borderRadius={19} />
        <View style={{ flex: 1 }}>
          <Skeleton width="50%" height={14} />
          <Skeleton width="30%" height={11} style={{ marginTop: 6 }} />
        </View>
      </View>
      <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.sm }}>
        <Skeleton width="90%" height={12} />
        <Skeleton width="70%" height={12} style={{ marginTop: 6 }} />
      </View>
      <Skeleton width="100%" height={220} borderRadius={0} />
      <View style={{ flexDirection: 'row', gap: spacing.lg, padding: spacing.md }}>
        <Skeleton width={50} height={20} />
        <Skeleton width={50} height={20} />
      </View>
    </View>
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

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.light },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    iconBtn: {
      width: 40, height: 40, borderRadius: 20,
      backgroundColor: c.neutral[50], alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: c.neutral[200],
    },
    fab: {
      width: 40, height: 40, borderRadius: 20,
      backgroundColor: c.primary[500],
      alignItems: 'center', justifyContent: 'center',
      shadowColor: c.primary[500], shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4,
    },
    emptyBody: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, paddingVertical: spacing['2xl'] },
    emptyIconWrap: { width: 96, height: 96, borderRadius: 48, backgroundColor: c.primary[50], alignItems: 'center', justifyContent: 'center', marginBottom: spacing.base },
    emptyTitle: { fontSize: typography.fontSize.lg, fontWeight: '700', color: c.dark, marginBottom: spacing.xs },
    emptyText: { fontSize: typography.fontSize.sm, color: c.neutral[500], textAlign: 'center', maxWidth: 300, lineHeight: 20 },
    emptyBtn: {
      marginTop: spacing.lg,
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      backgroundColor: c.primary[500],
      paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.full,
      shadowColor: c.primary[500], shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4,
    },
    emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: typography.fontSize.sm },
    card: {
      backgroundColor: c.neutral[50],
      marginHorizontal: spacing.lg, marginTop: spacing.md,
      borderRadius: radius.lg, overflow: 'hidden',
      elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
    avatar: {
      width: 40, height: 40, borderRadius: 20,
      backgroundColor: c.primary[500],
      alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
      borderWidth: 2, borderColor: c.neutral[50],
    },
    avatarImg: { width: '100%', height: '100%' },
    avatarTxt: { color: '#fff', fontWeight: '700', fontSize: typography.fontSize.base },
    author: { fontSize: typography.fontSize.sm, fontWeight: '700', color: c.dark },
    time: { fontSize: typography.fontSize.xs, color: c.neutral[500], marginTop: 2 },
    menuBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    body: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm, fontSize: typography.fontSize.sm, color: c.dark, lineHeight: 20 },
    image: { width: '100%', aspectRatio: 4 / 3, backgroundColor: c.neutral[100] },
    actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: c.neutral[100] },
    actionBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.sm },
    actionLabel: { fontSize: typography.fontSize.sm, fontWeight: '700', color: c.neutral[700] },
  });
}
