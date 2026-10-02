// ============================================================================
// Espace gérant — vue mobile des revenus du venue propriétaire.
//
// Réutilise les RPCs de la migration 0043 (assert_venue_owner_or_admin).
// L'utilisateur sélectionne un venue qu'il possède puis voit ses KPIs +
// timeline + breakdown par source.
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ScrollView, View, Text, Pressable, StyleSheet,
  ActivityIndicator, RefreshControl, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { typography, radius, spacing, formatXOF, VENUE_CATEGORIES, type ColorPalette } from '@soutra/shared';
import { useColors } from '@/lib/theme';
import { useAuth } from '@/lib/auth-context';
import { useI18n, type TKey } from '@/lib/i18n';
import {
  listMyProVenues, getProRevenueSummary, getProRevenueByKind,
  getProRevenueTimeline, listProRevenueEvents,
  PRO_KIND_META,
  type ProVenue, type ProSummary, type ProByKind, type ProTimelineRow, type ProEventRow,
} from '@/lib/pro-revenue';
import { getVenuePayableBalance, type VenuePayoutBalance } from '@/lib/venue-payout';
import { exportRevenuePdf } from '@/lib/revenue-pdf';

const PERIODS: { id: string; days: number }[] = [
  { id: '7d', days: 7 },
  { id: '30d', days: 30 },
  { id: '90d', days: 90 },
];

const VENUE_CAT_KEYS = new Set<string>(VENUE_CATEGORIES.map((m) => m.value));
const KIND_KEYS = Object.fromEntries(Object.keys(PRO_KIND_META).map((k) => [k, true]));

export default function ProDashboard() {
  const { t, tn, intl } = useI18n();
  const router = useRouter();
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const { user } = useAuth();

  const [venues, setVenues] = useState<ProVenue[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const [period, setPeriod] = useState('30d');
  const [summary, setSummary] = useState<ProSummary | null>(null);
  const [byKind, setByKind] = useState<ProByKind[]>([]);
  const [timeline, setTimeline] = useState<ProTimelineRow[]>([]);
  const [events, setEvents] = useState<ProEventRow[]>([]);
  const [payable, setPayable] = useState<VenuePayoutBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showEvents, setShowEvents] = useState(false);
  const [exporting, setExporting] = useState(false);

  const selectedVenue = venues.find((v) => v.id === selectedVenueId) ?? null;
  const kindLabel = (kind: string, fallback: string) => (kind in KIND_KEYS ? t(`proKind.${kind}` as TKey) : fallback);

  const handleExportPdf = async () => {
    if (!summary || !selectedVenue) return;
    setExporting(true);
    try {
      const periodLabel = t('pro.days', { n: PERIODS.find((p) => p.id === period)?.days ?? 30 });
      await exportRevenuePdf({
        venue: {
          name: selectedVenue.name,
          category: selectedVenue.category,
          city: selectedVenue.city,
          district: selectedVenue.district,
        },
        summary,
        byKind,
        events: events.map((e) => ({ ts: e.ts, kind: e.kind, amount_xof: e.amount_xof, rule_name: e.rule_name })),
        periodLabel,
      });
    } finally {
      setExporting(false);
    }
  };

  // Chargement initial : récupère les venues du gérant.
  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    let active = true;
    (async () => {
      try {
        const list = await listMyProVenues();
        if (!active) return;
        setVenues(list);
        if (list.length > 0) setSelectedVenueId(list[0].id);
        else setLoading(false);
      } catch (err) {
        console.warn('[pro] list venues', err);
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [user?.id]);

  const loadRevenue = useCallback(async (venueId: string) => {
    const days = PERIODS.find((p) => p.id === period)?.days ?? 30;
    try {
      const [sum, kind, tl, evs, payableRes] = await Promise.all([
        getProRevenueSummary(venueId, days),
        getProRevenueByKind(venueId, days),
        getProRevenueTimeline(venueId, days),
        listProRevenueEvents(venueId, 20),
        getVenuePayableBalance(venueId).catch(() => null),
      ]);
      setSummary(sum);
      setByKind(kind);
      setTimeline(tl);
      setEvents(evs);
      setPayable(payableRes);
    } catch (err) {
      console.warn('[pro] load revenue', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period]);

  useEffect(() => {
    if (selectedVenueId) {
      setLoading(true);
      void loadRevenue(selectedVenueId);
    }
  }, [selectedVenueId, loadRevenue]);

  const onRefresh = () => {
    if (!selectedVenueId) return;
    setRefreshing(true);
    void loadRevenue(selectedVenueId);
  };

  const maxGross = useMemo(
    () => Math.max(1, ...timeline.map((t) => t.gross_xof)),
    [timeline],
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Si user non connecté
  // ───────────────────────────────────────────────────────────────────────────
  if (!user?.id) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={s.header}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="chevron-back" size={26} color={c.dark} />
          </Pressable>
          <Text style={s.headerTitle}>{t('pro.title')}</Text>
          <View style={{ width: 26 }} />
        </View>
        <View style={s.center}>
          <Ionicons name="lock-closed" size={48} color={c.neutral[300]} />
          <Text style={s.emptyTitle}>{t('pro.loginTitle')}</Text>
          <Text style={s.emptySub}>{t('pro.loginBody')}</Text>
          <Pressable onPress={() => router.push('/(auth)/login' as any)} style={[s.primaryBtn, { marginTop: spacing.lg }]}>
            <Text style={s.primaryBtnText}>{t('pro.signIn')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Si user connecté mais aucun venue
  // ───────────────────────────────────────────────────────────────────────────
  if (!loading && venues.length === 0) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={s.header}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="chevron-back" size={26} color={c.dark} />
          </Pressable>
          <Text style={s.headerTitle}>{t('pro.title')}</Text>
          <View style={{ width: 26 }} />
        </View>
        <View style={s.center}>
          <Ionicons name="storefront-outline" size={48} color={c.neutral[300]} />
          <Text style={s.emptyTitle}>{t('pro.noneTitle')}</Text>
          <Text style={s.emptySub}>
            {t('pro.noneBody')}
          </Text>
          <Pressable onPress={() => router.push('/pro-create' as any)} style={[s.primaryBtn, { marginTop: spacing.lg }]}>
            <Text style={s.primaryBtnText}>{t('pro.create')}</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/(tabs)/explore')} style={{ marginTop: spacing.md }}>
            <Text style={s.linkText}>{t('pro.explore')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={c.dark} />
        </Pressable>
        <Text style={s.headerTitle}>{t('pro.title')}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Pressable
            onPress={() => router.push(`/pro-manage?venueId=${selectedVenueId}` as any)}
            hitSlop={10}
            accessibilityLabel={t('pro.manageA11y')}
          >
            <Ionicons name="create-outline" size={24} color={c.primary[500]} />
          </Pressable>
          <Pressable
            onPress={handleExportPdf}
            disabled={exporting || !summary}
            hitSlop={10}
            accessibilityLabel="Exporter en PDF"
            style={{ opacity: summary && !exporting ? 1 : 0.3 }}
          >
            {exporting
              ? <ActivityIndicator size="small" color={c.primary[500]} />
              : <Ionicons name="document-text-outline" size={24} color={c.primary[500]} />}
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary[500]} />}
      >
        {/* Sélecteur de venue (horizontal scroll si > 1) */}
        {venues.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.md }}
          >
            {venues.map((v) => {
              const active = v.id === selectedVenueId;
              return (
                <Pressable
                  key={v.id}
                  onPress={() => setSelectedVenueId(v.id)}
                  style={[s.venueChip, active && s.venueChipActive]}
                >
                  {v.cover_url ? (
                    <Image source={{ uri: v.cover_url }} style={s.venueChipImg} />
                  ) : (
                    <View style={[s.venueChipImg, { backgroundColor: c.neutral[200], alignItems: 'center', justifyContent: 'center' }]}>
                      <Ionicons name="storefront" size={16} color={c.neutral[500]} />
                    </View>
                  )}
                  <Text style={[s.venueChipText, active && { color: '#fff' }]} numberOfLines={1}>
                    {v.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {/* Header avec nom du venue sélectionné */}
        {selectedVenue && (
          <View style={s.venueHeader}>
            <Text style={s.venueName}>{selectedVenue.name}</Text>
            <Text style={s.venueSub}>
              {VENUE_CAT_KEYS.has(selectedVenue.category) ? t(`venueCat.${selectedVenue.category}` as TKey) : selectedVenue.category}
              {' · '}
              {selectedVenue.city}
            </Text>
          </View>
        )}

        {/* Period filter */}
        <View style={s.periodRow}>
          {PERIODS.map((p) => {
            const active = period === p.id;
            return (
              <Pressable
                key={p.id}
                onPress={() => setPeriod(p.id)}
                style={[s.periodChip, active && s.periodChipActive]}
              >
                <Text style={[s.periodText, active && { color: '#fff' }]}>{t('pro.days', { n: p.days })}</Text>
              </Pressable>
            );
          })}
        </View>

        {loading && !summary ? (
          <View style={{ paddingVertical: spacing.xl, alignItems: 'center' }}>
            <ActivityIndicator color={c.primary[500]} />
          </View>
        ) : (
          <>
            {/* KPIs 2x2 */}
            <View style={s.kpiGrid}>
              <KpiCard
                label={t('pro.gross')}
                value={summary ? formatXOF(summary.gross_xof) : '—'}
                sub={t('pro.grossSub')}
                emoji="📈"
                tone="blue"
                colors={c}
                styles={s}
              />
              <KpiCard
                label={t('pro.commission')}
                value={summary ? formatXOF(summary.commission_xof) : '—'}
                sub={summary ? t('pro.commissionSub', { pct: summary.commission_rate_pct }) : ''}
                emoji="🏷️"
                tone="amber"
                colors={c}
                styles={s}
              />
              <KpiCard
                label={t('pro.net')}
                value={summary ? formatXOF(summary.net_xof) : '—'}
                sub={
                  payable
                    ? t('pro.netWithdraw', { amount: formatXOF(payable.payable_xof) })
                    : t('pro.netSub')
                }
                emoji="💰"
                tone="emerald"
                colors={c}
                styles={s}
              />
              <KpiCard
                label={t('pro.billable')}
                value={summary ? formatXOF(summary.billable_xof) : '—'}
                sub={t('pro.billableSub')}
                emoji="🧾"
                tone="purple"
                colors={c}
                styles={s}
              />
            </View>

            {/* CTA Retirer mes revenus — visible dès qu'il y a du solde retirable */}
            {selectedVenueId && payable && payable.payable_xof > 0 && (
              <Pressable
                onPress={() => router.push(`/venue-payout?venueId=${selectedVenueId}` as any)}
                style={({ pressed }) => [s.payoutCta, pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] }]}
                accessibilityLabel={t('pro.withdraw')}
              >
                <View style={s.payoutCtaIcon}>
                  <Ionicons name="arrow-down-circle" size={20} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.payoutCtaTitle}>{t('pro.withdraw')}</Text>
                  <Text style={s.payoutCtaSub}>
                    {t('pro.available', { amount: formatXOF(payable.payable_xof) })}
                    {payable.pending_xof > 0 ? t('pro.inProgress', { amount: formatXOF(payable.pending_xof) }) : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#fff" />
              </Pressable>
            )}

            {/* Variation badge */}
            {summary?.delta_pct != null && (
              <View
                style={[
                  s.deltaBadge,
                  {
                    backgroundColor: summary.delta_pct >= 0 ? c.primary[50] : '#FEE2E2',
                    borderColor: summary.delta_pct >= 0 ? c.primary[200] : '#FCA5A5',
                  },
                ]}
              >
                <Text style={{ fontSize: 16 }}>{summary.delta_pct >= 0 ? '📈' : '📉'}</Text>
                <Text
                  style={[
                    s.deltaText,
                    { color: summary.delta_pct >= 0 ? c.primary[700] : '#B91C1C' },
                  ]}
                >
                  {t('pro.delta', { pct: `${summary.delta_pct > 0 ? '+' : ''}${summary.delta_pct}` })}
                </Text>
              </View>
            )}

            {/* Timeline brut vs net */}
            {timeline.length > 0 && (
              <View style={s.card}>
                <Text style={s.cardTitle}>{t('pro.chart')}</Text>
                <View style={s.chartRow}>
                  {timeline.map((row, i) => {
                    const grossH = Math.max(4, (row.gross_xof / maxGross) * 100);
                    const netH = Math.max(2, (row.net_xof / maxGross) * 100);
                    return (
                      <View key={i} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end' }}>
                        <View style={{ width: '100%', height: 100, justifyContent: 'flex-end' }}>
                          <View
                            style={{
                              position: 'absolute',
                              left: 0, right: 0, bottom: 0,
                              height: `${grossH}%`,
                              backgroundColor: c.primary[100],
                              borderTopLeftRadius: 2,
                              borderTopRightRadius: 2,
                            }}
                          />
                          <View
                            style={{
                              width: '100%',
                              height: `${netH}%`,
                              backgroundColor: c.success,
                              borderTopLeftRadius: 2,
                              borderTopRightRadius: 2,
                            }}
                          />
                        </View>
                      </View>
                    );
                  })}
                </View>
                <View style={s.legendRow}>
                  <View style={s.legendItem}>
                    <View style={[s.legendDot, { backgroundColor: c.primary[100] }]} />
                    <Text style={s.legendText}>{t('pro.legendGross')}</Text>
                  </View>
                  <View style={s.legendItem}>
                    <View style={[s.legendDot, { backgroundColor: c.success }]} />
                    <Text style={s.legendText}>{t('pro.legendNet')}</Text>
                  </View>
                </View>
              </View>
            )}

            {/* Ventilation par source */}
            {byKind.length > 0 && (
              <View style={s.card}>
                <Text style={s.cardTitle}>{t('pro.bySource')}</Text>
                {byKind.map((b) => {
                  const meta = PRO_KIND_META[b.kind] ?? { label: b.kind, emoji: '💼', color: c.neutral[600] };
                  const max = Math.max(1, ...byKind.map((x) => x.total_xof));
                  const pct = (b.total_xof / max) * 100;
                  return (
                    <View key={b.kind} style={{ marginBottom: spacing.md }}>
                      <View style={s.kindRow}>
                        <Text style={s.kindLabel}>
                          {meta.emoji} {kindLabel(b.kind, meta.label)}
                        </Text>
                        <Text style={[s.kindValue, { color: meta.color }]}>
                          {formatXOF(b.total_xof)}
                        </Text>
                      </View>
                      <View style={s.barBg}>
                        <View
                          style={[s.barFill, { width: `${Math.max(2, pct)}%`, backgroundColor: meta.color }]}
                        />
                      </View>
                      <Text style={s.kindCount}>{tn('pro.events', b.event_count)}</Text>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Empty state si rien */}
            {summary && summary.event_count === 0 && (
              <View style={[s.card, { backgroundColor: '#FEF3C7', borderColor: '#FCD34D' }]}>
                <Text style={[s.cardTitle, { color: '#92400E' }]}>{t('pro.emptyTitle')}</Text>
                <Text style={{ fontSize: typography.fontSize.xs, color: '#92400E', lineHeight: 17, marginTop: spacing.xs }}>
                  {t('pro.emptyBody')}
                </Text>
              </View>
            )}

            {/* Détail collapsible */}
            {events.length > 0 && (
              <View style={s.card}>
                <Pressable
                  onPress={() => setShowEvents((v) => !v)}
                  style={s.detailHeader}
                >
                  <Text style={s.cardTitle}>{t('pro.lastLines', { n: events.length })}</Text>
                  <Ionicons
                    name={showEvents ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color={c.neutral[500]}
                  />
                </Pressable>
                {showEvents && (
                  <View style={{ marginTop: spacing.sm }}>
                    {events.map((e) => {
                      const meta = PRO_KIND_META[e.kind] ?? { label: e.kind, emoji: '💼', color: c.neutral[600] };
                      return (
                        <View key={e.id} style={s.eventRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={s.eventLabel}>{meta.emoji} {kindLabel(e.kind, meta.label)}</Text>
                            <Text style={s.eventDate}>
                              {new Date(e.ts).toLocaleString(intl, {
                                day: '2-digit', month: 'short',
                                hour: '2-digit', minute: '2-digit',
                              })}
                              {e.rule_name ? ` · ${e.rule_name}` : ''}
                            </Text>
                          </View>
                          <Text style={[s.eventAmount, { color: meta.color }]}>
                            {formatXOF(e.amount_xof)}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// KPI Card
// ────────────────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, emoji, tone, colors, styles,
}: {
  label: string; value: string; sub: string; emoji: string;
  tone: 'blue' | 'emerald' | 'amber' | 'purple';
  colors: ColorPalette;
  styles: ReturnType<typeof makeStyles>;
}) {
  const toneMap = {
    blue:    { bg: '#DBEAFE', fg: '#1E40AF' },
    emerald: { bg: '#D1FAE5', fg: '#065F46' },
    amber:   { bg: '#FEF3C7', fg: '#92400E' },
    purple:  { bg: '#EDE9FE', fg: '#5B21B6' },
  } as const;
  const c = toneMap[tone];
  return (
    <View style={[styles.kpiCard, { backgroundColor: c.bg }]}>
      <View style={styles.kpiHeader}>
        <Text style={[styles.kpiLabel, { color: c.fg }]}>{label}</Text>
        <Text style={{ fontSize: 18 }}>{emoji}</Text>
      </View>
      <Text style={[styles.kpiValue, { color: c.fg }]}>{value}</Text>
      {sub && <Text style={[styles.kpiSub, { color: c.fg, opacity: 0.7 }]}>{sub}</Text>}
    </View>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.light },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
      borderBottomWidth: 1, borderBottomColor: c.neutral[100],
    },
    headerTitle: { fontSize: typography.fontSize.lg, fontWeight: '700', color: c.dark },

    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
    emptyTitle: { fontSize: typography.fontSize.lg, fontWeight: '700', color: c.dark, marginTop: spacing.md },
    emptySub: { fontSize: typography.fontSize.sm, color: c.neutral[600], textAlign: 'center', marginTop: spacing.sm },
    primaryBtn: {
      backgroundColor: c.primary[500],
      paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
      borderRadius: radius.full,
    },
    primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: typography.fontSize.base },
    linkText: { color: c.primary[600], fontWeight: '600', fontSize: typography.fontSize.sm, textAlign: 'center' },

    // Venue selector
    venueChip: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
      paddingHorizontal: spacing.md, paddingVertical: 8,
      borderRadius: radius.full,
      backgroundColor: c.neutral[100],
      borderWidth: 1, borderColor: c.neutral[200],
    },
    venueChipActive: { backgroundColor: c.primary[500], borderColor: c.primary[500] },
    venueChipImg: { width: 24, height: 24, borderRadius: 12 },
    venueChipText: { fontSize: typography.fontSize.xs, fontWeight: '600', color: c.dark, maxWidth: 120 },

    venueHeader: { marginBottom: spacing.md },
    venueName: { fontSize: typography.fontSize.xl, fontWeight: '700', color: c.dark },
    venueSub: { fontSize: typography.fontSize.xs, color: c.neutral[600], marginTop: 2 },

    // Period filter
    periodRow: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.lg },
    periodChip: {
      paddingHorizontal: spacing.md, paddingVertical: 6,
      borderRadius: radius.full,
      backgroundColor: c.neutral[100],
      borderWidth: 1, borderColor: c.neutral[200],
    },
    periodChipActive: { backgroundColor: c.primary[500], borderColor: c.primary[500] },
    periodText: { fontSize: typography.fontSize.xs, fontWeight: '600', color: c.dark },

    // KPI Grid
    kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
    kpiCard: {
      width: '48%',
      borderRadius: radius.lg,
      padding: spacing.md,
    },
    kpiHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    kpiLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
    kpiValue: { fontSize: typography.fontSize.lg, fontWeight: '700', marginTop: 4 },
    kpiSub: { fontSize: 10, marginTop: 2 },

    // CTA Retirer mes revenus
    payoutCta: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.md,
      backgroundColor: c.primary[500],
      borderRadius: radius.lg,
      paddingHorizontal: spacing.md, paddingVertical: spacing.md,
      marginBottom: spacing.md,
      shadowColor: c.primary[500], shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 3,
    },
    payoutCtaIcon: {
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: 'rgba(255,255,255,0.2)',
      alignItems: 'center', justifyContent: 'center',
    },
    payoutCtaTitle: { fontSize: typography.fontSize.sm, fontWeight: '700', color: '#fff' },
    payoutCtaSub: { fontSize: typography.fontSize.xs, color: 'rgba(255,255,255,0.9)', marginTop: 2 },

    // Delta badge
    deltaBadge: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
      paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
      borderRadius: radius.md,
      borderWidth: 1,
      marginBottom: spacing.md,
    },
    deltaText: { fontSize: typography.fontSize.xs, fontWeight: '600', flex: 1 },

    // Cards
    card: {
      backgroundColor: '#fff',
      borderRadius: radius.lg,
      padding: spacing.md,
      borderWidth: 1, borderColor: c.neutral[100],
      marginBottom: spacing.md,
    },
    cardTitle: { fontSize: typography.fontSize.sm, fontWeight: '700', color: c.dark },

    // Timeline
    chartRow: {
      flexDirection: 'row', alignItems: 'flex-end',
      gap: 2, height: 100,
      marginTop: spacing.md,
    },
    legendRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.md, marginTop: spacing.sm },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
    legendText: { fontSize: 10, color: c.neutral[600] },

    // By kind
    kindRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    kindLabel: { fontSize: typography.fontSize.xs, fontWeight: '600', color: c.dark, flex: 1 },
    kindValue: { fontSize: typography.fontSize.sm, fontWeight: '700' },
    barBg: { height: 6, backgroundColor: c.neutral[100], borderRadius: 3, overflow: 'hidden', marginTop: 6 },
    barFill: { height: '100%', borderRadius: 3 },
    kindCount: { fontSize: 10, color: c.neutral[500], marginTop: 2 },

    // Detail collapsible
    detailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    eventRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingVertical: spacing.sm,
      borderBottomWidth: 1, borderBottomColor: c.neutral[100],
    },
    eventLabel: { fontSize: typography.fontSize.xs, fontWeight: '600', color: c.dark },
    eventDate: { fontSize: 10, color: c.neutral[500], marginTop: 2 },
    eventAmount: { fontSize: typography.fontSize.sm, fontWeight: '700' },
  });
}
