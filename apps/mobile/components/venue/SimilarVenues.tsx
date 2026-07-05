// ============================================================================
// SimilarVenues — établissements similaires (même catégorie, à proximité).
// Réutilise search_venues_nearby (migration 0021, déjà utilisée pour la
// recherche géolocalisée) avec les coordonnées et la catégorie du venue
// courant — aucune nouvelle RPC nécessaire.
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, Image, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { typography, radius, spacing, formatDistance, type ColorPalette } from '@soutra/shared';
import { useColors } from '@/lib/theme';
import { supabase } from '@/lib/supabase';

interface SimilarVenue {
  id: string;
  name: string;
  cover_url: string | null;
  rating_avg: number | null;
  distance_km: number | null;
}

interface Props {
  venueId: string;
  category: string;
  coords: { lat: number; lng: number } | null;
}

const MAX_RESULTS = 6;

export function SimilarVenues({ venueId, category, coords }: Props) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const router = useRouter();
  const [venues, setVenues] = useState<SimilarVenue[]>([]);

  useEffect(() => {
    if (!coords) return;
    (async () => {
      const { data, error } = await (supabase.rpc as any)('search_venues_nearby', {
        p_lat: coords.lat,
        p_lng: coords.lng,
        p_radius_km: 15,
        p_category: category,
      });
      if (error) { console.error('[similar-venues] load error:', error); return; }
      const filtered = ((data ?? []) as SimilarVenue[])
        .filter((v) => v.id !== venueId)
        .slice(0, MAX_RESULTS);
      setVenues(filtered);
    })();
  }, [venueId, category, coords]);

  if (venues.length === 0) return null;

  return (
    <View style={s.wrap}>
      <Text style={s.title}>Établissements similaires</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          {venues.map((v) => (
            <Pressable
              key={v.id}
              style={({ pressed }) => [s.card, pressed && { opacity: 0.9 }]}
              onPress={() => router.push({ pathname: '/venue/[id]', params: { id: v.id } })}
            >
              {v.cover_url ? (
                <Image source={{ uri: v.cover_url }} style={s.cardImage} />
              ) : (
                <View style={[s.cardImage, s.cardImagePlaceholder]}>
                  <Ionicons name="image-outline" size={22} color={c.neutral[300]} />
                </View>
              )}
              <Text style={s.cardName} numberOfLines={1}>{v.name}</Text>
              <View style={s.cardMetaRow}>
                {v.rating_avg != null && (
                  <View style={s.metaCell}>
                    <Ionicons name="star" size={11} color={c.warning} />
                    <Text style={s.metaText}>{v.rating_avg.toFixed(1)}</Text>
                  </View>
                )}
                {v.distance_km != null && (
                  <Text style={s.metaText}>{formatDistance(v.distance_km * 1000)}</Text>
                )}
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    wrap: { marginTop: spacing.xl },
    title: { fontSize: typography.fontSize.lg, fontWeight: '700', color: c.dark, marginBottom: spacing.md },
    card: { width: 140 },
    cardImage: { width: 140, height: 100, borderRadius: radius.lg, backgroundColor: c.neutral[100] },
    cardImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
    cardName: { fontSize: typography.fontSize.sm, fontWeight: '700', color: c.dark, marginTop: spacing.sm },
    cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2 },
    metaCell: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    metaText: { fontSize: typography.fontSize.xs, color: c.neutral[600] },
  });
}
