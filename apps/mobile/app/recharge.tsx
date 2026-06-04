import { useState } from 'react';
import { ScrollView, View, Text, Pressable, TextInput, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, radius, spacing, formatXOF } from '@soutra/shared';
import { payWithCinetPay } from '@/lib/cinetpay';
import { ScreenHeader } from '@/components/ScreenHeader';

const QUICK_AMOUNTS = [1000, 2000, 5000, 10000, 25000];
const MIN_XOF = 100;
const MAX_XOF = 2_000_000;

export default function Recharge() {
  const router = useRouter();
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const amountNum = parseInt(amount || '0', 10);
  const valid = amountNum >= MIN_XOF && amountNum <= MAX_XOF;

  const handlePay = async () => {
    if (!valid) {
      Alert.alert(
        'Montant invalide',
        `Saisis un montant entre ${formatXOF(MIN_XOF)} et ${formatXOF(MAX_XOF)}.`,
      );
      return;
    }
    try {
      setSubmitting(true);
      const result = await payWithCinetPay({ purpose: 'topup', amountXof: amountNum });
      if (result.status === 'success') {
        Alert.alert('Recharge réussie 🎉', `Ton wallet a été crédité de ${formatXOF(amountNum)}.`, [{ text: 'OK', onPress: () => router.back() }]);
      } else if (result.status === 'pending') {
        Alert.alert('Paiement en cours', 'Ton paiement est en cours de validation. Ton solde sera mis à jour sous peu.', [{ text: 'OK', onPress: () => router.back() }]);
      } else {
        Alert.alert('Paiement non abouti', "La recharge n'a pas été complétée. Aucun montant n'a été débité.");
      }
    } catch (err: any) {
      Alert.alert('Erreur', err?.message ?? 'Impossible de traiter la recharge.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScreenHeader title="Recharger" subtitle="Carte, Orange, MTN, Wave" />

        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['2xl'] }} keyboardShouldPersistTaps="handled">
          {/* Hero amount card avec décor */}
          <View style={s.amountCard}>
            <View style={s.bgCircle1} />
            <View style={s.bgCircle2} />
            <Text style={s.amountLabel}>Montant à recharger</Text>
            <View style={s.amountRow}>
              <TextInput
                style={s.amountInput}
                value={amount}
                onChangeText={(t) => setAmount(t.replace(/[^0-9]/g, ''))}
                placeholder="0"
                placeholderTextColor="rgba(255,255,255,0.4)"
                keyboardType="number-pad"
                maxLength={7}
                editable={!submitting}
              />
              <Text style={s.amountCurrency}>FCFA</Text>
            </View>
            <Text style={s.amountHint}>
              Entre {formatXOF(MIN_XOF)} et {formatXOF(MAX_XOF)}
            </Text>
          </View>

          <View style={s.sectionTitleRow}>
            <View style={s.sectionAccent} />
            <Text style={s.sectionTitle}>Montants rapides</Text>
          </View>
          <View style={s.quickRow}>
            {QUICK_AMOUNTS.map((q) => {
              const active = amountNum === q;
              return (
                <Pressable
                  key={q}
                  style={({ pressed }) => [s.quickChip, active && s.quickChipActive, pressed && { transform: [{ scale: 0.95 }] }]}
                  onPress={() => setAmount(String(q))}
                  disabled={submitting}
                >
                  <Text style={[s.quickChipText, active && s.quickChipTextActive]}>
                    {formatXOF(q)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={s.infoBox}>
            <View style={s.infoIconWrap}>
              <Ionicons name="shield-checkmark" size={18} color={colors.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.infoTitle}>Paiement 100 % sécurisé</Text>
              <Text style={s.infoText}>
                Via Paystack — carte bancaire et mobile money (Orange Money, MTN MoMo, Wave).
              </Text>
            </View>
          </View>
        </ScrollView>

        <View style={s.footer}>
          <Pressable
            style={({ pressed }) => [
              s.payBtn,
              (!valid || submitting) && s.payBtnDisabled,
              pressed && valid && !submitting && { transform: [{ scale: 0.98 }], opacity: 0.92 },
            ]}
            onPress={handlePay}
            disabled={!valid || submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="lock-closed" size={16} color="#fff" />
                <Text style={s.payBtnText}>
                  {valid ? `Payer ${formatXOF(amountNum)}` : 'Saisis un montant'}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.light },
  amountCard: {
    position: 'relative', overflow: 'hidden',
    backgroundColor: colors.primary[500],
    borderRadius: 20, padding: spacing.lg,
    shadowColor: colors.primary[700], shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8,
  },
  bgCircle1: { position: 'absolute', top: -60, right: -60, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.08)' },
  bgCircle2: { position: 'absolute', bottom: -40, left: -40, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.06)' },
  amountLabel: { color: 'rgba(255,255,255,0.85)', fontSize: typography.fontSize.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: spacing.sm, gap: spacing.sm },
  amountInput: { flex: 1, color: '#fff', fontSize: 44, fontWeight: '700', padding: 0, letterSpacing: -0.5 },
  amountCurrency: { color: '#fff', fontSize: typography.fontSize.lg, fontWeight: '700', opacity: 0.85 },
  amountHint: { marginTop: spacing.sm, color: 'rgba(255,255,255,0.7)', fontSize: typography.fontSize.xs },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xl, marginBottom: spacing.md },
  sectionAccent: { width: 4, height: 18, borderRadius: 2, backgroundColor: colors.primary[500] },
  sectionTitle: { flex: 1, fontSize: typography.fontSize.base, fontWeight: '700', color: colors.dark },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  quickChip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.neutral[200], backgroundColor: '#fff',
  },
  quickChipActive: { borderColor: colors.primary[500], backgroundColor: colors.primary[50] },
  quickChipText: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.neutral[700] },
  quickChipTextActive: { color: colors.primary[600] },
  infoBox: { flexDirection: 'row', gap: spacing.md, backgroundColor: '#fff', borderRadius: radius.lg, padding: spacing.md, marginTop: spacing.xl, borderWidth: 1, borderColor: colors.neutral[200] },
  infoIconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#dcfce7', alignItems: 'center', justifyContent: 'center' },
  infoTitle: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.dark, marginBottom: 2 },
  infoText: { fontSize: typography.fontSize.xs, color: colors.neutral[600], lineHeight: 18 },
  footer: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.neutral[100], backgroundColor: colors.light },
  payBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.primary[500], borderRadius: radius.full,
    paddingVertical: spacing.lg,
    shadowColor: colors.primary[500], shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  payBtnDisabled: { opacity: 0.4, shadowOpacity: 0 },
  payBtnText: { fontSize: typography.fontSize.base, fontWeight: '700', color: '#fff' },
});
