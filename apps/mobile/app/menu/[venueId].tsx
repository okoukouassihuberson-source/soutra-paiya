// ============================================================================
// /menu/[venueId] — carte consultable d'un restaurant.
//
// Lecture seule (photo/nom/description/prix/disponibilité par catégorie) —
// pas de commande/panier cette phase (le système de panier existant, migration
// 0055, est conçu pour les boutiques via `products`, pas `menu_items`).
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ScrollView, View, Text, StyleSheet, RefreshControl, ActivityIndicator, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { typography, radius, spacing, formatXOF, type ColorPalette } from '@soutra/shared';
import { supabase } from '@/lib/supabase';
import { useColors } from '@/lib/theme';
import { ScreenHeader } from '@/components/ScreenHeader';

interface MenuItem {
  id: string;
  name: string;
  category: string;
  description: string | null;
  price_xof: number;
  image_url: string | null;
  available: boolean;
  position: number;
}

interface VenueLite {
  id: string;
  name: string;
}

export default function MenuScreen() {
  const { venueId } = useLocalSearchParams<{ venueId: string }>();
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  const [venue, setVenue] = useState<VenueLite | null>(null);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!venueId) { setLoading(false); return; }
    try {
      const [{ data: v }, { data: m }] = await Promise.all([
        supabase.from('venues').select('id, name').eq('id', venueId).maybeSingle(),
        supabase.from('menu_items')
          .select('id, name, category, description, price_xof, image_url, available, position')
          .eq('venue_id', venueId)
          .order('position', { ascending: true })
          .order('created_at', { ascending: false }),
      ]);
      setVenue(v as VenueLite | null);
      setItems((m as MenuItem[]) ?? []);
    } catch (err) {
      console.error('[menu] load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [venueId]);

  useEffect(() => { void load(); }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    void load();
  };

  // Regroupe par catégorie, dans l'ordre de première apparition (les plats
  // sont déjà triés par `position` — l'ordre de catégorie suit donc le choix
  // du Pro plutôt qu'un tri alphabétique arbitraire).
  const groups = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, MenuItem[]>();
    for (const item of items) {
      const key = item.category || 'Autre';
      if (!map.has(key)) {
        map.set(key, []);
        order.push(key);
      }
      map.get(key)!.push(item);
    }
    return order.map((category) => ({ category, items: map.get(category)! }));
  }, [items]);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader title="Menu" subtitle={venue?.name} />

      {loading ? (
        <ActivityIndicator size="large" color={c.primary[500]} style={s.center} />
      ) : items.length === 0 ? (
        <View style={s.center}>
          <Ionicons name="restaurant-outline" size={40} color={c.neutral[300]} />
          <Text style={s.emptyTitle}>Menu pas encore publié</Text>
          <Text style={s.emptyText}>Ce restaurant n'a pas encore ajouté son menu.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['2xl'] }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary[500]} />}
        >
          {groups.map((group) => (
            <View key={group.category} style={{ marginBottom: spacing.lg }}>
              <Text style={s.categoryTitle}>{group.category}</Text>
              {group.items.map((item) => (
                <View key={item.id} style={[s.itemRow, !item.available && s.itemRowDisabled]}>
                  {item.image_url ? (
                    <Image source={{ uri: item.image_url }} style={s.itemImage} />
                  ) : (
                    <View style={[s.itemImage, s.itemImagePlaceholder]}>
                      <Ionicons name="restaurant-outline" size={20} color={c.neutral[300]} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={s.itemName} numberOfLines={1}>{item.name}</Text>
                    {item.description && (
                      <Text style={s.itemDesc} numberOfLines={2}>{item.description}</Text>
                    )}
                    <View style={s.itemFooter}>
                      <Text style={s.itemPrice}>{formatXOF(item.price_xof)}</Text>
                      {!item.available && (
                        <View style={s.unavailableBadge}>
                          <Text style={s.unavailableText}>Indisponible</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.light },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xl },
    emptyTitle: { fontSize: typography.fontSize.base, fontWeight: '700', color: c.dark, marginTop: spacing.sm },
    emptyText: { fontSize: typography.fontSize.sm, color: c.neutral[500], textAlign: 'center' },
    categoryTitle: {
      fontSize: typography.fontSize.xs, fontWeight: '700', color: c.neutral[500],
      textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: spacing.sm,
    },
    itemRow: {
      flexDirection: 'row', gap: spacing.md,
      paddingVertical: spacing.sm,
      borderBottomWidth: 1, borderBottomColor: c.neutral[100],
    },
    itemRowDisabled: { opacity: 0.5 },
    itemImage: { width: 64, height: 64, borderRadius: radius.md, backgroundColor: c.neutral[100] },
    itemImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
    itemName: { fontSize: typography.fontSize.sm, fontWeight: '700', color: c.dark },
    itemDesc: { fontSize: typography.fontSize.xs, color: c.neutral[600], marginTop: 2, lineHeight: 16 },
    itemFooter: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 4 },
    itemPrice: { fontSize: typography.fontSize.sm, fontWeight: '700', color: c.primary[600] },
    unavailableBadge: { backgroundColor: c.neutral[100], borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 2 },
    unavailableText: { fontSize: 10, fontWeight: '700', color: c.neutral[500] },
  });
}
