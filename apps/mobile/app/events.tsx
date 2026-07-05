// ============================================================================
// /events — découverte des événements publiés (Phase 4 refonte UX).
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet, Image, RefreshControl, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { typography, radius, spacing, formatXOF, type ColorPalette } from '@soutra/shared';
import { supabase } from '@/lib/supabase';
import { useColors } from '@/lib/theme';
import { ScreenHeader } from '@/components/ScreenHeader';

interface DiscoveryEvent {
  event_id: string;
  title: string;
  cover_url: string | null;
  starts_at: string;
  ends_at: string;
  city: string | null;
  venue_id: string | null;
  venue_name: string | null;
  min_price_xof: number | null;
  max_price_xof: number | null;
  is_free: boolean;
  remaining_capacity: number | null;
}

export default function EventsScreen() {
  const router = useRouter();
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  const [events, setEvents] = useState<DiscoveryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data, error } = await (supabase.rpc as any)('list_published_events', {
        p_limit: 30,
        p_offset: 0,
      });
      if (error) throw error;
      setEvents((data ?? []) as DiscoveryEvent[]);
    } catch (err) {
      console.error('[events] load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    void load();
  };

  const priceLabel = (e: DiscoveryEvent): string => {
    if (e.is_free || e.min_price_xof == null) return 'Entrée libre';
    if (e.min_price_xof === e.max_price_xof) return formatXOF(e.min_price_xof);
    return `À partir de ${formatXOF(e.min_price_xof)}`;
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader title="Événements" subtitle="Concerts, soirées, sorties à venir" />

      {loading ? (
        <ActivityIndicator size="large" color={c.primary[500]} style={s.center} />
      ) : events.length === 0 ? (
        <View style={s.center}>
          <Ionicons name="calendar-outline" size={40} color={c.neutral[300]} />
          <Text style={s.emptyTitle}>Aucun événement publié</Text>
          <Text style={s.emptyText}>Reviens bientôt pour découvrir les prochaines sorties.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary[500]} />}
        >
          {events.map((e) => {
            const soldOut = e.remaining_capacity != null && e.remaining_capacity <= 0;
            return (
              <Pressable
                key={e.event_id}
                onPress={() => router.push({ pathname: '/event/[id]', params: { id: e.event_id } })}
                style={({ pressed }) => [s.card, pressed && { opacity: 0.9 }]}
              >
                <View style={s.hero}>
                  {e.cover_url ? (
                    <Image source={{ uri: e.cover_url }} style={StyleSheet.absoluteFill} />
                  ) : (
                    <Text style={s.heroFallback}>🎉</Text>
                  )}
                  {soldOut && (
                    <View style={s.soldOutBadge}>
                      <Text style={s.soldOutText}>COMPLET</Text>
                    </View>
                  )}
                </View>
                <View style={s.body}>
                  <Text style={s.title} numberOfLines={2}>{e.title}</Text>
                  <Text style={s.meta} numberOfLines={1}>
                    {formatEventDate(e.starts_at)} · {e.venue_name ?? e.city ?? 'Lieu à confirmer'}
                  </Text>
                  <Text style={s.price}>{priceLabel(e)}</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function formatEventDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.light },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xl },
    emptyTitle: { fontSize: typography.fontSize.base, fontWeight: '700', color: c.dark, marginTop: spacing.sm },
    emptyText: { fontSize: typography.fontSize.sm, color: c.neutral[500], textAlign: 'center' },
    card: { borderRadius: radius.lg, backgroundColor: '#fff', overflow: 'hidden', borderWidth: 1, borderColor: c.neutral[100] },
    hero: { width: '100%', height: 140, backgroundColor: c.neutral[100], alignItems: 'center', justifyContent: 'center' },
    heroFallback: { fontSize: 40 },
    soldOutBadge: {
      position: 'absolute', top: spacing.sm, right: spacing.sm,
      backgroundColor: c.danger, borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 4,
    },
    soldOutText: { fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
    body: { padding: spacing.md, gap: 4 },
    title: { fontSize: typography.fontSize.base, fontWeight: '700', color: c.dark },
    meta: { fontSize: typography.fontSize.xs, color: c.neutral[600] },
    price: { fontSize: typography.fontSize.sm, fontWeight: '700', color: c.primary[600], marginTop: 2 },
  });
}
