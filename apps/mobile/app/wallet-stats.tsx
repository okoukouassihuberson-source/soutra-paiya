import { useCallback, useMemo, useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  Pressable,
  StyleSheet,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { typography, radius, spacing, formatXOF, type ColorPalette } from '@soutra/shared';
import { useColors } from '@/lib/theme';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Skeleton } from '@/components/Skeleton';
import {
  getWalletStats,
  typeBucketDirection,
  typeBucketLabel,
  type StatsPeriod,
  type WalletStats,
  type StatsCounterparty,
} from '@/lib/wallet-stats';

const PERIODS: { value: StatsPeriod; label: string }[] = [
  { value: '7d', label: '7 j' },
  { value: '30d', label: '30 j' },
  { value: '90d', label: '90 j' },
  { value: '1y', label: '1 an' },
  { value: 'all', label: 'Tout' },
];

export default function WalletStatsScreen() {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const [period, setPeriod] = useState<StatsPeriod>('30d');
  const [stats, setStats] = useState<WalletStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (p: StatsPeriod) => {
    try {
      const data = await getWalletStats(p);
      setStats(data);
    } catch (err: any) {
      console.error('[wallet-stats] load:', err);
      Alert.alert('Erreur', err?.message ?? 'Impossible de charger les statistiques.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(period); }, [load, period]));

  const onPickPeriod = (p: StatsPeriod) => {
    if (p === period) return;
    setPeriod(p);
    setLoading(true);
  };

  const onRefresh = () => { setRefreshing(true); load(period); };

  const empty = stats && stats.kpi.count === 0;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader title="Statistiques" subtitle="Tes flux Soutra-Pay en un coup d'œil" />

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['2xl'] }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Sélecteur de période */}
        <View style={s.periodRow}>
          {PERIODS.map((p) => {
            const active = p.value === period;
            return (
              <Pressable
                key={p.value}
                onPress={() => onPickPeriod(p.value)}
                style={({ pressed }) => [
                  s.periodChip,
                  active && { backgroundColor: c.primary[500], borderColor: c.primary[500] },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text style={[s.periodChipText, active && { color: '#fff' }]}>{p.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {loading ? (
          <View>
            <View style={s.kpiRow}>
              {[0, 1].map((i) => (
                <Skeleton key={i} width="48%" height={92} borderRadius={16} />
              ))}
            </View>
            <View style={{ height: spacing.lg }} />
            <Skeleton width="100%" height={200} borderRadius={16} />
            <View style={{ height: spacing.lg }} />
            <Skeleton width="100%" height={180} borderRadius={16} />
          </View>
        ) : empty ? (
          <View style={s.empty}>
            <View style={s.emptyIconWrap}>
              <Ionicons name="bar-chart-outline" size={36} color={c.primary[400]} />
            </View>
            <Text style={s.emptyTitle}>Pas de données sur cette période</Text>
            <Text style={s.emptyText}>
              Effectue ton premier paiement ou transfert Soutra-Pay pour voir tes statistiques apparaître ici.
            </Text>
          </View>
        ) : stats ? (
          <>
            <Text style={s.periodHint}>{stats.kpi.period_label}</Text>

            {/* KPI cards */}
            <View style={s.kpiRow}>
              <KpiCard
                c={c}
                label="Entrées"
                value={formatXOF(stats.kpi.in_xof)}
                icon="arrow-down-circle"
                color={c.success}
                bg="#dcfce7"
              />
              <KpiCard
                c={c}
                label="Sorties"
                value={formatXOF(stats.kpi.out_xof)}
                icon="arrow-up-circle"
                color={c.danger}
                bg="#fee2e2"
              />
            </View>
            <View style={s.kpiRow}>
              <KpiCard
                c={c}
                label="Net"
                value={(stats.kpi.net_xof >= 0 ? '+' : '−') + formatXOF(Math.abs(stats.kpi.net_xof))}
                icon="trending-up"
                color={stats.kpi.net_xof >= 0 ? c.success : c.danger}
                bg={stats.kpi.net_xof >= 0 ? '#dcfce7' : '#fee2e2'}
              />
              <KpiCard
                c={c}
                label="Transactions"
                value={stats.kpi.count.toLocaleString('fr-FR')}
                icon="receipt"
                color={c.primary[600]}
                bg={c.primary[50]}
              />
            </View>

            {/* Bar chart — évolution journalière */}
            <SectionTitle c={c} title="Évolution des flux" />
            <View style={s.chartCard}>
              <DailyBarChart c={c} data={stats.daily} />
              <View style={s.legendRow}>
                <Legend c={c} color={c.success} label="Entrées" />
                <Legend c={c} color={c.primary[500]} label="Sorties" />
              </View>
            </View>

            {/* By type — répartition */}
            <SectionTitle c={c} title="Répartition par type" />
            <View style={s.listCard}>
              {stats.by_type.length === 0 ? (
                <Text style={s.emptyInline}>Aucune transaction sur la période.</Text>
              ) : (
                stats.by_type.map((b) => {
                  const total = b.in_xof + b.out_xof;
                  const dir = typeBucketDirection(b.type);
                  const color = dir === 'in' ? c.success : c.primary[500];
                  const max = Math.max(...stats.by_type.map((x) => x.in_xof + x.out_xof));
                  const pct = max > 0 ? (total / max) * 100 : 0;
                  return (
                    <View key={b.type} style={s.byTypeRow}>
                      <View style={s.byTypeHeader}>
                        <Text style={s.byTypeLabel}>{typeBucketLabel(b.type)}</Text>
                        <Text style={[s.byTypeAmount, { color }]}>
                          {dir === 'in' ? '+' : '−'}{formatXOF(total)}
                        </Text>
                      </View>
                      <View style={s.barTrack}>
                        <View style={[s.barFill, { width: `${Math.max(pct, 2)}%`, backgroundColor: color }]} />
                      </View>
                      <Text style={s.byTypeCount}>{b.count} opération{b.count > 1 ? 's' : ''}</Text>
                    </View>
                  );
                })
              )}
            </View>

            {/* Top counterparties */}
            <SectionTitle c={c} title="Top bénéficiaires" />
            <View style={s.listCard}>
              {stats.top_counterparties.length === 0 ? (
                <Text style={s.emptyInline}>Aucun échange P2P sur la période.</Text>
              ) : (
                stats.top_counterparties.map((cp, i) => <CounterpartyRow key={cp.user_id} c={c} cp={cp} rank={i + 1} />)
              )}
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionTitle({ c, title }: { c: ColorPalette; title: string }) {
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <View style={s.sectionTitleRow}>
      <View style={s.sectionAccent} />
      <Text style={s.sectionTitle}>{title}</Text>
    </View>
  );
}

function KpiCard({
  c, label, value, icon, color, bg,
}: {
  c: ColorPalette;
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
}) {
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <View style={s.kpiCard}>
      <View style={[s.kpiIcon, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={s.kpiLabel}>{label}</Text>
      <Text style={s.kpiValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{value}</Text>
    </View>
  );
}

function Legend({ c, color, label }: { c: ColorPalette; color: string; label: string }) {
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <View style={s.legendItem}>
      <View style={[s.legendDot, { backgroundColor: color }]} />
      <Text style={s.legendLabel}>{label}</Text>
    </View>
  );
}

function DailyBarChart({
  c,
  data,
}: {
  c: ColorPalette;
  data: { day: string; in_xof: number; out_xof: number }[];
}) {
  const s = useMemo(() => makeStyles(c), [c]);
  // On regroupe par semaine si > 30 jours pour rester lisible.
  const series = useMemo(() => groupSeriesForChart(data), [data]);
  const max = Math.max(1, ...series.map((d) => Math.max(d.in_xof, d.out_xof)));
  if (series.length === 0 || max === 0) {
    return <Text style={s.emptyInline}>Aucune donnée à afficher.</Text>;
  }
  return (
    <View>
      <View style={s.chartArea}>
        {series.map((d, i) => {
          const hIn = (d.in_xof / max) * 110;
          const hOut = (d.out_xof / max) * 110;
          return (
            <View key={d.day + i} style={s.barCol}>
              <View style={s.barColInner}>
                <View style={[s.bar, { height: hIn, backgroundColor: c.success }]} />
                <View style={[s.bar, { height: hOut, backgroundColor: c.primary[500] }]} />
              </View>
              <Text style={s.barLabel}>{d.label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function CounterpartyRow({
  c, cp, rank,
}: {
  c: ColorPalette;
  cp: StatsCounterparty;
  rank: number;
}) {
  const s = useMemo(() => makeStyles(c), [c]);
  const name = cp.full_name || cp.phone || 'Bénéficiaire';
  const initial = name.trim().charAt(0).toUpperCase();
  return (
    <View style={s.cpRow}>
      <Text style={s.cpRank}>#{rank}</Text>
      <View style={s.cpAvatar}>
        <Text style={s.cpAvatarText}>{initial}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.cpName} numberOfLines={1}>{name}</Text>
        <Text style={s.cpMeta}>
          {cp.count} échange{cp.count > 1 ? 's' : ''}
          {cp.phone ? ` · ${cp.phone}` : ''}
        </Text>
      </View>
      <Text style={s.cpAmount}>{formatXOF(cp.total_xof)}</Text>
    </View>
  );
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
function groupSeriesForChart(daily: { day: string; in_xof: number; out_xof: number }[]) {
  // < 35 jours : on garde tous les jours, label = "12/05"
  // sinon : regroupement par semaine ISO, label = "S20"
  if (daily.length <= 35) {
    return daily.map((d) => ({
      ...d,
      label: formatShortDate(d.day),
    }));
  }
  const byWeek = new Map<string, { day: string; in_xof: number; out_xof: number; label: string }>();
  for (const d of daily) {
    const date = new Date(d.day);
    const wk = isoWeek(date);
    const key = `${date.getUTCFullYear()}-W${wk}`;
    const cur = byWeek.get(key);
    if (cur) {
      cur.in_xof += d.in_xof;
      cur.out_xof += d.out_xof;
    } else {
      byWeek.set(key, { day: key, in_xof: d.in_xof, out_xof: d.out_xof, label: `S${wk}` });
    }
  }
  return Array.from(byWeek.values());
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.light },

    periodRow: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md },
    periodChip: {
      flex: 1,
      paddingVertical: spacing.sm,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: c.neutral[200],
      alignItems: 'center',
      backgroundColor: c.neutral[50],
    },
    periodChipText: { fontSize: typography.fontSize.xs, fontWeight: '700', color: c.dark },

    periodHint: { fontSize: typography.fontSize.xs, color: c.neutral[500], fontWeight: '600', marginBottom: spacing.md, textTransform: 'uppercase', letterSpacing: 0.3 },

    kpiRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
    kpiCard: {
      flex: 1,
      backgroundColor: c.neutral[50],
      borderRadius: radius.lg,
      borderWidth: 1, borderColor: c.neutral[100],
      padding: spacing.md,
    },
    kpiIcon: {
      width: 36, height: 36, borderRadius: 18,
      alignItems: 'center', justifyContent: 'center',
      marginBottom: spacing.sm,
    },
    kpiLabel: { fontSize: typography.fontSize.xs, color: c.neutral[500], fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
    kpiValue: { fontSize: typography.fontSize.lg, fontWeight: '700', color: c.dark, marginTop: 2 },

    sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xl, marginBottom: spacing.sm },
    sectionAccent: { width: 4, height: 18, borderRadius: 2, backgroundColor: c.primary[500] },
    sectionTitle: { flex: 1, fontSize: typography.fontSize.lg, fontWeight: '700', color: c.dark },

    chartCard: {
      backgroundColor: c.neutral[50],
      borderRadius: radius.lg,
      borderWidth: 1, borderColor: c.neutral[100],
      padding: spacing.md,
    },
    chartArea: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      height: 140,
      gap: 4,
      paddingTop: spacing.xs,
    },
    barCol: { flex: 1, alignItems: 'center' },
    barColInner: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 2,
      height: 110,
    },
    bar: { width: 6, borderRadius: 3, minHeight: 2 },
    barLabel: { fontSize: 9, color: c.neutral[500], marginTop: 4, fontWeight: '600' },

    legendRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm, justifyContent: 'center' },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    legendDot: { width: 10, height: 10, borderRadius: 5 },
    legendLabel: { fontSize: typography.fontSize.xs, color: c.neutral[600], fontWeight: '600' },

    listCard: {
      backgroundColor: c.neutral[50],
      borderRadius: radius.lg,
      borderWidth: 1, borderColor: c.neutral[100],
      padding: spacing.md,
    },
    byTypeRow: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: c.neutral[100] },
    byTypeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    byTypeLabel: { fontSize: typography.fontSize.sm, fontWeight: '700', color: c.dark },
    byTypeAmount: { fontSize: typography.fontSize.sm, fontWeight: '700' },
    barTrack: { height: 8, borderRadius: 4, backgroundColor: c.neutral[100], overflow: 'hidden' },
    barFill: { height: '100%', borderRadius: 4 },
    byTypeCount: { fontSize: typography.fontSize.xs, color: c.neutral[500], marginTop: 4, fontWeight: '600' },

    cpRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: c.neutral[100] },
    cpRank: { fontSize: typography.fontSize.sm, fontWeight: '700', color: c.primary[600], minWidth: 28 },
    cpAvatar: {
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: c.primary[100],
      alignItems: 'center', justifyContent: 'center',
    },
    cpAvatarText: { color: c.primary[700], fontWeight: '700' },
    cpName: { fontSize: typography.fontSize.sm, fontWeight: '700', color: c.dark },
    cpMeta: { fontSize: typography.fontSize.xs, color: c.neutral[500], marginTop: 2 },
    cpAmount: { fontSize: typography.fontSize.sm, fontWeight: '700', color: c.dark },

    empty: { padding: spacing.xl, alignItems: 'center' },
    emptyIconWrap: {
      width: 80, height: 80, borderRadius: 40,
      backgroundColor: c.primary[50],
      alignItems: 'center', justifyContent: 'center',
      marginBottom: spacing.md,
    },
    emptyTitle: { fontSize: typography.fontSize.base, fontWeight: '700', color: c.dark, marginBottom: spacing.xs },
    emptyText: { fontSize: typography.fontSize.sm, color: c.neutral[500], textAlign: 'center', maxWidth: 320, lineHeight: 20 },
    emptyInline: { fontSize: typography.fontSize.sm, color: c.neutral[500], textAlign: 'center', padding: spacing.md },
  });
}
