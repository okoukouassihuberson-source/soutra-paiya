import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  Pressable,
  StyleSheet,
  RefreshControl,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { typography, radius, spacing, formatXOF, type ColorPalette } from '@soutra/shared';
import { useAuth } from '@/lib/auth-context';
import { useColors } from '@/lib/theme';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Skeleton } from '@/components/Skeleton';
import {
  getRewardSummary,
  listRewardHistory,
  redeemRewardPoints,
  multiplierLabel,
  type RewardSummary,
  type RewardHistoryEntry,
} from '@/lib/rewards';

export default function Rewards() {
  const { user } = useAuth();
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  const [summary, setSummary] = useState<RewardSummary | null>(null);
  const [history, setHistory] = useState<RewardHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [redeemOpen, setRedeemOpen] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [sumRes, histRes] = await Promise.all([getRewardSummary(), listRewardHistory(50)]);
      setSummary(sumRes);
      setHistory(histRes);
    } catch (err: any) {
      console.error('[rewards] load:', err);
      Alert.alert('Erreur', err?.message ?? 'Impossible de charger les récompenses.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const canRedeem = !!summary && summary.balance >= summary.redeem_min_points;
  const tierColor = summary?.current_tier?.color_hex ?? c.primary[500];
  const progressPct = summary?.next_tier
    ? Math.min(
        100,
        Math.max(
          0,
          ((summary.lifetime - (summary.current_tier?.min_lifetime_points ?? 0)) /
            (summary.next_tier.min_lifetime_points - (summary.current_tier?.min_lifetime_points ?? 0))) *
            100,
        ),
      )
    : 100;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader title="Récompenses" subtitle="Gagne du cashback sur tes paiements" />

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['2xl'] }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading ? (
          <View>
            <Skeleton width="100%" height={200} borderRadius={20} />
            <View style={{ height: spacing.lg }} />
            <Skeleton width="60%" height={20} />
          </View>
        ) : summary ? (
          <>
            {/* Hero — solde points + palier courant */}
            <View style={[s.heroCard, { backgroundColor: tierColor }]}>
              <View style={s.bgCircle1} />
              <View style={s.bgCircle2} />

              <View style={s.heroTop}>
                <View>
                  <Text style={s.heroLabel}>Mes points Soutra-Pay</Text>
                  <Text style={s.heroBalance}>{summary.balance.toLocaleString('fr-FR')}</Text>
                  <Text style={s.heroSub}>
                    soit {formatXOF(summary.balance * summary.redeem_rate_xof_per_point)} en bonus
                  </Text>
                </View>
                <View style={s.tierBadge}>
                  <Ionicons name="trophy" size={16} color="#fff" />
                  <Text style={s.tierBadgeText}>{summary.current_tier?.display_name ?? 'Bronze'}</Text>
                </View>
              </View>

              <View style={s.heroDivider} />

              {/* Barre de progression vers le prochain palier */}
              {summary.next_tier ? (
                <>
                  <View style={s.progressLabelRow}>
                    <Text style={s.progressLabel}>
                      Encore {summary.next_tier.points_to_reach.toLocaleString('fr-FR')} pts vers{' '}
                      <Text style={{ fontWeight: '700' }}>{summary.next_tier.display_name}</Text>
                    </Text>
                    <Text style={s.progressPct}>{Math.round(progressPct)}%</Text>
                  </View>
                  <View style={s.progressTrack}>
                    <View style={[s.progressFill, { width: `${progressPct}%` }]} />
                  </View>
                  <Text style={s.progressHint}>
                    Cashback {multiplierLabel(summary.next_tier.multiplier_bps)} dès {summary.next_tier.display_name}
                  </Text>
                </>
              ) : (
                <Text style={s.progressHint}>
                  Tu as atteint le palier maximum — {multiplierLabel(summary.current_tier?.multiplier_bps ?? 10000)} sur tous tes paiements.
                </Text>
              )}
            </View>

            {/* CTA conversion */}
            <Pressable
              disabled={!canRedeem}
              onPress={() => setRedeemOpen(true)}
              style={({ pressed }) => [
                s.redeemBtn,
                { backgroundColor: canRedeem ? c.primary[500] : c.neutral[200] },
                pressed && canRedeem && { opacity: 0.9, transform: [{ scale: 0.98 }] },
              ]}
            >
              <Ionicons name="cash" size={20} color={canRedeem ? '#fff' : c.neutral[500]} />
              <Text style={[s.redeemBtnText, { color: canRedeem ? '#fff' : c.neutral[500] }]}>
                {canRedeem
                  ? 'Convertir en bonus wallet'
                  : `Minimum ${summary.redeem_min_points} pts pour convertir`}
              </Text>
            </Pressable>

            {/* Comment ça marche */}
            <View style={s.infoCard}>
              <View style={s.sectionTitleRow}>
                <View style={s.sectionAccent} />
                <Text style={s.sectionTitle}>Comment ça marche</Text>
              </View>
              <InfoRow
                c={c}
                icon="card-outline"
                title="Gagne du cashback"
                text={`1 point pour chaque 100 FCFA dépensé. Multiplicateur ${multiplierLabel(summary.current_tier?.multiplier_bps ?? 10000)} avec ton palier ${summary.current_tier?.display_name ?? 'Bronze'}.`}
              />
              <InfoRow
                c={c}
                icon="trending-up-outline"
                title="Monte de palier"
                text="Plus tu paies, plus tu débloques de paliers et un meilleur taux de cashback."
              />
              <InfoRow
                c={c}
                icon="wallet-outline"
                title="Convertis tes points"
                text={`Dès ${summary.redeem_min_points} pts, transforme-les en bonus wallet (1 pt = ${summary.redeem_rate_xof_per_point} FCFA).`}
              />
            </View>

            {/* Historique */}
            <View style={s.sectionTitleRow}>
              <View style={s.sectionAccent} />
              <Text style={s.sectionTitle}>Historique des points</Text>
            </View>
            {history.length === 0 ? (
              <View style={s.empty}>
                <View style={s.emptyIconWrap}>
                  <Ionicons name="gift-outline" size={36} color={c.primary[400]} />
                </View>
                <Text style={s.emptyTitle}>Pas encore de points</Text>
                <Text style={s.emptyText}>
                  Effectue ton premier paiement Soutra-Pay pour gagner du cashback.
                </Text>
              </View>
            ) : (
              <View style={s.historyList}>
                {history.map((h) => (
                  <HistoryRow key={h.id} entry={h} c={c} />
                ))}
              </View>
            )}
          </>
        ) : null}
      </ScrollView>

      <RedeemModal
        visible={redeemOpen}
        onClose={() => setRedeemOpen(false)}
        summary={summary}
        onRedeemed={(res) => {
          setRedeemOpen(false);
          Alert.alert(
            'Conversion réussie',
            `${res.redeemed_points.toLocaleString('fr-FR')} pts → ${formatXOF(res.credited_xof)} crédités sur ton wallet.`,
          );
          load();
        }}
      />
    </SafeAreaView>
  );
}

function InfoRow({
  c,
  icon,
  title,
  text,
}: {
  c: ColorPalette;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  text: string;
}) {
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <View style={s.infoRow}>
      <View style={s.infoIcon}>
        <Ionicons name={icon} size={18} color={c.primary[600]} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.infoTitle}>{title}</Text>
        <Text style={s.infoText}>{text}</Text>
      </View>
    </View>
  );
}

function HistoryRow({ entry, c }: { entry: RewardHistoryEntry; c: ColorPalette }) {
  const s = useMemo(() => makeStyles(c), [c]);
  const positive = entry.delta_points > 0;
  const meta = historyMeta(entry.kind, c);
  return (
    <View style={s.historyItem}>
      <View style={[s.historyIcon, { backgroundColor: meta.bg }]}>
        <Ionicons name={meta.icon} size={18} color={meta.color} />
      </View>
      <View style={{ flex: 1, marginLeft: spacing.md }}>
        <Text style={s.historyTitle} numberOfLines={1}>
          {entry.description || meta.label}
        </Text>
        <Text style={s.historyDate}>{relativeDate(entry.created_at)}</Text>
      </View>
      <Text style={[s.historyDelta, { color: positive ? c.success : c.danger }]}>
        {positive ? '+' : ''}
        {entry.delta_points.toLocaleString('fr-FR')} pts
      </Text>
    </View>
  );
}

function RedeemModal({
  visible,
  onClose,
  summary,
  onRedeemed,
}: {
  visible: boolean;
  onClose: () => void;
  summary: RewardSummary | null;
  onRedeemed: (res: { redeemed_points: number; credited_xof: number }) => void;
}) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) {
      setAmount('');
      setSubmitting(false);
    }
  }, [visible]);

  if (!summary) return null;
  const pts = parseInt(amount || '0', 10);
  const min = summary.redeem_min_points;
  const max = summary.balance;
  const valid = pts >= min && pts <= max;
  const equivalent = pts > 0 ? pts * summary.redeem_rate_xof_per_point : 0;

  const submit = async () => {
    if (!valid) {
      Alert.alert(
        'Montant invalide',
        `Saisis entre ${min.toLocaleString('fr-FR')} et ${max.toLocaleString('fr-FR')} points.`,
      );
      return;
    }
    try {
      setSubmitting(true);
      const res = await redeemRewardPoints(pts);
      onRedeemed({ redeemed_points: res.redeemed_points, credited_xof: res.credited_xof });
    } catch (err: any) {
      const code = err?.message ?? '';
      const msg =
        code === 'INSUFFICIENT_POINTS'
          ? "Solde de points insuffisant."
          : code === 'BELOW_MIN_POINTS'
            ? `Minimum ${min.toLocaleString('fr-FR')} points requis.`
            : code || 'Conversion impossible pour le moment.';
      Alert.alert('Erreur', msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={s.modalBackdrop}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={s.modalSheet}>
          <View style={s.modalHandle} />
          <Text style={s.modalTitle}>Convertir en bonus</Text>
          <Text style={s.modalSub}>
            Tu as {summary.balance.toLocaleString('fr-FR')} pts disponibles.
            Minimum {summary.redeem_min_points} pts.
          </Text>

          <View style={s.amountWrap}>
            <TextInput
              value={amount}
              onChangeText={(t) => setAmount(t.replace(/[^0-9]/g, ''))}
              placeholder="500"
              placeholderTextColor={c.neutral[400]}
              keyboardType="number-pad"
              maxLength={7}
              style={s.amountInput}
              editable={!submitting}
            />
            <Text style={s.amountSuffix}>pts</Text>
          </View>
          <Text style={s.amountEquiv}>
            ≈ {formatXOF(equivalent)} crédités sur ton wallet
          </Text>

          <View style={s.quickAmountRow}>
            {[min, 1000, 2000, 5000].filter((v) => v <= max).map((v) => (
              <Pressable
                key={v}
                onPress={() => setAmount(String(v))}
                style={({ pressed }) => [s.quickAmountBtn, pressed && { opacity: 0.7 }]}
              >
                <Text style={s.quickAmountText}>{v.toLocaleString('fr-FR')}</Text>
              </Pressable>
            ))}
            {max > 0 && (
              <Pressable
                onPress={() => setAmount(String(max))}
                style={({ pressed }) => [s.quickAmountBtn, pressed && { opacity: 0.7 }]}
              >
                <Text style={s.quickAmountText}>Max</Text>
              </Pressable>
            )}
          </View>

          <Pressable
            disabled={!valid || submitting}
            onPress={submit}
            style={({ pressed }) => [
              s.modalConfirmBtn,
              { backgroundColor: valid ? c.primary[500] : c.neutral[200] },
              pressed && valid && { opacity: 0.9 },
            ]}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={[s.modalConfirmText, { color: valid ? '#fff' : c.neutral[500] }]}>
                Convertir
              </Text>
            )}
          </Pressable>

          <Pressable onPress={onClose} style={s.modalCancelBtn} disabled={submitting}>
            <Text style={s.modalCancelText}>Annuler</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function historyMeta(
  kind: RewardHistoryEntry['kind'],
  c: ColorPalette,
): { label: string; icon: keyof typeof Ionicons.glyphMap; bg: string; color: string } {
  switch (kind) {
    case 'earn_transaction':
      return { label: 'Cashback', icon: 'add-circle', bg: '#dcfce7', color: '#16a34a' };
    case 'redeem_wallet':
      return { label: 'Conversion en wallet', icon: 'wallet', bg: '#dbeafe', color: '#2563eb' };
    case 'bonus_tier':
      return { label: 'Bonus de palier', icon: 'trophy', bg: '#fef3c7', color: '#d97706' };
    case 'admin_adjust':
      return { label: 'Ajustement', icon: 'construct', bg: c.neutral[100], color: c.neutral[600] };
    default:
      return { label: kind, icon: 'help-circle', bg: c.neutral[100], color: c.neutral[600] };
  }
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

    heroCard: {
      position: 'relative',
      overflow: 'hidden',
      padding: spacing.lg,
      borderRadius: 20,
      shadowColor: '#000',
      shadowOpacity: 0.18,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
    bgCircle1: {
      position: 'absolute',
      top: -60, right: -60,
      width: 180, height: 180, borderRadius: 90,
      backgroundColor: 'rgba(255,255,255,0.10)',
    },
    bgCircle2: {
      position: 'absolute',
      bottom: -40, left: -40,
      width: 130, height: 130, borderRadius: 65,
      backgroundColor: 'rgba(255,255,255,0.06)',
    },
    heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    heroLabel: {
      color: 'rgba(255,255,255,0.85)',
      fontSize: typography.fontSize.xs,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    heroBalance: {
      color: '#fff',
      fontSize: 38,
      fontWeight: '700',
      marginTop: spacing.xs,
      letterSpacing: -0.5,
    },
    heroSub: { color: 'rgba(255,255,255,0.9)', fontSize: typography.fontSize.sm, marginTop: 2 },
    tierBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
      borderRadius: radius.full,
      backgroundColor: 'rgba(0,0,0,0.25)',
    },
    tierBadgeText: { color: '#fff', fontWeight: '700', fontSize: typography.fontSize.xs, letterSpacing: 0.3 },

    heroDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.18)', marginVertical: spacing.lg },

    progressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
    progressLabel: { color: 'rgba(255,255,255,0.95)', fontSize: typography.fontSize.sm, flex: 1, marginRight: spacing.sm },
    progressPct: { color: '#fff', fontWeight: '700', fontSize: typography.fontSize.sm },
    progressTrack: { height: 8, borderRadius: radius.full, backgroundColor: 'rgba(0,0,0,0.25)', overflow: 'hidden' },
    progressFill: { height: '100%', backgroundColor: '#fff', borderRadius: radius.full },
    progressHint: { color: 'rgba(255,255,255,0.8)', fontSize: typography.fontSize.xs, marginTop: spacing.sm },

    redeemBtn: {
      marginTop: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: radius.full,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
    },
    redeemBtnText: { fontWeight: '700', fontSize: typography.fontSize.base },

    infoCard: {
      marginTop: spacing.xl,
      backgroundColor: c.neutral[50],
      borderRadius: radius.lg,
      padding: spacing.md,
    },

    sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg, marginBottom: spacing.sm },
    sectionAccent: { width: 4, height: 18, borderRadius: 2, backgroundColor: c.primary[500] },
    sectionTitle: { flex: 1, fontSize: typography.fontSize.lg, fontWeight: '700', color: c.dark },

    infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.sm },
    infoIcon: {
      width: 36, height: 36, borderRadius: 18,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: c.primary[50],
    },
    infoTitle: { fontSize: typography.fontSize.sm, fontWeight: '700', color: c.dark, marginBottom: 2 },
    infoText: { fontSize: typography.fontSize.xs, color: c.neutral[600], lineHeight: 17 },

    historyList: {
      backgroundColor: c.neutral[50],
      borderRadius: radius.lg,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    historyItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: c.neutral[100],
    },
    historyIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    historyTitle: { fontSize: typography.fontSize.sm, fontWeight: '600', color: c.dark },
    historyDate: { fontSize: typography.fontSize.xs, color: c.neutral[500], marginTop: 2 },
    historyDelta: { fontSize: typography.fontSize.base, fontWeight: '700' },

    empty: { padding: spacing.xl, backgroundColor: c.neutral[50], borderRadius: radius.lg, alignItems: 'center' },
    emptyIconWrap: {
      width: 80, height: 80, borderRadius: 40,
      backgroundColor: c.primary[50],
      alignItems: 'center', justifyContent: 'center',
      marginBottom: spacing.md,
    },
    emptyTitle: { fontSize: typography.fontSize.base, fontWeight: '700', color: c.dark, marginBottom: spacing.xs },
    emptyText: { fontSize: typography.fontSize.sm, color: c.neutral[500], textAlign: 'center', maxWidth: 280 },

    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalSheet: {
      backgroundColor: c.light,
      borderTopLeftRadius: 24, borderTopRightRadius: 24,
      padding: spacing.lg,
      paddingBottom: spacing['2xl'],
    },
    modalHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: c.neutral[200], marginBottom: spacing.md },
    modalTitle: { fontSize: typography.fontSize.lg, fontWeight: '700', color: c.dark },
    modalSub: { fontSize: typography.fontSize.sm, color: c.neutral[600], marginTop: 4 },
    amountWrap: {
      flexDirection: 'row',
      alignItems: 'baseline',
      marginTop: spacing.lg,
      borderBottomWidth: 2,
      borderBottomColor: c.primary[500],
      paddingBottom: spacing.sm,
    },
    amountInput: { flex: 1, fontSize: 32, fontWeight: '700', color: c.dark },
    amountSuffix: { fontSize: typography.fontSize.lg, fontWeight: '700', color: c.neutral[500], marginLeft: spacing.sm },
    amountEquiv: { fontSize: typography.fontSize.xs, color: c.neutral[500], marginTop: spacing.xs },
    quickAmountRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
    quickAmountBtn: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.full,
      backgroundColor: c.neutral[100],
    },
    quickAmountText: { color: c.dark, fontWeight: '600', fontSize: typography.fontSize.xs },
    modalConfirmBtn: { marginTop: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.full, alignItems: 'center' },
    modalConfirmText: { fontWeight: '700', fontSize: typography.fontSize.base },
    modalCancelBtn: { marginTop: spacing.sm, padding: spacing.sm, alignItems: 'center' },
    modalCancelText: { color: c.neutral[600], fontWeight: '600' },
  });
}
