// ============================================================================
// CategorizedPhotos — sections de photos taguées par type (Menu, Chambres,
// Vitrine...), en complément de la galerie hero existante (Gallery.tsx,
// jamais retouchée). Table dédiée venue_photos (migration 0078).
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, Image, ScrollView, StyleSheet } from 'react-native';
import { typography, radius, spacing, type ColorPalette } from '@soutra/shared';
import { useColors } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { Lightbox, type MediaItem } from './Lightbox';

interface VenuePhoto {
  url: string;
  category: string;
  position: number;
}

interface Props {
  venueId: string;
}

export function CategorizedPhotos({ venueId }: Props) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const [photos, setPhotos] = useState<VenuePhoto[]>([]);
  const [lightbox, setLightbox] = useState<{ media: MediaItem[]; index: number } | null>(null);

  useEffect(() => {
    if (!venueId) return;
    (async () => {
      const { data } = await supabase
        .from('venue_photos')
        .select('url, category, position')
        .eq('venue_id', venueId)
        .order('category', { ascending: true })
        .order('position', { ascending: true });
      setPhotos((data as VenuePhoto[]) ?? []);
    })();
  }, [venueId]);

  const groups = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, VenuePhoto[]>();
    for (const p of photos) {
      if (!map.has(p.category)) {
        map.set(p.category, []);
        order.push(p.category);
      }
      map.get(p.category)!.push(p);
    }
    return order.map((category) => ({ category, items: map.get(category)! }));
  }, [photos]);

  // Rendu vide si aucune photo catégorisée n'existe — pas de bandeau inutile.
  if (groups.length === 0) return null;

  return (
    <View style={s.wrap}>
      {groups.map((group) => (
        <View key={group.category} style={{ marginBottom: spacing.lg }}>
          <Text style={s.categoryTitle}>{group.category}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {group.items.map((item, idx) => (
                <Pressable
                  key={`${item.url}-${idx}`}
                  onPress={() => setLightbox({
                    media: group.items.map((i) => ({ url: i.url, kind: 'image' })),
                    index: idx,
                  })}
                >
                  <Image source={{ uri: item.url }} style={s.thumb} />
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>
      ))}

      <Lightbox
        visible={!!lightbox}
        media={lightbox?.media ?? []}
        initialIndex={lightbox?.index ?? 0}
        onClose={() => setLightbox(null)}
      />
    </View>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    wrap: { marginTop: spacing.lg },
    categoryTitle: {
      fontSize: typography.fontSize.sm, fontWeight: '700', color: c.dark,
      marginBottom: spacing.sm,
    },
    thumb: { width: 120, height: 120, borderRadius: radius.lg, backgroundColor: c.neutral[100] },
  });
}
