import { useCallback, useEffect, useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, radius, spacing, formatXOF } from '@soutra/shared';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';

interface SplitRequest {
  id: string;
  payer_id: string;
  amount_xof: number;
  status: string;
  payer: { full_name: string | null } | null;
}
interface Split {
  id: string;
  title: string | null;
  total_xof: number;
  created_at: string;
  payment_requests: SplitRequest[];
}

const STATUS: Record<string, { key: 'paid' | 'pending' | 'declined' | 'cancelled'; color: string }> = {
  accepted: { key: 'paid', color: colors.success },
  pending: { key: 'pending', color: colors.neutral[500] },
  declined: { key: 'declined', color: colors.danger },
  cancelled: { key: 'cancelled', color: colors.neutral[500] },
};

export default function SplitDetail() {
  const { t } = useI18n();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [split, setSplit] = useState<Split | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await (supabase as any)
        .from('bill_splits')
        .select(
          'id, title, total_xof, created_at, payment_requests(id, payer_id, amount_xof, status, payer:profiles!payer_id(full_name))',
        )
        .eq('id', id)
        .maybeSingle();
      if (error) {
        console.error('[split] load:', error);
      } else {
        setSplit(data as Split | null);
      }
    } catch (err) {
      console.error('[split] unexpected:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Temps réel : la liste se met à jour dès qu'un participant paie ou refuse.
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`split-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payment_requests', filter: `split_id=eq.${id}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, load]);

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <ActivityIndicator size="large" color={colors.primary[500]} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  if (!split) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <Pressable hitSlop={10} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={28} color={colors.dark} />
          </Pressable>
          <Text style={s.headerTitle}>{t('splitView.title')}</Text>
          <View style={{ width: 28 }} />
        </View>
        <View style={s.center}>
          <Text style={s.emptyText}>{t('splitView.notFound')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const reqs = split.payment_requests ?? [];
  const paid = reqs.filter((r) => r.status === 'accepted');
  const collected = paid.reduce((sum, r) => sum + r.amount_xof, 0);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Pressable hitSlop={10} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color={colors.dark} />
        </Pressable>
        <Text style={s.headerTitle}>{t('splitView.tracking')}</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['2xl'] }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
          />
        }
      >
        <View style={s.summaryCard}>
          <Text style={s.splitTitle}>{split.title || t('splitView.defaultTitle')}</Text>
          <Text style={s.splitTotal}>{formatXOF(split.total_xof)}</Text>
          <View style={s.progressLine}>
            <Text style={s.progressText}>
              {t('splitView.paidOf', { paid: paid.length, total: reqs.length })}
            </Text>
            <Text style={s.collected}>{t('splitView.collected', { amount: formatXOF(collected) })}</Text>
          </View>
          <View style={s.barTrack}>
            <View
              style={[
                s.barFill,
                { width: `${reqs.length ? (paid.length / reqs.length) * 100 : 0}%` },
              ]}
            />
          </View>
        </View>

        <Text style={s.section}>{t('splitView.participants')}</Text>
        {reqs.map((r) => {
          const st = STATUS[r.status] ?? STATUS.pending;
          return (
            <View key={r.id} style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.rowName}>{r.payer?.full_name || t('splitView.participant')}</Text>
                <Text style={[s.rowStatus, { color: st.color }]}>{t(`splitView.${st.key}` as const)}</Text>
              </View>
              <Text style={s.rowAmount}>{formatXOF(r.amount_xof)}</Text>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.light },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.base,
  },
  headerTitle: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.dark },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: colors.neutral[500] },
  summaryCard: {
    backgroundColor: colors.primary[500],
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  splitTitle: { color: '#fff', opacity: 0.9, fontSize: typography.fontSize.sm },
  splitTotal: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  progressLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  progressText: { color: '#fff', fontWeight: '600', fontSize: typography.fontSize.sm },
  collected: { color: '#fff', opacity: 0.9, fontSize: typography.fontSize.sm },
  barTrack: {
    marginTop: spacing.sm,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.3)',
    overflow: 'hidden',
  },
  barFill: { height: 8, borderRadius: radius.full, backgroundColor: '#fff' },
  section: {
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    fontSize: typography.fontSize.base,
    fontWeight: '700',
    color: colors.dark,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  rowName: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.dark },
  rowStatus: { fontSize: typography.fontSize.xs, fontWeight: '600', marginTop: 2 },
  rowAmount: { fontSize: typography.fontSize.base, fontWeight: '700', color: colors.dark },
});
