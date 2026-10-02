import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet, ActivityIndicator, RefreshControl, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { radius, spacing, typography, type ColorPalette, type Destination } from '@soutra/shared';
import { useColors } from '@/lib/theme';
import { ScreenHeader } from '@/components/ScreenHeader';
import { listDestinations } from '@/lib/tourism';

/** /destinations — villes, régions et sites à découvrir (toucher une carte pour lire la présentation). */
export default function DestinationsScreen() {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const [items, setItems] = useState<Destination[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(false);
    try { setItems(await listDestinations()); } catch { setItems([]); setError(true); }
    setLoading(false); setRefreshing(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader title="Destinations" subtitle="Où partir en Côte d’Ivoire et au-delà" />
      {loading ? <View style={s.center}><ActivityIndicator color={c.primary[500]} /></View> : (
        <ScrollView contentContainerStyle={{ paddingVertical: spacing.md, paddingBottom: spacing['2xl'] }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
          {error && <Text style={s.empty}>Impossible de charger les destinations. Tirez pour réessayer.</Text>}
          {!error && items.length === 0 && <Text style={s.empty}>Aucune destination pour le moment.</Text>}
          {items.map((d) => {
            const expanded = open === d.id;
            return (
              <Pressable key={d.id} onPress={() => setOpen(expanded ? null : d.id)} accessibilityRole="button" accessibilityState={{ expanded }} style={s.card}>
                {d.cover_url ? <Image source={{ uri: d.cover_url }} style={s.cover} /> : <View style={[s.cover, { backgroundColor: c.neutral[100] }]} />}
                <View style={s.body}>
                  <Text style={s.title}>{d.name}</Text>
                  {d.tagline ? <Text style={s.meta}>{d.tagline}</Text> : null}
                  {expanded && d.description ? <Text style={[s.meta, { marginTop: 6, lineHeight: 20 }]}>{d.description}</Text> : null}
                  {expanded && d.history ? <Text style={[s.meta, { marginTop: 6, lineHeight: 20 }]}>{d.history}</Text> : null}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.neutral[50] },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    empty: { textAlign: 'center', color: c.neutral[600], padding: spacing.xl },
    card: { marginHorizontal: spacing.md, marginBottom: spacing.md, borderRadius: radius.lg, backgroundColor: c.light, borderWidth: 1, borderColor: c.neutral[200], overflow: 'hidden' },
    cover: { width: '100%', height: 150 },
    body: { padding: spacing.md, gap: 2 },
    title: { fontSize: typography.fontSize.base, fontWeight: '800', color: c.dark },
    meta: { fontSize: typography.fontSize.sm, color: c.neutral[600] },
  });
}
