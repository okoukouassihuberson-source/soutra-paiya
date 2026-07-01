import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { typography, radius, spacing, formatXOF, type ColorPalette } from '@soutra/shared';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useColors } from '@/lib/theme';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Skeleton } from '@/components/Skeleton';
import { CashbackLevelCard } from '@/components/CashbackLevelCard';

// URL de la page d'abonnement web : 5 plans + simulateur + paiement Paystack.
// Pas de duplication mobile — l'expérience web est déjà complète et le retour
// au paiement passe par deep-link soutrapaiya:// (cf. paystack/callback web).
const SUBSCRIBE_URL = 'https://soutra-paiya.vercel.app/subscribe';

async function openSubscribePage() {
  try {
    await WebBrowser.openBrowserAsync(SUBSCRIBE_URL, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
      controlsColor: '#FF6B1A',
      toolbarColor: '#0E1116',
    });
  } catch (err) {
    Alert.alert('Erreur', err instanceof Error ? err.message : 'Impossible d\'ouvrir la page abonnement');
  }
}

/**
 * /cashback — écran historique cashback mobile.
 *
 * Affiche en haut :
 *   • Total all-time
 *   • Période 30j
 *   • Plan actif + taux courant
 *   • Dernier cashback (date + montant)
 * Et en bas la liste des 30 dernières transactions cashback.
 *
 * Source : RPC `get_my_cashback_stats` (migration 0051) + select direct
 * transactions type=cashback pour l'historique long. Si la RPC n'est pas
 * encore appliquée → fallback gracieux (KPIs à 0, pas de crash).
 */

interface CashbackStats {
  ok?: boolean;
  total_all_time_xof?: number;
  period_xof?: number;
  period_count?: number;
  avg_per_tx_xof?: number;
  current_plan?: {
    code: string;
    display_name: string;
    cashback_bps: number;
  };
  latest?: {
    amount_xof: number;
    created_at: string;
    source_amount_xof?: string | null;
  } | null;
}

interface CashbackTx {
  id: string;
  amount_xof: number;
  created_at: string;
  metadata: Record<string, any> | null;
  description: string | null;
}

export default function CashbackScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  const [stats, setStats] = useState<CashbackStats | null>(null);
  const [history, setHistory] = useState<CashbackTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    try {
      const [{ data: statsData, error: statsErr }, { data: txs }] = await Promise.all([
        (supabase.rpc as any)('get_my_cashback_stats', { p_window_days: 30 }),
        supabase
          .from('transactions')
          .select('id, amount_xof, created_at, metadata, description')
          .eq('user_id', user.id)
          .eq('type', 'cashback')
          .eq('status', 'success')
          .order('created_at', { ascending: false })
          .limit(30),
      ]);

      if (statsErr) {
        // Migration 0051 pas appliquée — fallback gracieux.
        console.warn('[cashback] stats RPC error:', statsErr.message);
        setStats(null);
      } else {
        setStats(statsData as CashbackStats);
      }
      setHistory((txs as CashbackTx[]) ?? []);
    } catch (err) {
      console.error('[cashback] load error:', err);
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

  const planRate = stats?.current_plan?.cashback_bps != null
    ? (stats.current_plan.cashback_bps / 100).toFixed(stats.current_plan.cashback_bps % 100 === 0 ? 0 : 1)
    : null;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader title="Cashback" subtitle="Tes récompenses Soutra-Explore" />

      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing['2xl'] }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* ═══════════ HERO ═══════════ */}
        <View style={s.hero}>
          <View style={s.heroIcon}>
            <Ionicons name="gift" size={28} color="#fff" />
          </View>
          <Text style={s.heroLabel}>Cashback gagné</Text>
          {loading ? (
            <Skeleton width={180} height={42} />
          ) : (
            <Text style={s.heroAmount}>
              {formatXOF(stats?.total_all_time_xof ?? 0)}
            </Text>
          )}
          <Text style={s.heroSub}>depuis ton inscription</Text>
        </View>

        {/* ═══════════ Gamification niveaux (PR3 audit UX) ═══════════ */}
        <CashbackLevelCard
          totalXof={stats?.total_all_time_xof ?? 0}
          loading={loading}
        />

        {/* ═══════════ KPI grid ═══════════ */}
        <View style={s.kpiGrid}>
          <View style={s.kpiCard}>
            <Text style={s.kpiLabel}>Sur 30 jours</Text>
            <Text style={s.kpiValue}>{formatXOF(stats?.period_xof ?? 0)}</Text>
            <Text style={s.kpiSub}>{stats?.period_count ?? 0} crédits</Text>
          </View>
          <View style={s.kpiCard}>
            <Text style={s.kpiLabel}>Moy. / crédit</Text>
            <Text style={s.kpiValue}>{formatXOF(stats?.avg_per_tx_xof ?? 0)}</Text>
            <Text style={s.kpiSub}>période 30j</Text>
          </View>
        </View>

        {/* ═══════════ Plan actif ═══════════ */}
        {stats?.current_plan && (
          <Pressable style={s.planCard} onPress={openSubscribePage}>
            <View style={s.planLeft}>
              <Text style={s.planLabel}>Plan actuel</Text>
              <Text style={s.planName}>{stats.current_plan.display_name}</Text>
              <Text style={s.planRate}>
                {planRate} % de cashback sur chaque paiement
              </Text>
            </View>
            <View style={s.planRight}>
              <Ionicons name="chevron-forward" size={20} color={c.primary[500]} />
            </View>
          </Pressable>
        )}

        {/* ═══════════ Booster CTA (si plan free) ═══════════ */}
        {stats?.current_plan?.code === 'free' && (
          <Pressable
            style={s.boosterCta}
            onPress={openSubscribePage}
          >
            <Ionicons name="rocket" size={20} color="#fff" />
            <View style={{ flex: 1 }}>
              <Text style={s.boosterTitle}>Booster mon cashback</Text>
              <Text style={s.boosterSub}>Jusqu&apos;à 5 % avec Soutra Premium</Text>
            </View>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </Pressable>
        )}

        {/* ═══════════ Historique ═══════════ */}
        <View style={s.historyHeader}>
          <Text style={s.sectionTitle}>Historique</Text>
          <Text style={s.sectionSub}>{history.length} crédit{history.length > 1 ? 's' : ''}</Text>
        </View>

        {loading ? (
          <View style={{ paddingVertical: spacing.xl, alignItems: 'center' }}>
            <ActivityIndicator color={c.primary[500]} />
          </View>
        ) : history.length === 0 ? (
          <View style={s.emptyState}>
            <Ionicons name="gift-outline" size={48} color={c.neutral[400]} />
            <Text style={s.emptyTitle}>Aucun cashback pour l&apos;instant</Text>
            <Text style={s.emptyBody}>
              Fais ton premier paiement marchand pour gagner ton premier cashback.
            </Text>
          </View>
        ) : (
          <View style={s.list}>
            {history.map((tx) => {
              const planCode = (tx.metadata?.plan_code as string) || null;
              const bps = tx.metadata?.cashback_bps != null
                ? Number(tx.metadata.cashback_bps)
                : null;
              const src = tx.metadata?.source_amount_xof
                ? Number(tx.metadata.source_amount_xof)
                : null;
              return (
                <View key={tx.id} style={s.row}>
                  <View style={s.rowIcon}>
                    <Ionicons name="gift" size={18} color={c.success[600]} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.rowTitle} numberOfLines={1}>
                      Cashback {bps != null ? `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)} %` : ''}
                      {planCode ? ` · ${planCode}` : ''}
                    </Text>
                    <Text style={s.rowSub} numberOfLines={1}>
                      {src != null ? `sur ${formatXOF(src)} · ` : ''}{relativeDate(tx.created_at)}
                    </Text>
                  </View>
                  <Text style={s.rowAmount}>+{formatXOF(tx.amount_xof)}</Text>
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
      backgroundColor: c.success[600],
      alignItems: 'center',
      shadowColor: c.success[600],
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
    planCard: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: spacing.lg,
      marginTop: spacing.lg,
      backgroundColor: c.primary[50],
      borderRadius: radius.lg,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: c.primary[100],
    },
    planLeft: { flex: 1 },
    planRight: { paddingLeft: spacing.sm },
    planLabel: {
      fontSize: typography.fontSize.xs,
      color: c.primary[700],
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    planName: {
      marginTop: 2,
      fontSize: typography.fontSize.lg,
      fontWeight: '800',
      color: c.dark,
    },
    planRate: {
      marginTop: 2,
      fontSize: typography.fontSize.sm,
      color: c.neutral[600],
    },
    boosterCta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginHorizontal: spacing.lg,
      marginTop: spacing.md,
      backgroundColor: c.primary[500],
      borderRadius: radius.lg,
      padding: spacing.md,
      shadowColor: c.primary[500],
      shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
      elevation: 3,
    },
    boosterTitle: {
      fontSize: typography.fontSize.base,
      fontWeight: '800',
      color: '#fff',
    },
    boosterSub: {
      fontSize: typography.fontSize.xs,
      color: 'rgba(255,255,255,0.85)',
    },
    historyHeader: {
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
    rowIcon: {
      width: 36, height: 36, borderRadius: 18,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: c.success[50],
    },
    rowTitle: {
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
      color: c.success[600],
      fontVariant: ['tabular-nums'],
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
