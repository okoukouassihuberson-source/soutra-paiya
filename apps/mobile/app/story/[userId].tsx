import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image, ActivityIndicator, Alert, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, radius } from '@soutra/shared';
import { listUserStories, markStoryViewed, deleteStory, type StoryItem } from '@/lib/stories';

const STORY_DURATION_MS = 5000;
const { width: SCREEN_W } = Dimensions.get('window');

/**
 * Viewer plein écran d'une série de stories d'un user.
 * Tap droit -> suivante, tap gauche -> précédente.
 * Auto-advance après 5s. Marque comme vue dès affichage.
 */
export default function StoryViewer() {
  const router = useRouter();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const [stories, setStories] = useState<StoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        const data = await listUserStories(userId);
        if (data.length === 0) {
          router.back();
          return;
        }
        setStories(data);
        // Démarre sur la première non-vue, ou la première si toutes vues.
        const firstUnviewed = data.findIndex((s) => !s.viewed_by_me && !s.mine);
        setIndex(firstUnviewed >= 0 ? firstUnviewed : 0);
      } catch (err: any) {
        Alert.alert('Erreur', err?.message ?? 'Chargement impossible.');
        router.back();
      } finally {
        setLoading(false);
      }
    })();
  }, [userId, router]);

  const current = stories[index];

  // Marquage vu + auto-advance.
  useEffect(() => {
    if (!current) return;
    if (!current.mine) markStoryViewed(current.id);

    setProgress(0);
    const startedAt = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const ratio = elapsed / STORY_DURATION_MS;
      if (ratio >= 1) {
        clearInterval(timerRef.current!);
        next();
      } else {
        setProgress(ratio);
      }
    }, 80);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, stories.length]);

  function next() {
    if (index + 1 < stories.length) setIndex(index + 1);
    else router.back();
  }
  function prev() {
    if (index > 0) setIndex(index - 1);
  }

  async function handleDelete() {
    if (!current || !current.mine) return;
    Alert.alert('Supprimer cette story ?', 'Cette action est définitive.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive', onPress: async () => {
          try {
            await deleteStory(current.id);
            const next = stories.filter((s) => s.id !== current.id);
            if (next.length === 0) router.back();
            else { setStories(next); setIndex(Math.min(index, next.length - 1)); }
          } catch (err: any) {
            Alert.alert('Erreur', err?.message ?? 'Suppression impossible.');
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}><ActivityIndicator size="large" color="#fff" /></View>
      </SafeAreaView>
    );
  }
  if (!current) return null;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* Barres de progression */}
      <View style={s.bars}>
        {stories.map((_, i) => (
          <View key={i} style={s.barBg}>
            <View
              style={[
                s.barFg,
                { width: i < index ? '100%' : i === index ? `${Math.min(100, progress * 100)}%` : '0%' },
              ]}
            />
          </View>
        ))}
      </View>

      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="close" size={26} color="#fff" />
        </Pressable>
        <Text style={s.time}>{relativeTime(current.created_at)}</Text>
        {current.mine && (
          <Pressable onPress={handleDelete} hitSlop={10}>
            <Ionicons name="trash-outline" size={22} color="#fff" />
          </Pressable>
        )}
        {!current.mine && <View style={{ width: 22 }} />}
      </View>

      {/* Image */}
      <View style={s.imgWrap}>
        <Image source={{ uri: current.media_url }} style={s.img} resizeMode="contain" />
        {current.caption && (
          <View style={s.captionBox}><Text style={s.caption}>{current.caption}</Text></View>
        )}
      </View>

      {/* Footer : compteur de vues (proprio) ou tap zones */}
      {current.mine && (
        <View style={s.footer}>
          <Ionicons name="eye-outline" size={18} color="#fff" />
          <Text style={s.footerText}>{current.view_count} vue{current.view_count === 1 ? '' : 's'}</Text>
        </View>
      )}

      {/* Tap zones invisibles pour next/prev */}
      <Pressable style={[s.tapZone, s.tapLeft]} onPress={prev} />
      <Pressable style={[s.tapZone, s.tapRight]} onPress={next} />
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
  return `il y a ${h} h`;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#000' },
  bars: { flexDirection: 'row', gap: 4, paddingHorizontal: spacing.md, paddingTop: spacing.sm, zIndex: 2 },
  barBg: { flex: 1, height: 3, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 2, overflow: 'hidden' },
  barFg: { height: '100%', backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, zIndex: 2 },
  time: { color: '#fff', fontSize: typography.fontSize.xs },
  imgWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  img: { width: '100%', height: '100%' },
  captionBox: { position: 'absolute', bottom: 80, left: spacing.lg, right: spacing.lg, backgroundColor: 'rgba(0,0,0,0.5)', padding: spacing.md, borderRadius: radius.lg },
  caption: { color: '#fff', fontSize: typography.fontSize.base, fontWeight: '600' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingVertical: spacing.md, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 2 },
  footerText: { color: '#fff', fontSize: typography.fontSize.sm, fontWeight: '600' },
  tapZone: { position: 'absolute', top: 60, bottom: 80, width: SCREEN_W / 2.5, zIndex: 1 },
  tapLeft: { left: 0 },
  tapRight: { right: 0 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
