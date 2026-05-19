import { useEffect, useState } from 'react';
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
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { requestWithdrawal, type WithdrawParams } from '@/lib/paystack';

type Provider = WithdrawParams['provider'];

// Paystack ne propose le payout XOF que pour MTN, Orange et Wave (Moov exclu).
const PROVIDERS: { id: Provider; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'orange', label: 'Orange Money', icon: 'phone-portrait-outline' },
  { id: 'mtn', label: 'MTN MoMo', icon: 'phone-portrait-outline' },
  { id: 'wave', label: 'Wave', icon: 'phone-portrait-outline' },
];

const MIN_XOF = 100;
const PHONE_RE = /^\+225[0-9]{10}$/;

export default function Withdraw() {
  const router = useRouter();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(0);
  const [kycVerified, setKycVerified] = useState(false);

  const [amount, setAmount] = useState('');
  const [provider, setProvider] = useState<Provider | null>(null);
  const [phone, setPhone] = useState(
    user?.phone ? `+${user.phone.replace(/^\+/, '')}` : '+225',
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!user?.id) {
        setLoading(false);
        return;
      }
      try {
        const [walletRes, profileRes] = await Promise.all([
          supabase.from('wallets').select('balance_xof').eq('user_id', user.id).maybeSingle(),
          supabase.from('profiles').select('kyc_status').eq('id', user.id).maybeSingle(),
        ]);
        if (!mounted) return;
        setBalance((walletRes.data as any)?.balance_xof ?? 0);
        setKycVerified((profileRes.data as any)?.kyc_status === 'verified');
      } catch (err) {
        console.error('[withdraw] load error:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  const amountNum = parseInt(amount || '0', 10);
  const amountValid = amountNum >= MIN_XOF && amountNum <= balance;
  const phoneValid = PHONE_RE.test(phone);
  const canSubmit = kycVerified && amountValid && phoneValid && !!provider && !submitting;

  const handleWithdraw = async () => {
    if (!provider || !amountValid || !phoneValid) return;
    try {
      setSubmitting(true);
      const result = await requestWithdrawal({ amountXof: amountNum, provider, phone });
      const msg =
        result.status === 'success'
          ? `${formatXOF(amountNum)} ont été envoyés vers ton compte ${provider.toUpperCase()}.`
          : `Ton retrait de ${formatXOF(amountNum)} est en cours de traitement.`;
      Alert.alert('Retrait enregistré', msg, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert('Retrait impossible', err?.message ?? 'Une erreur est survenue.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <ActivityIndicator size="large" color={colors.primary[500]} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

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
          <Text style={s.headerTitle}>Retirer</Text>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['2xl'] }}
          keyboardShouldPersistTaps="handled"
        >
          {!kycVerified && (
            <Pressable style={s.kycBanner} onPress={() => router.push('/kyc')}>
              <Ionicons name="alert-circle" size={22} color={colors.dark} />
              <Text style={s.kycText}>
                Vérification d'identité requise pour retirer. Touche ici pour compléter ton KYC.
              </Text>
            </Pressable>
          )}

          <View style={s.balanceLine}>
            <Text style={s.balanceLabel}>Solde disponible</Text>
            <Text style={s.balanceValue}>{formatXOF(balance)}</Text>
          </View>

          <Text style={s.label}>Montant à retirer</Text>
          <View style={s.amountInputRow}>
            <TextInput
              style={s.amountInput}
              value={amount}
              onChangeText={(t) => setAmount(t.replace(/[^0-9]/g, ''))}
              placeholder="0"
              placeholderTextColor={colors.neutral[400]}
              keyboardType="number-pad"
              maxLength={7}
              editable={!submitting && kycVerified}
            />
            <Text style={s.amountCurrency}>FCFA</Text>
          </View>
          {amount.length > 0 && !amountValid && (
            <Text style={s.errorHint}>
              {amountNum > balance
                ? 'Montant supérieur à ton solde.'
                : `Minimum ${formatXOF(MIN_XOF)}.`}
            </Text>
          )}

          <Text style={s.label}>Opérateur mobile money</Text>
          <View style={s.providerGrid}>
            {PROVIDERS.map((p) => {
              const active = provider === p.id;
              return (
                <Pressable
                  key={p.id}
                  style={[s.providerChip, active && s.providerChipActive]}
                  onPress={() => setProvider(p.id)}
                  disabled={submitting || !kycVerified}
                >
                  <Ionicons
                    name={p.icon}
                    size={18}
                    color={active ? colors.primary[500] : colors.neutral[500]}
                  />
                  <Text style={[s.providerText, active && s.providerTextActive]}>
                    {p.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={s.label}>Numéro mobile money</Text>
          <TextInput
            style={s.phoneInput}
            value={phone}
            onChangeText={(t) => setPhone(t.replace(/[^0-9+]/g, ''))}
            placeholder="+225XXXXXXXXXX"
            placeholderTextColor={colors.neutral[400]}
            keyboardType="phone-pad"
            maxLength={14}
            editable={!submitting && kycVerified}
          />
          {phone.length > 4 && !phoneValid && (
            <Text style={s.errorHint}>Format attendu : +225 suivi de 10 chiffres.</Text>
          )}

          <View style={s.infoBox}>
            <Ionicons name="time-outline" size={20} color={colors.primary[500]} />
            <Text style={s.infoText}>
              Le transfert est traité par Paystack. Ton solde est débité immédiatement ;
              en cas d'échec, il est automatiquement recrédité.
            </Text>
          </View>
        </ScrollView>

        <View style={s.footer}>
          <Pressable
            style={({ pressed }) => [
              s.payBtn,
              !canSubmit && s.payBtnDisabled,
              pressed && { opacity: 0.85 },
            ]}
            onPress={handleWithdraw}
            disabled={!canSubmit}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.payBtnText}>
                {amountValid ? `Retirer ${formatXOF(amountNum)}` : 'Retirer'}
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
  kycBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.warning,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  kycText: { flex: 1, fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.dark },
  balanceLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },
  balanceLabel: { fontSize: typography.fontSize.sm, color: colors.neutral[600] },
  balanceValue: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.dark },
  label: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.dark,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  amountInput: { flex: 1, fontSize: 28, fontWeight: '700', color: colors.dark, padding: 0 },
  amountCurrency: { fontSize: typography.fontSize.base, fontWeight: '700', color: colors.neutral[500] },
  errorHint: { marginTop: spacing.xs, fontSize: typography.fontSize.xs, color: colors.danger },
  providerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  providerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.neutral[300],
    backgroundColor: '#fff',
  },
  providerChipActive: { borderColor: colors.primary[500], backgroundColor: colors.primary[50] },
  providerText: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.neutral[700] },
  providerTextActive: { color: colors.primary[500] },
  phoneInput: {
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: typography.fontSize.base,
    color: colors.dark,
  },
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
