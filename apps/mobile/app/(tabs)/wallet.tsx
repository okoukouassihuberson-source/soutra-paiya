import { useEffect, useState } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, radius, spacing, formatXOF } from '@soutra/shared';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

export default function Wallet() {
  const { session } = useAuth();
  const [balance, setBalance] = useState<number>(0);
  const [locked, setLocked] = useState<number>(0);
  const [refreshing, setRefreshing] = useState(false);
  const [hidden, setHidden] = useState(false);

  async function load() {
    if (!session) return;
    const { data } = await supabase
      .from('wallets').select('balance_xof, locked_xof').eq('user_id', session.user.id).maybeSingle();
    const row = data as { balance_xof: number; locked_xof: number } | null;
    if (row) { setBalance(row.balance_xof); setLocked(row.locked_xof); }
  }

  useEffect(() => { load(); }, [session]);

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing['2xl'] }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        <View style={s.header}>
          <Text style={s.headerTitle}>Mon Paiya-Pay</Text>
          <Pressable hitSlop={10}><Ionicons name="settings-outline" size={22} color={colors.dark} /></Pressable>
        </View>

        <View style={s.balanceCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={s.balanceLabel}>💰 Solde disponible</Text>
            <Pressable onPress={() => setHidden(!hidden)}>
              <Ionicons name={hidden ? 'eye-off-outline' : 'eye-outline'} size={20} color="#fff" />
            </Pressable>
          </View>
          <Text style={s.balanceValue}>{hidden ? '••••• FCFA' : formatXOF(balance)}</Text>
          {locked > 0 && <Text style={s.locked}>🔒 {formatXOF(locked)} en séquestre</Text>}

          <View style={s.balanceActions}>
            <ActionBtn label="Recharger" icon="arrow-up-outline" onPress={() => {}} />
            <View style={s.vsep} />
            <ActionBtn label="Retirer" icon="arrow-down-outline" onPress={() => {}} />
          </View>
        </View>

        <View style={s.quickRow}>
          {[
            { label: 'Envoyer', icon: 'send-outline' as const },
            { label: 'Demander', icon: 'download-outline' as const },
            { label: 'Split Bill', icon: 'people-outline' as const },
            { label: 'Scanner QR', icon: 'qr-code-outline' as const },
          ].map((q) => (
            <Pressable key={q.label} style={s.quickItem}>
              <View style={s.quickIcon}><Ionicons name={q.icon} size={22} color={colors.primary[500]} /></View>
              <Text style={s.quickLabel}>{q.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={s.sectionTitle}>Activité récente</Text>
        <View style={s.emptyState}>
          <Text style={s.emptyText}>Aucune transaction pour le moment.</Text>
          <Text style={[s.emptyText, { fontSize: typography.fontSize.xs, marginTop: 4 }]}>Recharge ton wallet pour commencer 🚀</Text>
        </View>
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
});
