import { useCallback, useState } from 'react';
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
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, radius, spacing, formatXOF } from '@soutra/shared';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

interface SplitRow {
  id: string;
  title: string | null;
  total_xof: number;
  created_at: string;
  payment_requests: { status: string }[];
}

export default function Splits() {
  const router = useRouter();
  const { user } = useAuth();
  const userId = user?.id;

  const [splits, setSplits] = useState<SplitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await (supabase as any)
        .from('bill_splits')
        .select('id, title, total_xof, created_at, payment_requests(status)')
        .eq('creator_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) {
        console.error('[splits] load:', error);
      } else {
        setSplits((data as SplitRow[]) ?? []);
      }
    } catch (err) {
      console.error('[splits] unexpected:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Pressable hitSlop={10} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color={colors.dark} />
        </Pressable>
        <Text style={s.headerTitle}>Partages d'addition</Text>
        <Pressable hitSlop={10} onPress={() => router.push('/split-create')}>
          <Ionicons name="add-circle" size={28} color={colors.primary[500]} />
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary[500]} style={{ flex: 1 }} />
      ) : (
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
          <Pressable style={s.newBtn} onPress={() => router.push('/split-create')}>
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={s.newBtnText}>Nouveau partage</Text>
          </Pressable>

          {splits.length === 0 ? (
            <View style={s.empty}>
              <Text style={s.emptyText}>Aucun partage pour le moment.</Text>
              <Text style={s.emptyHint}>
                Partage une addition entre amis — chacun reçoit une demande.
              </Text>
            </View>
          ) : (
            splits.map((sp) => {
              const reqs = sp.payment_requests ?? [];
              const paid = reqs.filter((r) => r.status === 'accepted').length;
              return (
                <Pressable
                  key={sp.id}
                  style={({ pressed }) => [s.card, pressed && { opacity: 0.7 }]}
                  onPress={() => router.push({ pathname: '/split', params: { id: sp.id } })}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={s.cardTitle}>{sp.title || 'Partage d\'addition'}</Text>
                    <Text style={s.cardSub}>
                      {paid}/{reqs.length} payé ·{' '}
                      {new Date(sp.created_at).toLocaleDateString('fr-FR')}
                    </Text>
                  </View>
                  <Text style={s.cardAmount}>{formatXOF(sp.total_xof)}</Text>
                  <Ionicons name="chevron-forward" size={20} color={colors.neutral[400]} />
                </Pressable>
              );
            })
          )}
        </ScrollView>
      )}
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
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary[500],
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
  },
  newBtnText: { color: '#fff', fontWeight: '700', fontSize: typography.fontSize.base },
  empty: { padding: spacing.xl, alignItems: 'center', gap: spacing.xs },
  emptyText: { color: colors.neutral[600], fontWeight: '600' },
  emptyHint: {
    color: colors.neutral[500],
    fontSize: typography.fontSize.xs,
    textAlign: 'center',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  cardTitle: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.dark },
  cardSub: { fontSize: typography.fontSize.xs, color: colors.neutral[500], marginTop: 2 },
  cardAmount: { fontSize: typography.fontSize.base, fontWeight: '700', color: colors.dark },
});
