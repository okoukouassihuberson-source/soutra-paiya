import { useCallback, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, Image, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, radius, spacing, formatXOF } from '@soutra/shared';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

interface FavVenue {
  id: string;
  name: string;
  cover_url: string | null;
  city: string | null;
  avg_price_xof: number | null;
  rating_avg: number | null;
}

export default function Favorites() {
  const router = useRouter();
  const { user } = useAuth();
  const sb = supabase as any;

  const [venues, setVenues] = useState<FavVenue[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    const { data } = await sb
      .from('favorites')
      .select('venue_id, created_at, venues(id, name, cover_url, city, avg_price_xof, rating_avg)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    const list: FavVenue[] = [];
    for (const row of data ?? []) {
      if (row.venues) list.push(row.venues as FavVenue);
    }
    setVenues(list);
    setLoading(false);
  }, [user?.id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function remove(venueId: string) {
    if (!user?.id) return;
    setVenues((prev) => prev.filter((v) => v.id !== venueId));
    const { error } = await sb
      .from('favorites')
      .delete()
      .eq('user_id', user.id)
      .eq('venue_id', venueId);
    if (error) {
      Alert.alert('Erreur', 'Suppression impossible.');
      void load();
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Pressable hitSlop={10} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color={colors.dark} />
        </Pressable>
        <Text style={s.headerTitle}>Mes favoris</Text>
        <View style={{ width: 28 }} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary[500]} style={s.center} />
      ) : venues.length === 0 ? (
        <View style={s.center}>
          <Ionicons name="heart-outline" size={48} color={colors.neutral[300]} />
          <Text style={s.emptyTitle}>Aucun favori</Text>
          <Text style={s.emptyText}>
            Ajoute des lieux avec le cœur depuis leur fiche.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
          {venues.map((v) => (
            <Pressable
              key={v.id}
              onPress={() => router.push({ pathname: '/venue/[id]', params: { id: v.id } })}
              style={({ pressed }) => [s.card, pressed && { opacity: 0.85 }]}
            >
              {v.cover_url ? (
                <Image source={{ uri: v.cover_url }} style={s.cover} />
              ) : (
                <View style={[s.cover, s.coverPlaceholder]}>
                  <Ionicons name="image-outline" size={26} color={colors.neutral[300]} />
                </View>
              )}
              <View style={s.cardBody}>
                <Text style={s.venueName} numberOfLines={1}>{v.name}</Text>
                <Text style={s.venueMeta} numberOfLines={1}>
                  {v.city ?? 'Abidjan'} · ★ {v.rating_avg ?? 0}
                </Text>
                <Text style={s.venuePrice}>{formatXOF(v.avg_price_xof ?? 0)}/pers</Text>
              </View>
              <Pressable hitSlop={8} onPress={() => remove(v.id)} style={s.heartBtn}>
                <Ionicons name="heart" size={22} color={colors.danger} />
              </Pressable>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.light },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.base,
  },
  headerTitle: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.dark },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl, gap: spacing.sm },
  emptyTitle: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.dark, marginTop: spacing.sm },
  emptyText: { fontSize: typography.fontSize.sm, color: colors.neutral[500], textAlign: 'center' },
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: radius.lg, overflow: 'hidden',
  },
  cover: { width: 96, height: 96 },
  coverPlaceholder: { backgroundColor: colors.neutral[100], alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1, paddingHorizontal: spacing.base, gap: 2 },
  venueName: { fontSize: typography.fontSize.base, fontWeight: '700', color: colors.dark },
  venueMeta: { fontSize: typography.fontSize.sm, color: colors.neutral[500] },
  venuePrice: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.primary[500] },
  heartBtn: { padding: spacing.base },
});
