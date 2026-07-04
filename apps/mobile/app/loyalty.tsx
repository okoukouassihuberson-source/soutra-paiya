import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { typography, radius, spacing, formatXOF, type ColorPalette } from '@soutra/shared';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useColors } from '@/lib/theme';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Skeleton } from '@/components/Skeleton';
import { LoyaltyLevelCard } from '@/components/LoyaltyLevelCard';

/**
 * /loyalty — écran fidélité mobile. Remplace /cashback.
 *
 * Source : RPC `get_my_loyalty_stats` + `get_loyalty_leaderboard` (migration
 * 0068) + select direct loyalty_transactions/loyalty_user_missions/
 * loyalty_user_badges/loyalty_rewards. Si les migrations ne sont pas encore
 * appliquées -> fallback gracieux (sections vides, pas de crash).
 */

interface LoyaltyStats {
  ok?: boolean;
  points_balance?: number;
  points_lifetime?: number;
  level?: { code: string; label: string; min_points: number; color: string; emoji: string };
  next_level?: { code: string; label: string; min_points: number; points_remaining: number } | null;
  period_points?: number;
  period_count?: number;
  rank?: number | null;
}

interface LoyaltyTx {
  id: string;
  kind: 'earn' | 'redeem' | 'bonus' | 'adjustment' | 'expire';
  points: number;
  description: string | null;
  created_at: string;
}

interface MissionRow {
  mission_code: string;
  progress: number;
  completed_at: string | null;
  loyalty_missions: { label: string; description: string | null; icon: string | null; points_reward: number; criteria: any } | null;
}

interface BadgeRow {
  badge_code: string;
  earned_at: string;
  loyalty_badges: { label: string; description: string | null; icon: string } | null;
}

interface RewardRow {
  code: string;
  label: string;
  description: string | null;
  points_cost: number;
  stock: number | null;
}

interface LeaderboardRow {
  full_name: string | null;
  points_lifetime: number;
  level_code: string;
  rank: number;
}

export default function LoyaltyScreen() {
  const { user } = useAuth();
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  const [stats, setStats] = useState<LoyaltyStats | null>(null);
  const [history, setHistory] = useState<LoyaltyTx[]>([]);
  const [missions, setMissions] = useState<MissionRow[]>([]);
  const [badges, setBadges] = useState<BadgeRow[]>([]);
  const [rewards, setRewards] = useState<RewardRow[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [redeeming, setRedeeming] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    try {
      const [
        { data: statsData, error: statsErr },
        { data: txs },
        { data: missionRows },
        { data: badgeRows },
        { data: rewardRows },
        { data: leaderboardData },
      ] = await Promise.all([
        (supabase.rpc as any)('get_my_loyalty_stats', { p_window_days: 30 }),
        supabase
          .from('loyalty_transactions')
          .select('id, kind, points, description, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(30),
        supabase
          .from('loyalty_user_missions')
          .select('mission_code, progress, completed_at, loyalty_missions(label, description, icon, points_reward, criteria)')
          .eq('user_id', user.id),
        supabase
          .from('loyalty_user_badges')
          .select('badge_code, earned_at, loyalty_badges(label, description, icon)')
          .eq('user_id', user.id)
          .order('earned_at', { ascending: false }),
        supabase
          .from('loyalty_rewards')
          .select('code, label, description, points_cost, stock')
          .eq('active', true)
          .order('sort_order', { ascending: true }),
        (supabase.rpc as any)('get_loyalty_leaderboard', { p_limit: 10 }),
      ]);

      if (statsErr) {
        console.warn('[loyalty] stats RPC error:', statsErr.message);
        setStats(null);
      } else {
        setStats(statsData as LoyaltyStats);
      }
      setHistory((txs as LoyaltyTx[]) ?? []);
      setMissions((missionRows as any) ?? []);
      setBadges((badgeRows as any) ?? []);
      setRewards((rewardRows as RewardRow[]) ?? []);
      setLeaderboard((leaderboardData as LeaderboardRow[]) ?? []);
    } catch (err) {
      console.error('[loyalty] load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const handleRedeem = useCallback(async (reward: RewardRow) => {
    if (!stats || (stats.points_balance ?? 0) < reward.points_cost) {
      Alert.alert('Solde insuffisant', `Il te manque des points pour échanger « ${reward.label} ».`);
      return;
    }
    setRedeeming(reward.code);
    try {
      const { data, error } = await (supabase.rpc as any)('redeem_loyalty_reward', { p_reward_code: reward.code });
      if (error || !data?.ok) {
        Alert.alert('Échange impossible', data?.reason ?? error?.message ?? 'Une erreur est survenue.');
        return;
      }
      Alert.alert('Échangé !', `« ${reward.label} » a été réservé. Un admin va le confirmer.`);
      load();
    } catch (err: any) {
      Alert.alert('Erreur', err?.message ?? 'Une erreur est survenue.');
    } finally {
      setRedeeming(null);
    }
  }, [stats, load]);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader title="Fidélité" subtitle="Tes points Soutra-Playce" />

      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing['2xl'] }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* ═══════════ HERO ═══════════ */}
        <View style={s.hero}>
          <View style={s.heroIcon}>
            <Ionicons name="trophy" size={28} color="#fff" />
          </View>
          <Text style={s.heroLabel}>Solde de points</Text>
          {loading ? (
            <Skeleton width={180} height={42} />
          ) : (
            <Text style={s.heroAmount}>{(stats?.points_balance ?? 0).toLocaleString('fr-FR')} pts</Text>
          )}
          <Text style={s.heroSub}>
            {(stats?.points_lifetime ?? 0).toLocaleString('fr-FR')} pts gagnés depuis ton inscription
          </Text>
        </View>

        {/* ═══════════ Niveaux ═══════════ */}
        <LoyaltyLevelCard pointsLifetime={stats?.points_lifetime ?? 0} loading={loading} />

        {/* ═══════════ KPI grid ═══════════ */}
        <View style={s.kpiGrid}>
          <View style={s.kpiCard}>
            <Text style={s.kpiLabel}>Sur 30 jours</Text>
            <Text style={s.kpiValue}>{(stats?.period_points ?? 0).toLocaleString('fr-FR')} pts</Text>
            <Text style={s.kpiSub}>{stats?.period_count ?? 0} gains</Text>
          </View>
          <View style={s.kpiCard}>
            <Text style={s.kpiLabel}>Classement</Text>
            <Text style={s.kpiValue}>{stats?.rank ? `#${stats.rank}` : '—'}</Text>
            <Text style={s.kpiSub}>sur tous les utilisateurs</Text>
          </View>
        </View>

        {/* ═══════════ Missions ═══════════ */}
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Missions</Text>
        </View>
        {missions.length === 0 ? (
          <Text style={s.emptyInline}>Aucune mission active pour l&apos;instant.</Text>
        ) : (
          <View style={s.list}>
            {missions.map((m) => {
              const target = Number(m.loyalty_missions?.criteria?.target ?? 0) || 1;
              const pct = Math.min(1, m.progress / target);
              return (
                <View key={m.mission_code} style={s.missionRow}>
                  <Text style={s.missionIcon}>{m.loyalty_missions?.icon ?? '🎯'}</Text>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.rowTitle} numberOfLines={1}>{m.loyalty_missions?.label}</Text>
                    <View style={s.missionBarTrack}>
                      <View style={[s.missionBarFill, { width: `${Math.round(pct * 100)}%`, backgroundColor: m.completed_at ? c.success : c.primary[500] }]} />
                    </View>
                    <Text style={s.rowSub}>
                      {m.completed_at ? 'Accomplie ✓' : `${m.progress}/${target}`} · +{m.loyalty_missions?.points_reward ?? 0} pts
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* ═══════════ Badges ═══════════ */}
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Badges</Text>
          <Text style={s.sectionSub}>{badges.length} obtenu{badges.length > 1 ? 's' : ''}</Text>
        </View>
        {badges.length === 0 ? (
          <Text style={s.emptyInline}>Aucun badge pour l&apos;instant.</Text>
        ) : (
          <View style={s.badgeGrid}>
            {badges.map((b) => (
              <View key={b.badge_code} style={s.badgeChip}>
                <Text style={{ fontSize: 20 }}>{b.loyalty_badges?.icon ?? '🏅'}</Text>
                <Text style={s.badgeChipLabel} numberOfLines={1}>{b.loyalty_badges?.label}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ═══════════ Catalogue de récompenses ═══════════ */}
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Récompenses</Text>
        </View>
        <View style={s.list}>
          {rewards.map((r) => {
            const affordable = (stats?.points_balance ?? 0) >= r.points_cost;
            return (
              <View key={r.code} style={s.rewardRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.rowTitle} numberOfLines={1}>{r.label}</Text>
                  <Text style={s.rowSub} numberOfLines={2}>{r.description}</Text>
                  <Text style={s.rewardCost}>{r.points_cost.toLocaleString('fr-FR')} pts</Text>
                </View>
                <Pressable
                  style={[s.redeemBtn, (!affordable || redeeming === r.code) && s.redeemBtnDisabled]}
                  onPress={() => handleRedeem(r)}
                  disabled={!affordable || redeeming === r.code}
                >
                  {redeeming === r.code ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={s.redeemBtnText}>Échanger</Text>
                  )}
                </Pressable>
              </View>
            );
          })}
        </View>

        {/* ═══════════ Classement ═══════════ */}
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Classement</Text>
        </View>
        <View style={s.list}>
          {leaderboard.map((row) => (
            <View key={row.rank} style={s.row}>
              <Text style={s.rankNumber}>#{row.rank}</Text>
              <Text style={s.rowTitle} numberOfLines={1}>{row.full_name ?? 'Utilisateur'}</Text>
              <Text style={s.rowAmount}>{row.points_lifetime.toLocaleString('fr-FR')} pts</Text>
            </View>
          ))}
        </View>

        {/* ═══════════ Historique ═══════════ */}
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Historique</Text>
          <Text style={s.sectionSub}>{history.length} mouvement{history.length > 1 ? 's' : ''}</Text>
        </View>

        {loading ? (
          <View style={{ paddingVertical: spacing.xl, alignItems: 'center' }}>
            <ActivityIndicator color={c.primary[500]} />
          </View>
        ) : history.length === 0 ? (
          <View style={s.emptyState}>
            <Ionicons name="trophy-outline" size={48} color={c.neutral[400]} />
            <Text style={s.emptyTitle}>Aucun point pour l&apos;instant</Text>
            <Text style={s.emptyBody}>
              Fais ton premier paiement marchand pour gagner tes premiers points.
            </Text>
          </View>
        ) : (
          <View style={s.list}>
            {history.map((tx) => {
              const positive = tx.points > 0;
              return (
                <View key={tx.id} style={s.row}>
                  <View style={s.rowIcon}>
                    <Ionicons name={positive ? 'add-circle' : 'remove-circle'} size={18} color={positive ? c.success : c.danger} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.rowTitle} numberOfLines={1}>{tx.description ?? tx.kind}</Text>
                    <Text style={s.rowSub} numberOfLines={1}>{relativeDate(tx.created_at)}</Text>
                  </View>
                  <Text style={[s.rowAmount, { color: positive ? c.success : c.danger }]}>
                    {positive ? '+' : ''}{tx.points.toLocaleString('fr-FR')} pts
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function relativeDate(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const m = Math.floor((now - d.getTime()) / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `il y a ${days} j`;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.light },
    hero: {
      marginHorizontal: spacing.lg,
      marginTop: spacing.md,
      paddingVertical: spacing.xl,
      borderRadius: 28,
      backgroundColor: c.primary[600],
      alignItems: 'center',
      shadowColor: c.primary[500],
      shadowOpacity: 0.25,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    },
    heroIcon: {
      width: 56, height: 56, borderRadius: 28,
      backgroundColor: 'rgba(255,255,255,0.18)',
      alignItems: 'center', justifyContent: 'center',
    },
    heroLabel: {
      marginTop: spacing.md,
      fontSize: typography.fontSize.xs,
      fontWeight: '700',
      letterSpacing: 1.4,
      textTransform: 'uppercase',
      color: 'rgba(255,255,255,0.85)',
    },
    heroAmount: {
      marginTop: spacing.xs,
      fontSize: 38,
      fontWeight: '900',
      color: '#fff',
      letterSpacing: -0.5,
    },
    heroSub: {
      marginTop: 2,
      fontSize: typography.fontSize.sm,
      color: 'rgba(255,255,255,0.75)',
      textAlign: 'center',
      paddingHorizontal: spacing.lg,
    },
    kpiGrid: {
      flexDirection: 'row',
      marginHorizontal: spacing.lg,
      marginTop: spacing.lg,
      gap: spacing.sm,
    },
    kpiCard: {
      flex: 1,
      backgroundColor: '#fff',
      borderRadius: radius.lg,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: c.neutral[200],
    },
    kpiLabel: {
      fontSize: typography.fontSize.xs,
      color: c.neutral[600],
      fontWeight: '600',
    },
    kpiValue: {
      marginTop: 4,
      fontSize: typography.fontSize.lg,
      fontWeight: '800',
      color: c.dark,
    },
    kpiSub: {
      marginTop: 2,
      fontSize: typography.fontSize.xs,
      color: c.neutral[500],
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginHorizontal: spacing.lg,
      marginTop: spacing.xl,
      marginBottom: spacing.sm,
    },
    sectionTitle: {
      fontSize: typography.fontSize.base,
      fontWeight: '800',
      color: c.dark,
    },
    sectionSub: {
      fontSize: typography.fontSize.xs,
      color: c.neutral[500],
    },
    emptyInline: {
      marginHorizontal: spacing.lg,
      fontSize: typography.fontSize.sm,
      color: c.neutral[500],
    },
    list: {
      marginHorizontal: spacing.lg,
      backgroundColor: '#fff',
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.neutral[200],
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.neutral[200],
    },
    rankNumber: {
      width: 32,
      fontSize: typography.fontSize.sm,
      fontWeight: '800',
      color: c.neutral[500],
    },
    rowIcon: {
      width: 36, height: 36, borderRadius: 18,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: c.neutral[100],
    },
    rowTitle: {
      flex: 1,
      fontSize: typography.fontSize.sm,
      fontWeight: '700',
      color: c.dark,
    },
    rowSub: {
      marginTop: 2,
      fontSize: typography.fontSize.xs,
      color: c.neutral[500],
    },
    rowAmount: {
      fontSize: typography.fontSize.base,
      fontWeight: '800',
      color: c.success,
      fontVariant: ['tabular-nums'],
    },
    missionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.neutral[200],
    },
    missionIcon: { fontSize: 22 },
    missionBarTrack: {
      height: 6,
      borderRadius: 3,
      backgroundColor: c.neutral[100],
      marginTop: 6,
      overflow: 'hidden',
    },
    missionBarFill: { height: '100%', borderRadius: 3 },
    badgeGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginHorizontal: spacing.lg,
    },
    badgeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: '#fff',
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: c.neutral[200],
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    badgeChipLabel: {
      fontSize: typography.fontSize.xs,
      fontWeight: '700',
      color: c.dark,
      maxWidth: 120,
    },
    rewardRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.neutral[200],
    },
    rewardCost: {
      marginTop: 4,
      fontSize: typography.fontSize.xs,
      fontWeight: '800',
      color: c.primary[600],
    },
    redeemBtn: {
      backgroundColor: c.primary[500],
      borderRadius: radius.full,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      minWidth: 92,
      alignItems: 'center',
    },
    redeemBtnDisabled: { opacity: 0.4 },
    redeemBtnText: {
      fontSize: typography.fontSize.xs,
      fontWeight: '800',
      color: '#fff',
    },
    emptyState: {
      marginHorizontal: spacing.lg,
      paddingVertical: spacing.xl,
      alignItems: 'center',
      gap: spacing.sm,
    },
    emptyTitle: {
      fontSize: typography.fontSize.base,
      fontWeight: '700',
      color: c.dark,
    },
    emptyBody: {
      fontSize: typography.fontSize.sm,
      color: c.neutral[600],
      textAlign: 'center',
      paddingHorizontal: spacing.lg,
    },
  });
}
