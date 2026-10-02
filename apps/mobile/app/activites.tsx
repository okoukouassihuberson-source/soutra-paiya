import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { spacing, ACTIVITY_CATEGORIES, type ColorPalette } from '@soutra/shared';
import { useColors } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';
import { ScreenHeader } from '@/components/ScreenHeader';
import { FilterBar, TourismCard } from '@/components/tourism/TourismUi';
import { listActivities, type ActivityCard } from '@/lib/tourism';

/** /activites — activités touristiques à réserver. */
export default function ActivitiesScreen() {
  const router = useRouter();
  const c = useColors();
  const { t, tdyn, fmtDuration, field } = useI18n();
  const s = useMemo(() => makeStyles(c), [c]);
  const [items, setItems] = useState<ActivityCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [q, setQ] = useState('');
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [dq, setDq] = useState('');
  useEffect(() => { const t = setTimeout(() => setDq(q), 400); return () => clearTimeout(t); }, [q]);

  const load = useCallback(async () => {
    setError(false);
    try { setItems(await listActivities({ q: dq, maxPrice, category })); } catch { setItems([]); setError(true); }
    setLoading(false); setRefreshing(false);
  }, [dq, maxPrice, category]);
  useEffect(() => { load(); }, [load]);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader title={t('acts.title')} subtitle={t('acts.subtitle')} />
      <FilterBar q={q} onQ={setQ} maxPrice={maxPrice} onMaxPrice={setMaxPrice} category={category} onCategory={setCategory}
                 categories={ACTIVITY_CATEGORIES.map((k) => ({ key: k.key, label: `${k.emoji} ${tdyn('cat', k.key, k.label)}` }))} />
      {loading ? <View style={s.center}><ActivityIndicator color={c.primary[500]} /></View> : (
        <ScrollView contentContainerStyle={{ paddingVertical: spacing.md, paddingBottom: spacing['2xl'] }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
          {error && <Text style={s.empty}>{t('acts.error')}</Text>}
          {!error && items.length === 0 && <Text style={s.empty}>{t('acts.empty')}</Text>}
          {items.map((a) => (
            <TourismCard key={a.id} title={field(a as any, 'title') ?? a.title} cover={a.cover_url} subtitle={[tdyn('cat', a.category, t('cat.fallback')), a.city].filter(Boolean).join(' · ')}
              meta={`${fmtDuration(a.duration_minutes)}${a.rating_count > 0 ? ` · ★ ${Number(a.rating_avg).toFixed(1)} (${a.rating_count})` : ''}`}
              price={a.price_xof} onPress={() => router.push({ pathname: '/activite/[slug]', params: { slug: a.slug } })} />
          ))}
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
  });
}
