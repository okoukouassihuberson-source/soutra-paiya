import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { radius, spacing, typography, seatsLeft, formatTripDates, type ColorPalette, type TripScope } from '@soutra/shared';
import { useColors } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';
import { ScreenHeader } from '@/components/ScreenHeader';
import { FilterBar, TourismCard } from '@/components/tourism/TourismUi';
import { listTrips, type TripCard } from '@/lib/tourism';

/** /voyages — voyages de groupe nationaux et internationaux. */
export default function VoyagesScreen() {
  const router = useRouter();
  const c = useColors();
  const { t, tn, intl, field } = useI18n();
  const s = useMemo(() => makeStyles(c), [c]);
  const [scope, setScope] = useState<TripScope>('national');
  const [items, setItems] = useState<TripCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [q, setQ] = useState('');
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [dq, setDq] = useState('');
  useEffect(() => { const t = setTimeout(() => setDq(q), 400); return () => clearTimeout(t); }, [q]);

  const load = useCallback(async () => {
    setError(false);
    try { setItems(await listTrips(scope, { q: dq, maxPrice })); } catch { setItems([]); setError(true); }
    setLoading(false); setRefreshing(false);
  }, [scope, dq, maxPrice]);
  useEffect(() => { setLoading(true); load(); }, [load]);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader title={t('trips.title')} subtitle={t('trips.subtitle')} />
      <View style={s.tabs}>
        {(['national', 'international'] as const).map((k) => (
          <Pressable key={k} onPress={() => setScope(k)} style={[s.tab, scope === k && s.tabOn]} accessibilityRole="tab" accessibilityState={{ selected: scope === k }}>
            <Text style={[s.tabText, scope === k && { color: '#fff' }]}>{t(k === 'national' ? 'trips.national' : 'trips.international')}</Text>
          </Pressable>
        ))}
      </View>
      <FilterBar q={q} onQ={setQ} maxPrice={maxPrice} onMaxPrice={setMaxPrice} />
      {loading ? <View style={s.center}><ActivityIndicator color={c.primary[500]} /></View> : (
        <ScrollView contentContainerStyle={{ paddingBottom: spacing['2xl'] }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
          {error && <Text style={s.empty}>{t('trips.error')}</Text>}
          {!error && items.length === 0 && <Text style={s.empty}>{t('trips.empty')}</Text>}
          {items.map((trip) => {
            const left = seatsLeft(trip);
            return (
              <TourismCard key={trip.id} title={field(trip as any, 'title') ?? trip.title} cover={trip.cover_url} badge={trip.highlight === 'promotion' ? t('trips.promoBadge') : null}
                subtitle={[trip.city, trip.scope === 'national' ? t('trips.country') : trip.country].filter(Boolean).join(' · ')}
                meta={`${formatTripDates(trip.starts_on, trip.ends_on, intl)} · ${left === 0 ? t('trips.full') : tn('trips.seats', left)}`}
                price={trip.base_price_xof} onPress={() => router.push({ pathname: '/voyage/[slug]', params: { slug: trip.slug } })} />
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
    tabs: { flexDirection: 'row', gap: 8, padding: spacing.md },
    tab: { flex: 1, paddingVertical: 10, borderRadius: radius.full ?? 99, borderWidth: 1, borderColor: c.neutral[300], alignItems: 'center' },
    tabOn: { backgroundColor: c.primary[500], borderColor: c.primary[500] },
    tabText: { fontWeight: '800', color: c.neutral[700], fontSize: typography.fontSize.sm },
    empty: { textAlign: 'center', color: c.neutral[600], padding: spacing.xl },
  });
}
