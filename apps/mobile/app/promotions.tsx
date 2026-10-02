import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { spacing, type ColorPalette } from '@soutra/shared';
import { useColors } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';
import { ScreenHeader } from '@/components/ScreenHeader';
import { OfferCardMobile } from '@/components/tourism/TourismUi';
import { listPublicOffers, type Offer } from '@/lib/tourism';

/** /promotions — offres publiques sur les voyages et activités. */
export default function PromotionsScreen() {
  const router = useRouter();
  const c = useColors();
  const { t } = useI18n();
  const s = useMemo(() => makeStyles(c), [c]);
  const [items, setItems] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try { setItems(await listPublicOffers()); } catch { setItems([]); setError(true); }
    setLoading(false); setRefreshing(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader title={t('promos.title')} subtitle={t('promos.subtitle')} />
      {loading ? <View style={s.center}><ActivityIndicator color={c.primary[500]} /></View> : (
        <ScrollView contentContainerStyle={{ paddingVertical: spacing.md, paddingBottom: spacing['2xl'] }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
          {error && <Text style={s.empty}>{t('promos.error')}</Text>}
          {!error && items.length === 0 && <Text style={s.empty}>{t('promos.empty')}</Text>}
          {items.map((o) => (
            <OfferCardMobile key={o.id} offer={o} onPress={o.target_slug
              ? () => router.push(o.target_kind === 'activity' ? { pathname: '/activite/[slug]', params: { slug: o.target_slug! } } : { pathname: '/voyage/[slug]', params: { slug: o.target_slug! } })
              : undefined} />
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
