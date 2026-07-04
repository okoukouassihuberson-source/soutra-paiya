import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, Pressable, TextInput, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, radius, spacing, formatXOF, computeWithdrawalFee } from '@soutra/shared';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { requestWithdrawal, type WithdrawParams } from '@/lib/geniuspay';
import { ScreenHeader } from '@/components/ScreenHeader';

type Provider = WithdrawParams['provider'];

const PROVIDERS: { id: Provider; label: string; bg: string; color: string }[] = [
  { id: 'orange', label: 'Orange Money', bg: '#fff7ed', color: '#ea580c' },
  { id: 'mtn', label: 'MTN MoMo', bg: '#fefce8', color: '#ca8a04' },
  { id: 'wave', label: 'Wave', bg: '#eff6ff', color: '#2563eb' },
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
  const [phone, setPhone] = useState(user?.phone ? `+${user.phone.replace(/^\+/, '')}` : '+225');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!user?.id) { setLoading(false); return; }
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
    return () => { mounted = false; };
  }, [user?.id]);

  const amountNum = parseInt(amount || '0', 10);
  const amountValid = amountNum >= MIN_XOF && amountNum <= balance;
  const phoneValid = PHONE_RE.test(phone);
  const canSubmit = kycVerified && amountValid && phoneValid && !!provider && !submitting;
  const fee = useMemo(() => computeWithdrawalFee(amountNum), [amountNum]);

  const handleWithdraw = async () => {
    if (!provider || !amountValid || !phoneValid) return;
    try {
      setSubmitting(true);
      const result = await requestWithdrawal({ amountXof: amountNum, provider, phone });
      const msg = result.status === 'success'
        ? `${formatXOF(fee.netXof)} ont été envoyés vers ton compte ${provider.toUpperCase()} (commission 1 % : ${formatXOF(fee.feeXof)}).`
        : `Ton retrait de ${formatXOF(amountNum)} est en cours de traitement.`;
      Alert.alert('Retrait enregistré', msg, [{ text: 'OK', onPress: () => router.back() }]);
    } catch (err: any) {
      Alert.alert('Retrait impossible', err?.message ?? 'Une erreur est survenue.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <ScreenHeader title="Retirer" />
        <ActivityIndicator size="large" color={colors.primary[500]} style={{ flex: 1, marginTop: spacing.xl }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScreenHeader title="Retirer" subtitle="Vers Orange, MTN ou Wave" />

        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['2xl'] }} keyboardShouldPersistTaps="handled">
          {!kycVerified && (
            <Pressable
              style={({ pressed }) => [s.kycBanner, pressed && { opacity: 0.85 }]}
              onPress={() => router.push('/kyc')}
            >
              <View style={s.kycIconWrap}>
                <Ionicons name="alert-circle" size={20} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.kycTitle}>Vérification d'identité requise</Text>
                <Text style={s.kycSub}>Touche pour compléter ton KYC et débloquer les retraits.</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.dark} />
            </Pressable>
          )}

          {/* Balance card */}
          <View style={s.balanceCard}>
            <Text style={s.balanceLabel}>Solde disponible</Text>
            <Text style={s.balanceValue}>{formatXOF(balance)}</Text>
          </View>

          {/* Amount */}
          <View style={s.sectionTitleRow}>
            <View style={s.sectionAccent} />
            <Text style={s.sectionTitle}>Montant à retirer</Text>
          </View>
          <View style={[s.fieldCard, amount.length > 0 && !amountValid && s.fieldCardError]}>
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
              {amountNum > balance ? `Solde insuffisant (${formatXOF(balance)}).` : `Minimum ${formatXOF(MIN_XOF)}.`}
            </Text>
          )}
          {amountValid && (
            <View style={s.feeBox}>
              <Text style={s.feeBoxText}>
                Commission 1 % : <Text style={s.feeBoxAmount}>{formatXOF(fee.feeXof)}</Text>
              </Text>
              <Text style={s.feeBoxText}>
                Tu recevras <Text style={s.feeBoxAmount}>{formatXOF(fee.netXof)}</Text>
              </Text>
            </View>
          )}

          {/* Provider */}
          <View style={s.sectionTitleRow}>
            <View style={s.sectionAccent} />
            <Text style={s.sectionTitle}>Opérateur mobile money</Text>
          </View>
          <View style={s.providerGrid}>
            {PROVIDERS.map((p) => {
              const active = provider === p.id;
              return (
                <Pressable
                  key={p.id}
                  style={({ pressed }) => [
                    s.providerChip,
                    { backgroundColor: active ? p.bg : '#fff', borderColor: active ? p.color : colors.neutral[200] },
                    pressed && { transform: [{ scale: 0.97 }] },
                  ]}
                  onPress={() => setProvider(p.id)}
                  disabled={submitting || !kycVerified}
                >
                  <View style={[s.providerDot, { backgroundColor: p.color }]} />
                  <Text style={[s.providerText, { color: active ? p.color : colors.neutral[700] }]}>
                    {p.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Phone */}
          <View style={s.sectionTitleRow}>
            <View style={s.sectionAccent} />
            <Text style={s.sectionTitle}>Numéro mobile money</Text>
          </View>
          <View style={[s.fieldCard, phone.length > 4 && !phoneValid && s.fieldCardError]}>
            <Ionicons name="call-outline" size={18} color={colors.neutral[500]} />
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
          </View>
          {phone.length > 4 && !phoneValid && (
            <Text style={s.errorHint}>Format attendu : +225 suivi de 10 chiffres.</Text>
          )}

          {/* Info */}
          <View style={s.infoBox}>
            <View style={s.infoIconWrap}>
              <Ionicons name="time-outline" size={18} color={colors.primary[500]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.infoTitle}>Traitement instantané</Text>
              <Text style={s.infoText}>
                Ton solde est débité immédiatement. En cas d'échec, il est automatiquement recrédité.
                Les retraits sont soumis à une commission fixe de 1 %.
              </Text>
            </View>
          </View>
        </ScrollView>

        <View style={s.footer}>
          <Pressable
            style={({ pressed }) => [
              s.payBtn,
              !canSubmit && s.payBtnDisabled,
              pressed && canSubmit && { transform: [{ scale: 0.98 }], opacity: 0.92 },
            ]}
            onPress={handleWithdraw}
            disabled={!canSubmit}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="arrow-down-circle" size={18} color="#fff" />
                <Text style={s.payBtnText}>
                  {amountValid ? `Retirer ${formatXOF(amountNum)}` : 'Saisis un montant'}
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
  kycBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: '#fef3c7', borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.lg,
    borderWidth: 1, borderColor: '#fde68a',
  },
  kycIconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#d97706', alignItems: 'center', justifyContent: 'center' },
  kycTitle: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.dark },
  kycSub: { fontSize: typography.fontSize.xs, color: colors.neutral[600], marginTop: 2 },
  balanceCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: radius.lg, padding: spacing.lg,
    elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 },
  },
  balanceLabel: { fontSize: typography.fontSize.sm, color: colors.neutral[500], fontWeight: '600' },
  balanceValue: { fontSize: typography.fontSize.xl, fontWeight: '700', color: colors.dark, letterSpacing: -0.3 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg, marginBottom: spacing.sm },
  sectionAccent: { width: 4, height: 16, borderRadius: 2, backgroundColor: colors.primary[500] },
  sectionTitle: { flex: 1, fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.dark },
  fieldCard: {
    flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm,
    backgroundColor: '#fff', borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.neutral[200],
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
  },
  fieldCardError: { borderColor: colors.danger },
  amountInput: { flex: 1, fontSize: 28, fontWeight: '700', color: colors.dark, padding: 0 },
  amountCurrency: { fontSize: typography.fontSize.base, fontWeight: '700', color: colors.neutral[500] },
  feeBox: {
    marginTop: spacing.sm,
    backgroundColor: colors.neutral[50],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  feeBoxText: { fontSize: typography.fontSize.xs, color: colors.neutral[600] },
  feeBoxAmount: { fontWeight: '800', color: colors.dark },
  phoneInput: { flex: 1, fontSize: typography.fontSize.base, color: colors.dark, padding: 0, paddingVertical: 4 },
  errorHint: { marginTop: spacing.xs, fontSize: typography.fontSize.xs, color: colors.danger, fontWeight: '600' },
  providerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  providerChip: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    borderRadius: radius.lg, borderWidth: 1.5,
  },
  providerDot: { width: 10, height: 10, borderRadius: 5 },
  providerText: { fontSize: typography.fontSize.sm, fontWeight: '700' },
  infoBox: { flexDirection: 'row', gap: spacing.md, backgroundColor: '#fff', borderRadius: radius.lg, padding: spacing.md, marginTop: spacing.xl, borderWidth: 1, borderColor: colors.neutral[200] },
  infoIconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary[50], alignItems: 'center', justifyContent: 'center' },
  infoTitle: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.dark, marginBottom: 2 },
  infoText: { fontSize: typography.fontSize.xs, color: colors.neutral[600], lineHeight: 18 },
  footer: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.neutral[100], backgroundColor: colors.light },
  payBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.primary[500], borderRadius: radius.full, paddingVertical: spacing.lg,
    shadowColor: colors.primary[500], shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  payBtnDisabled: { opacity: 0.4, shadowOpacity: 0 },
  payBtnText: { fontSize: typography.fontSize.base, fontWeight: '700', color: '#fff' },
});
