import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, radius, spacing, formatXOF } from '@soutra/shared';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

export default function Wallet() {
  const { user } = useAuth();
  const router = useRouter();
  const [balance, setBalance] = useState<number>(0);
  const [locked, setLocked] = useState<number>(0);
  const [walletLoading, setWalletLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hidden, setHidden] = useState(false);
  // Incrémenté à chaque focus de l'écran : force le rechargement de
  // l'historique des transactions (ex. après une recharge / un retrait).
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

  // Recharge le solde et l'historique chaque fois que l'écran reprend le
  // focus — notamment au retour des écrans Recharger / Retirer.
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

  const handleTopup = () => router.push('/recharge');

  const handleWithdraw = () => router.push('/withdraw');

  const handleQuickAction = (action: string) => {
    Alert.alert(action, `Fonctionnalité « ${action} » bientôt disponible.`);
  };

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing['2xl'] }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={s.header}>
          <Text style={s.headerTitle}>Mon Paiya-Pay</Text>
          <Pressable
            hitSlop={10}
            onPress={() => Alert.alert('Paramètres', 'Réglages wallet bientôt disponibles.')}
          >
            <Ionicons name="settings-outline" size={22} color={colors.dark} />
          </Pressable>
        </View>

        <View style={s.balanceCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={s.balanceLabel}>💰 Solde disponible</Text>
            <Pressable hitSlop={10} onPress={() => setHidden(!hidden)}>
              <Ionicons name={hidden ? 'eye-off-outline' : 'eye-outline'} size={20} color="#fff" />
            </Pressable>
          </View>
          <Text style={s.balanceValue}>
            {walletLoading ? '…' : hidden ? '••••• FCFA' : formatXOF(balance)}
          </Text>
          {locked > 0 && <Text style={s.locked}>🔒 {formatXOF(locked)} en séquestre</Text>}

          <View style={s.balanceActions}>
            <ActionBtn label="Recharger" icon="arrow-up-outline" onPress={handleTopup} />
            <View style={s.vsep} />
            <ActionBtn label="Retirer" icon="arrow-down-outline" onPress={handleWithdraw} />
          </View>
        </View>

        <View style={s.quickRow}>
          {[
            { label: 'Envoyer', icon: 'send-outline' as const },
            { label: 'Demander', icon: 'download-outline' as const },
            { label: 'Split Bill', icon: 'people-outline' as const },
            { label: 'Scanner QR', icon: 'qr-code-outline' as const },
          ].map((q) => (
            <Pressable
              key={q.label}
              style={({ pressed }) => [s.quickItem, pressed && { opacity: 0.6 }]}
              onPress={() => handleQuickAction(q.label)}
            >
              <View style={s.quickIcon}>
                <Ionicons name={q.icon} size={22} color={colors.primary[500]} />
              </View>
              <Text style={s.quickLabel}>{q.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={s.sectionTitle}>Transactions récentes</Text>
        <TransactionHistory userId={user?.id} refreshNonce={refreshNonce} />
      </ScrollView>
    </SafeAreaView>
  );
}

function ActionBtn({ label, icon, onPress }: { label: string; icon: any; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.actionBtn, pressed && { opacity: 0.7 }]}>
      <Ionicons name={icon} size={18} color="#fff" />
      <Text style={s.actionBtnText}>{label}</Text>
    </Pressable>
  );
}

interface Transaction {
  id: string;
  type: string;
  amount_xof: number;
  status: string;
  created_at: string;
  description?: string;
}

function TransactionHistory({
  userId,
  refreshNonce,
}: {
  userId?: string;
  refreshNonce: number;
}) {
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    if (!userId) {
      setLoading(false);
      setTxs([]);
      return;
    }

    (async () => {
      try {
        const { data, error } = await supabase
          .from('transactions')
          .select('id, type, amount_xof, status, created_at, description')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(10);

        if (!mounted) return;

        if (error) {
          console.error('[wallet] tx error:', error);
          setTxs([]);
        } else {
          setTxs((data as Transaction[]) ?? []);
        }
      } catch (err) {
        console.error('[wallet] tx unexpected:', err);
        if (mounted) setTxs([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [userId, refreshNonce]);

  if (loading) {
    return (
      <View style={s.emptyState}>
        <Text style={s.emptyText}>Chargement…</Text>
      </View>
    );
  }
  if (!txs.length) {
    return (
      <View style={s.emptyState}>
        <Text style={s.emptyText}>Aucune transaction pour le moment.</Text>
        <Text style={[s.emptyText, { fontSize: typography.fontSize.xs, marginTop: 4 }]}>
          Recharge ton wallet pour commencer 🚀
        </Text>
      </View>
    );
  }

  return (
    <View style={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
      {txs.map((tx) => (
        <View key={tx.id} style={s.txItem}>
          <View style={{ flex: 1 }}>
            <Text style={s.txType}>{labelForTxType(tx.type)}</Text>
            <Text style={s.txDate}>{new Date(tx.created_at).toLocaleDateString('fr-FR')}</Text>
          </View>
          <Text
            style={[
              s.txAmount,
              isCreditType(tx.type) ? { color: colors.success } : { color: colors.danger },
            ]}
          >
            {isCreditType(tx.type) ? '+' : '-'}
            {formatXOF(tx.amount_xof)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function isCreditType(t: string) {
  return t === 'topup' || t === 'refund' || t === 'escrow_release';
}

function labelForTxType(t: string): string {
  switch (t) {
    case 'topup': return 'Rechargement';
    case 'withdraw': return 'Retrait';
    case 'payment': return 'Paiement';
    case 'transfer': return 'Transfert';
    case 'refund': return 'Remboursement';
    case 'split': return 'Split Bill';
    case 'escrow_hold': return 'Séquestre';
    case 'escrow_release': return 'Libération séquestre';
    case 'fee': return 'Frais';
    default: return t;
  }
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.light },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg },
  headerTitle: { fontSize: typography.fontSize.xl, fontWeight: '700', color: colors.dark },
  balanceCard: {
    marginHorizontal: spacing.lg, padding: spacing.lg, borderRadius: radius.lg,
    backgroundColor: colors.primary[500],
    shadowColor: colors.primary[700], shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6,
  },
  balanceLabel: { color: '#fff', opacity: 0.85, fontSize: typography.fontSize.sm },
  balanceValue: { marginTop: spacing.sm, color: '#fff', fontSize: 36, fontWeight: '700' },
  locked: { marginTop: spacing.xs, color: '#fff', opacity: 0.8, fontSize: typography.fontSize.xs },
  balanceActions: { flexDirection: 'row', marginTop: spacing.lg, alignItems: 'center' },
  vsep: { width: 1, height: 24, backgroundColor: 'rgba(255,255,255,0.3)', marginHorizontal: spacing.md },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  actionBtnText: { color: '#fff', fontWeight: '600', fontSize: typography.fontSize.sm },
  quickRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: spacing.lg, paddingHorizontal: spacing.lg },
  quickItem: { alignItems: 'center', gap: spacing.sm },
  quickIcon: { width: 52, height: 52, borderRadius: radius.full, backgroundColor: colors.primary[50], alignItems: 'center', justifyContent: 'center' },
  quickLabel: { fontSize: typography.fontSize.xs, color: colors.neutral[700], fontWeight: '500' },
  sectionTitle: { marginHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.sm, fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.dark },
  emptyState: { margin: spacing.lg, padding: spacing.xl, backgroundColor: '#fff', borderRadius: radius.lg, alignItems: 'center' },
  emptyText: { color: colors.neutral[500], textAlign: 'center' },
  txItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.neutral[100] },
  txType: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.dark },
  txDate: { fontSize: typography.fontSize.xs, color: colors.neutral[500], marginTop: 2 },
  txAmount: { fontSize: typography.fontSize.base, fontWeight: '700', color: colors.dark },
});
