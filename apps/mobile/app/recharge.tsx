import { useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, radius, spacing, formatXOF } from '@soutra/shared';
import { payWithPaystack } from '@/lib/paystack';

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
      const result = await payWithPaystack({ purpose: 'topup', amountXof: amountNum });

      if (result.status === 'success') {
        Alert.alert(
          'Recharge réussie 🎉',
          `Ton wallet a été crédité de ${formatXOF(amountNum)}.`,
          [{ text: 'OK', onPress: () => router.back() }],
        );
      } else if (result.status === 'pending') {
        Alert.alert(
          'Paiement en cours',
          'Ton paiement est en cours de validation. Ton solde sera mis à jour sous peu.',
          [{ text: 'OK', onPress: () => router.back() }],
        );
      } else {
        Alert.alert(
          'Paiement non abouti',
          "La recharge n'a pas été complétée. Aucun montant n'a été débité.",
        );
      }
    } catch (err: any) {
      Alert.alert('Erreur', err?.message ?? 'Impossible de traiter la recharge.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={s.header}>
          <Pressable hitSlop={10} onPress={() => router.back()} disabled={submitting}>
            <Ionicons name="chevron-back" size={28} color={colors.dark} />
          </Pressable>
          <Text style={s.headerTitle}>Recharger</Text>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['2xl'] }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={s.amountCard}>
            <Text style={s.amountLabel}>Montant à recharger</Text>
            <View style={s.amountRow}>
              <TextInput
                style={s.amountInput}
                value={amount}
                onChangeText={(t) => setAmount(t.replace(/[^0-9]/g, ''))}
                placeholder="0"
                placeholderTextColor="rgba(255,255,255,0.5)"
                keyboardType="number-pad"
                maxLength={7}
                editable={!submitting}
              />
              <Text style={s.amountCurrency}>FCFA</Text>
            </View>
          </View>

          <Text style={s.sectionTitle}>Montants rapides</Text>
          <View style={s.quickRow}>
            {QUICK_AMOUNTS.map((q) => {
              const active = amountNum === q;
              return (
                <Pressable
                  key={q}
                  style={[s.quickChip, active && s.quickChipActive]}
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
            <Ionicons name="shield-checkmark" size={20} color={colors.primary[500]} />
            <Text style={s.infoText}>
              Paiement sécurisé via Paystack — carte bancaire et mobile money
              (Orange Money, MTN MoMo, Wave).
            </Text>
          </View>
        </ScrollView>

        <View style={s.footer}>
          <Pressable
            style={({ pressed }) => [
              s.payBtn,
              (!valid || submitting) && s.payBtnDisabled,
              pressed && { opacity: 0.85 },
            ]}
            onPress={handlePay}
            disabled={!valid || submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.payBtnText}>
                {valid ? `Payer ${formatXOF(amountNum)}` : 'Payer avec Paystack'}
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
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
  amountCard: {
    backgroundColor: colors.primary[500],
    borderRadius: radius.lg,
    padding: spacing.lg,
    shadowColor: colors.primary[700],
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  amountLabel: { color: '#fff', opacity: 0.85, fontSize: typography.fontSize.sm },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  amountInput: { flex: 1, color: '#fff', fontSize: 40, fontWeight: '700', padding: 0 },
  amountCurrency: { color: '#fff', fontSize: typography.fontSize.lg, fontWeight: '700' },
  sectionTitle: {
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    fontSize: typography.fontSize.base,
    fontWeight: '700',
    color: colors.dark,
  },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  quickChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.neutral[300],
    backgroundColor: '#fff',
  },
  quickChipActive: { borderColor: colors.primary[500], backgroundColor: colors.primary[50] },
  quickChipText: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.neutral[700] },
  quickChipTextActive: { color: colors.primary[500] },
  infoBox: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.primary[50],
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.xl,
  },
  infoText: { flex: 1, fontSize: typography.fontSize.sm, color: colors.neutral[700] },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.neutral[100],
    backgroundColor: colors.light,
  },
  payBtn: {
    backgroundColor: colors.primary[500],
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  payBtnDisabled: { opacity: 0.5 },
  payBtnText: { fontSize: typography.fontSize.base, fontWeight: '700', color: '#fff' },
});
