import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { typography, radius, spacing, formatXOF, type ColorPalette } from '@soutra/shared';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { TabHeader } from '@/components/TabHeader';
import { Skeleton } from '@/components/Skeleton';
import { useColors } from '@/lib/theme';

export default function Wallet() {
  const { user } = useAuth();
  const router = useRouter();
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const [balance, setBalance] = useState<number>(0);
  const [locked, setLocked] = useState<number>(0);
  const [walletLoading, setWalletLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const loadWallet = useCallback(async () => {
    if (!user?.id) {
      setWalletLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('wallets')
        .select('balance_xof, locked_xof')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('[wallet] load error:', error);
        return;
      }
      if (data) {
        setBalance((data as any).balance_xof ?? 0);
        setLocked((data as any).locked_xof ?? 0);
      }
    } catch (err) {
      console.error('[wallet] unexpected error:', err);
    } finally {
      setWalletLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      loadWallet();
      setRefreshNonce((n) => n + 1);
    }, [loadWallet]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    setRefreshNonce((n) => n + 1);
    loadWallet();
  };

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing['2xl'] }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <TabHeader
          subtitle="Ton portefeuille Soutra-Pay"
          trailing={(
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Pressable hitSlop={10} onPress={() => router.push('/search')} style={s.iconBtn}>
                <Ionicons name="search-outline" size={20} color={c.dark} />
              </Pressable>
              <Pressable hitSlop={10} onPress={() => router.push('/settings')} style={s.iconBtn}>
                <Ionicons name="settings-outline" size={20} color={c.dark} />
              </Pressable>
            </View>
          )}
        />

        {/* Hero card : solde + actions principales */}
        <View style={s.balanceCard}>
          {/* Décorations bg subtiles (cercles) */}
          <View style={s.bgCircle1} />
          <View style={s.bgCircle2} />

          <View style={s.balanceTop}>
            <View>
              <Text style={s.balanceLabel}>Solde disponible</Text>
              <View style={s.balanceValueRow}>
                {walletLoading ? (
                  <Skeleton width={180} height={40} style={{ backgroundColor: 'rgba(255,255,255,0.25)' }} />
                ) : (
                  <Text style={s.balanceValue}>{hidden ? '•••••• FCFA' : formatXOF(balance)}</Text>
                )}
              </View>
              {locked > 0 && (
                <View style={s.lockedRow}>
                  <Ionicons name="lock-closed" size={11} color="rgba(255,255,255,0.85)" />
                  <Text style={s.locked}>{formatXOF(locked)} en séquestre</Text>
                </View>
              )}
            </View>
            <Pressable hitSlop={10} onPress={() => setHidden(!hidden)} style={s.eyeBtn}>
              <Ionicons name={hidden ? 'eye-off-outline' : 'eye-outline'} size={20} color="#fff" />
            </Pressable>
          </View>

          <View style={s.balanceActions}>
            <Pressable
              onPress={() => router.push('/recharge')}
              style={({ pressed }) => [s.balanceActionBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
            >
              <Ionicons name="add-circle" size={18} color={c.primary[600]} />
              <Text style={s.balanceActionText}>Recharger</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push('/withdraw')}
              style={({ pressed }) => [s.balanceActionBtn, s.balanceActionBtnGhost, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
            >
              <Ionicons name="arrow-down-circle-outline" size={18} color="#fff" />
              <Text style={[s.balanceActionText, { color: '#fff' }]}>Retirer</Text>
            </Pressable>
          </View>
        </View>

        {/* Actions rapides */}
        <View style={s.quickRow}>
          {QUICK.map((q) => (
            <Pressable
              key={q.label}
              style={({ pressed }) => [s.quickItem, pressed && { transform: [{ scale: 0.95 }] }]}
              onPress={() => router.push(q.route as never)}
            >
              <View style={[s.quickIcon, { backgroundColor: q.bg }]}>
                <Ionicons name={q.icon} size={22} color={q.color} />
              </View>
              <Text style={s.quickLabel}>{q.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Teaser Fidélité — lien vers /loyalty */}
        <LoyaltyTeaser c={c} userId={user?.id} refreshNonce={refreshNonce} />

        {/* Ce mois-ci — dépenses/revenus */}
        <SpendingSummary c={c} userId={user?.id} refreshNonce={refreshNonce} />

        {/* Transactions récentes */}
        <View style={s.sectionTitleRow}>
          <View style={s.sectionAccent} />
          <Text style={s.sectionTitle}>Activité récente</Text>
        </View>
        <TransactionHistory c={c} userId={user?.id} refreshNonce={refreshNonce} />
      </ScrollView>
    </SafeAreaView>
  );
}

// Actions rapides du wallet. Réservations resto, orders boutique et
// bookings hôtel sont désormais consolidés dans l'onglet Billets (tab
// tickets), donc ils ne sont plus exposés ici. Split Note remplace ces
// entrées pour offrir la découpe d'addition entre amis.
const QUICK: { label: string; icon: keyof typeof Ionicons.glyphMap; bg: string; color: string; route: string }[] = [
  { label: 'Envoyer', icon: 'send', bg: '#dbeafe', color: '#2563eb', route: '/send' },
  { label: 'Demander', icon: 'download', bg: '#dcfce7', color: '#16a34a', route: '/requests' },
  { label: 'Split Note', icon: 'people', bg: '#ede9fe', color: '#7c3aed', route: '/split-bill' },
  { label: 'Scanner QR', icon: 'qr-code', bg: '#fce7f3', color: '#db2777', route: '/scan' },
];

interface PartyProfile {
  full_name: string | null;
  phone: string | null;
}

interface Transaction {
  id: string;
  type: string;
  amount_xof: number;
  status: string;
  created_at: string;
  description?: string;
  user_id: string;
  counterparty_id: string | null;
  // Jointures profiles (PR2 audit UX) — affiche prénom+nom au lieu d'UUID
  sender: PartyProfile | null;
  counterparty: PartyProfile | null;
}

function TransactionHistory({
  c,
  userId,
  refreshNonce,
}: {
  c: ColorPalette;
  userId?: string;
  refreshNonce: number;
}) {
  const s = useMemo(() => makeStyles(c), [c]);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    if (!userId) { setLoading(false); setTxs([]); return; }
    (async () => {
      try {
        const { data, error } = await supabase
          .from('transactions')
          .select(`
            id, type, amount_xof, status, created_at, description,
            user_id, counterparty_id,
            sender:user_id(full_name, phone),
            counterparty:counterparty_id(full_name, phone)
          `)
          .or(`user_id.eq.${userId},counterparty_id.eq.${userId}`)
          // Cashback déprécié (migration 0069) : l'historique reste en base
          // pour l'audit comptable mais n'est plus affiché dans l'UI.
          .neq('type', 'cashback')
          .order('created_at', { ascending: false })
          .limit(15);
        if (!mounted) return;
        if (error) { console.error('[wallet] tx error:', error); setTxs([]); }
        else { setTxs((data as Transaction[]) ?? []); }
      } catch (err) {
        console.error('[wallet] tx unexpected:', err);
        if (mounted) setTxs([]);
      } finally { if (mounted) setLoading(false); }
    })();
    return () => { mounted = false; };
  }, [userId, refreshNonce]);

  if (loading) {
    return (
      <View style={s.txList}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={s.txItem}>
            <Skeleton width={40} height={40} borderRadius={20} />
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Skeleton width="60%" height={14} />
              <Skeleton width="40%" height={11} style={{ marginTop: 6 }} />
            </View>
            <Skeleton width={70} height={16} />
          </View>
        ))}
      </View>
    );
  }
  if (!txs.length) {
    return (
      <View style={s.emptyState}>
        <View style={s.emptyIconWrap}>
          <Ionicons name="receipt-outline" size={36} color={c.primary[400]} />
        </View>
        <Text style={s.emptyTitle}>Aucune activité</Text>
        <Text style={s.emptyText}>Recharge ton wallet pour commencer à payer, envoyer ou recevoir.</Text>
      </View>
    );
  }

  return (
    <View style={s.txList}>
      {txs.map((tx) => {
        const credit = isCredit(tx, userId);
        const meta = txMeta(tx, userId, c);
        const failed = tx.status === 'failed' || tx.status === 'reversed';
        const pending = tx.status === 'pending';
        return (
          <View key={tx.id} style={s.txItem}>
            <View style={[s.txIcon, { backgroundColor: meta.bg }]}>
              <Ionicons name={meta.icon} size={18} color={meta.color} />
            </View>
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text style={s.txType} numberOfLines={1}>{meta.label}</Text>
              <View style={s.txMetaRow}>
                <Text style={s.txDate}>{relativeDate(tx.created_at)}</Text>
                {pending && (
                  <View style={[s.txStatusPill, { backgroundColor: '#fef3c7' }]}>
                    <Text style={[s.txStatusText, { color: '#d97706' }]}>En cours</Text>
                  </View>
                )}
                {failed && (
                  <View style={[s.txStatusPill, { backgroundColor: '#fee2e2' }]}>
                    <Text style={[s.txStatusText, { color: c.danger }]}>Échec</Text>
                  </View>
                )}
              </View>
            </View>
            <Text style={[s.txAmount, { color: failed ? c.neutral[400] : credit ? c.success : c.dark }]}>
              {credit ? '+' : '−'}{formatXOF(tx.amount_xof)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function isCredit(tx: Transaction, userId?: string): boolean {
  if (tx.type === 'transfer') return tx.counterparty_id === userId;
  return (
    tx.type === 'topup' ||
    tx.type === 'refund' ||
    tx.type === 'escrow_release'
  );
}

/** Formate le prénom+nom d'une contrepartie, fallback sur téléphone, puis tiret. */
function partyDisplay(p: PartyProfile | null): string {
  if (!p) return '';
  const name = (p.full_name ?? '').trim();
  if (name.length > 0) return name;
  if (p.phone) return p.phone;
  return '';
}

function txMeta(tx: Transaction, userId: string | undefined, c: ColorPalette): { label: string; icon: keyof typeof Ionicons.glyphMap; bg: string; color: string } {
  if (tx.type === 'transfer') {
    const received = tx.counterparty_id === userId;
    // L'autre partie : si reçu, c'est l'envoyeur (tx.sender) ; si envoyé,
    // c'est le destinataire (tx.counterparty).
    const other = received ? partyDisplay(tx.sender) : partyDisplay(tx.counterparty);
    if (received) {
      return {
        label: other ? `Reçu de ${other}` : 'Transfert reçu',
        icon: 'arrow-down', bg: '#dcfce7', color: '#16a34a',
      };
    }
    return {
      label: other ? `Envoyé à ${other}` : 'Transfert envoyé',
      icon: 'arrow-up', bg: '#dbeafe', color: '#2563eb',
    };
  }
  switch (tx.type) {
    case 'topup': return { label: 'Rechargement', icon: 'add-circle', bg: '#dcfce7', color: '#16a34a' };
    case 'withdraw': return { label: 'Retrait', icon: 'arrow-down-circle', bg: '#fee2e2', color: '#dc2626' };
    case 'payment': return { label: 'Paiement', icon: 'card', bg: '#ede9fe', color: '#7c3aed' };
    case 'refund': return { label: 'Remboursement', icon: 'arrow-undo', bg: '#dcfce7', color: '#16a34a' };
    case 'split': return { label: 'Split Bill', icon: 'people', bg: '#fef3c7', color: '#d97706' };
    case 'escrow_hold': return { label: 'Séquestre', icon: 'lock-closed', bg: '#e0e7ff', color: '#4f46e5' };
    case 'escrow_release': return { label: 'Libération séquestre', icon: 'lock-open', bg: '#dcfce7', color: '#16a34a' };
    case 'fee': return { label: 'Frais', icon: 'receipt', bg: c.neutral[100], color: c.neutral[600] };
    default: return { label: tx.type, icon: 'help-circle', bg: c.neutral[100], color: c.neutral[600] };
  }
}

function relativeDate(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const m = Math.floor((now - d.getTime()) / 60000);
  if (m < 1) return 'à l\'instant';
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `il y a ${days} j`;
  // Au-delà d'une semaine, date + heure (spec audit UX wallet PR2).
  return d.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/**
 * Teaser fidélité en haut de l'écran wallet : 1 ligne compacte, solde de
 * points + niveau, tap → /loyalty pour le détail complet. N'apparaît que
 * si la migration 0068 est appliquée (RPC get_my_loyalty_stats existe) —
 * sinon silently rendu vide.
 */
function LoyaltyTeaser({
  c, userId, refreshNonce,
}: { c: ColorPalette; userId?: string; refreshNonce: number }) {
  const router = useRouter();
  const s = useMemo(() => makeStyles(c), [c]);
  const [stats, setStats] = useState<{
    balance: number;
    levelLabel: string | null;
    levelEmoji: string | null;
  } | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data, error } = await (supabase.rpc as any)('get_my_loyalty_stats', {
        p_window_days: 30,
      });
      if (error) {
        setLoaded(true);
        return;
      }
      const d = data as any;
      setStats({
        balance: Number(d?.points_balance ?? 0),
        levelLabel: d?.level?.label ?? null,
        levelEmoji: d?.level?.emoji ?? null,
      });
      setLoaded(true);
    })();
  }, [userId, refreshNonce]);

  // Si la RPC n'est pas dispo ou pas chargée, on ne rend rien (silencieux).
  if (!loaded || !stats) return null;

  return (
    <Pressable
      onPress={() => router.push('/loyalty' as any)}
      style={({ pressed }) => [s.loyaltyTeaser, pressed && { opacity: 0.92 }]}
    >
      <View style={s.loyaltyTeaserIcon}>
        <Ionicons name="trophy" size={20} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.loyaltyTeaserLabel}>Fidélité</Text>
        <Text style={s.loyaltyTeaserAmount}>{stats.balance.toLocaleString('fr-FR')} pts</Text>
        {stats.levelLabel && (
          <Text style={s.loyaltyTeaserSub}>
            Niveau {stats.levelEmoji} {stats.levelLabel}
          </Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={20} color={c.primary[600]} />
    </Pressable>
  );
}

const SPEND_TYPE_LABEL: Record<string, string> = {
  payment: 'Paiements',
  withdraw: 'Retraits',
  fee: 'Frais',
  split: 'Split Bill',
  transfer: 'Transferts',
};

/**
 * Résumé "Ce mois-ci" : dépenses/revenus agrégés depuis `transactions`
 * (RPC get_my_spending_summary, migration 0071) + barre de répartition par
 * type de dépense. Rendu vide (silencieux) si le mois n'a aucune activité.
 */
function SpendingSummary({
  c, userId, refreshNonce,
}: { c: ColorPalette; userId?: string; refreshNonce: number }) {
  const s = useMemo(() => makeStyles(c), [c]);
  const [summary, setSummary] = useState<{
    spent: number;
    received: number;
    byType: { type: string; amount: number }[];
  } | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data, error } = await (supabase.rpc as any)('get_my_spending_summary', {});
      if (error) {
        setLoaded(true);
        return;
      }
      const d = data as any;
      setSummary({
        spent: Number(d?.spent_xof ?? 0),
        received: Number(d?.received_xof ?? 0),
        byType: ((d?.by_type as any[]) ?? []).map((t) => ({ type: t.type, amount: Number(t.amount_xof) })),
      });
      setLoaded(true);
    })();
  }, [userId, refreshNonce]);

  if (!loaded || !summary || (summary.spent === 0 && summary.received === 0)) return null;

  const maxAmount = Math.max(1, ...summary.byType.map((t) => t.amount));

  return (
    <View style={s.spendingCard}>
      <Text style={s.spendingTitle}>Ce mois-ci</Text>
      <View style={s.spendingStatsRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.spendingStatLabel}>Dépenses</Text>
          <Text style={[s.spendingStatValue, { color: c.danger }]}>{formatXOF(summary.spent)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.spendingStatLabel}>Revenus</Text>
          <Text style={[s.spendingStatValue, { color: c.success }]}>{formatXOF(summary.received)}</Text>
        </View>
      </View>
      {summary.byType.length > 0 && (
        <View style={s.spendingBreakdown}>
          {summary.byType.map((t) => (
            <View key={t.type} style={s.spendingBarRow}>
              <Text style={s.spendingBarLabel} numberOfLines={1}>{SPEND_TYPE_LABEL[t.type] ?? t.type}</Text>
              <View style={s.spendingBarTrack}>
                <View style={[s.spendingBarFill, { width: `${Math.round((t.amount / maxAmount) * 100)}%`, backgroundColor: c.primary[500] }]} />
              </View>
              <Text style={s.spendingBarAmount}>{formatXOF(t.amount)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.light },
    iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.neutral[50], alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.neutral[200] },
    balanceCard: {
      position: 'relative', overflow: 'hidden',
      marginHorizontal: spacing.lg, marginTop: spacing.sm,
      padding: spacing.lg, borderRadius: 20,
      backgroundColor: c.primary[500],
      shadowColor: c.primary[700], shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8,
    },
    bgCircle1: { position: 'absolute', top: -60, right: -60, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.08)' },
    bgCircle2: { position: 'absolute', bottom: -40, left: -40, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.06)' },
    balanceTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    balanceLabel: { color: 'rgba(255,255,255,0.85)', fontSize: typography.fontSize.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
    balanceValueRow: { marginTop: spacing.xs, minHeight: 42 },
    balanceValue: { color: '#fff', fontSize: 32, fontWeight: '700', letterSpacing: -0.5 },
    lockedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.xs },
    locked: { color: 'rgba(255,255,255,0.85)', fontSize: typography.fontSize.xs, fontWeight: '600' },
    eyeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
    balanceActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
    balanceActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.md, backgroundColor: '#fff', borderRadius: radius.full },
    balanceActionBtnGhost: { backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
    balanceActionText: { color: c.primary[600], fontWeight: '700', fontSize: typography.fontSize.sm },
    quickRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: spacing.lg, paddingHorizontal: spacing.lg },
    quickItem: { alignItems: 'center', gap: spacing.sm },
    quickIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    quickLabel: { fontSize: typography.fontSize.xs, color: c.dark, fontWeight: '600' },
    sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.md },
    sectionAccent: { width: 4, height: 18, borderRadius: 2, backgroundColor: c.primary[500] },
    sectionTitle: { flex: 1, fontSize: typography.fontSize.lg, fontWeight: '700', color: c.dark },
    // ──── Teaser Fidélité ────
    loyaltyTeaser: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      marginHorizontal: spacing.lg,
      marginTop: spacing.lg,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      backgroundColor: c.primary[50],
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.primary[100],
    },
    loyaltyTeaserIcon: {
      width: 40, height: 40, borderRadius: 20,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: c.primary[600],
    },
    loyaltyTeaserLabel: {
      fontSize: typography.fontSize.xs,
      fontWeight: '700',
      color: c.primary[700],
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    loyaltyTeaserAmount: {
      marginTop: 2,
      fontSize: typography.fontSize.lg,
      fontWeight: '800',
      color: c.dark,
      fontVariant: ['tabular-nums'],
    },
    loyaltyTeaserSub: {
      marginTop: 2,
      fontSize: typography.fontSize.xs,
      color: c.neutral[600],
    },
    // ──── Résumé "Ce mois-ci" ────
    spendingCard: {
      marginHorizontal: spacing.lg,
      marginTop: spacing.lg,
      backgroundColor: '#fff',
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.neutral[200],
      padding: spacing.lg,
    },
    spendingTitle: {
      fontSize: typography.fontSize.sm,
      fontWeight: '800',
      color: c.dark,
    },
    spendingStatsRow: {
      flexDirection: 'row',
      marginTop: spacing.md,
      gap: spacing.md,
    },
    spendingStatLabel: {
      fontSize: typography.fontSize.xs,
      color: c.neutral[500],
      fontWeight: '600',
    },
    spendingStatValue: {
      marginTop: 2,
      fontSize: typography.fontSize.lg,
      fontWeight: '800',
    },
    spendingBreakdown: {
      marginTop: spacing.lg,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: c.neutral[100],
      gap: spacing.sm,
    },
    spendingBarRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    spendingBarLabel: {
      width: 84,
      fontSize: typography.fontSize.xs,
      color: c.neutral[600],
    },
    spendingBarTrack: {
      flex: 1,
      height: 8,
      borderRadius: 4,
      backgroundColor: c.neutral[100],
      overflow: 'hidden',
    },
    spendingBarFill: { height: '100%', borderRadius: 4 },
    spendingBarAmount: {
      width: 72,
      textAlign: 'right',
      fontSize: typography.fontSize.xs,
      fontWeight: '700',
      color: c.dark,
      fontVariant: ['tabular-nums'],
    },
    txList: { marginHorizontal: spacing.lg, backgroundColor: c.neutral[50], borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
    txItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: c.neutral[100] },
    txIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    txType: { fontSize: typography.fontSize.sm, fontWeight: '700', color: c.dark },
    txMetaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2 },
    txDate: { fontSize: typography.fontSize.xs, color: c.neutral[500] },
    txStatusPill: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full },
    txStatusText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
    txAmount: { fontSize: typography.fontSize.base, fontWeight: '700' },
    emptyState: { marginHorizontal: spacing.lg, padding: spacing.xl, backgroundColor: c.neutral[50], borderRadius: radius.lg, alignItems: 'center' },
    emptyIconWrap: { width: 80, height: 80, borderRadius: 40, backgroundColor: c.primary[50], alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
    emptyTitle: { fontSize: typography.fontSize.base, fontWeight: '700', color: c.dark, marginBottom: spacing.xs },
    emptyText: { fontSize: typography.fontSize.sm, color: c.neutral[500], textAlign: 'center', maxWidth: 280 },
  });
}
