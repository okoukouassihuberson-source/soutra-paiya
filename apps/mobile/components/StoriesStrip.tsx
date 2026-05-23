import { useEffect, useState, useCallback } from 'react';
import { ScrollView, View, Text, Pressable, Image, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing } from '@soutra/shared';
import { listActiveStories, type StoryStripItem } from '@/lib/stories';
import { useAuth } from '@/lib/auth-context';

/**
 * Barre horizontale d'avatars de stories.
 * Premier item : « Toi » avec un + pour ajouter, sinon ton avatar avec
 * ring coloré si tu as des stories actives.
 * Items suivants : autres users avec ring coloré si non-vues.
 */
export function StoriesStrip({ reloadKey = 0 }: { reloadKey?: number }) {
  const router = useRouter();
  const { user } = useAuth();
  const [items, setItems] = useState<StoryStripItem[]>([]);

  const load = useCallback(async () => {
    try {
      const data = await listActiveStories();
      setItems(data);
    } catch (err) {
      console.warn('[stories-strip] load error:', err);
    }
  }, []);

  useEffect(() => { load(); }, [load, reloadKey]);

  const mine = items.find((i) => i.user_id === user?.id);
  const others = items.filter((i) => i.user_id !== user?.id);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
      {/* Ton avatar -> créer ou consulter */}
      <Pressable
        onPress={() => mine ? router.push({ pathname: '/story/[userId]', params: { userId: user!.id } }) : router.push('/story-create')}
        style={s.item}
      >
        <View style={[s.ringWrap, mine && s.ringMine]}>
          <View style={s.avatar}>
            {mine?.user_avatar ? (
              <Image source={{ uri: mine.user_avatar }} style={s.avatarImg} />
            ) : (
              <Text style={s.avatarTxt}>{(user?.user_metadata?.full_name || user?.phone || 'M').toString().charAt(0).toUpperCase()}</Text>
            )}
          </View>
          <View style={s.plusBadge}>
            <Ionicons name="add" size={14} color="#fff" />
          </View>
        </View>
        <Text style={s.name} numberOfLines={1}>{mine ? 'Toi' : 'Ajouter'}</Text>
      </Pressable>

      {/* Autres users */}
      {others.map((it) => (
        <Pressable
          key={it.user_id}
          onPress={() => router.push({ pathname: '/story/[userId]', params: { userId: it.user_id } })}
          style={s.item}
        >
          <View style={[s.ringWrap, it.has_unviewed ? s.ringUnviewed : s.ringViewed]}>
            <View style={s.avatar}>
              {it.user_avatar ? (
                <Image source={{ uri: it.user_avatar }} style={s.avatarImg} />
              ) : (
                <Text style={s.avatarTxt}>{(it.user_name || '?').charAt(0).toUpperCase()}</Text>
              )}
            </View>
          </View>
          <Text style={s.name} numberOfLines={1}>{it.user_name || 'Anonyme'}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  row: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.md },
  item: { alignItems: 'center', width: 72 },
  ringWrap: {
    width: 64, height: 64, borderRadius: 32,
    alignItems: 'center', justifyContent: 'center',
    padding: 2,
    backgroundColor: colors.neutral[200],
    position: 'relative',
  },
  ringUnviewed: { backgroundColor: colors.primary[500] },
  ringViewed: { backgroundColor: colors.neutral[300] },
  ringMine: { backgroundColor: colors.primary[500] },
  avatar: {
    flex: 1, width: '100%', borderRadius: 30,
    backgroundColor: colors.primary[500],
    borderWidth: 2, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarTxt: { color: '#fff', fontSize: typography.fontSize.base, fontWeight: '700' },
  plusBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: colors.primary[500],
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  name: { marginTop: spacing.xs, fontSize: typography.fontSize.xs, color: colors.dark, fontWeight: '600', maxWidth: 72, textAlign: 'center' },
});
