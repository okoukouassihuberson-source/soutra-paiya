import { useEffect, useState } from 'react';
import { ScrollView, View, Text, Pressable, TextInput, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, radius, spacing, formatXOF } from '@soutra/shared';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { lookupRecipient, sendMoney } from '@/lib/wallet';
import { hasPaymentPin } from '@/lib/security';
import { PinPrompt } from '@/components/PinPrompt';
import { ScreenHeader } from '@/components/ScreenHeader';

const MIN_XOF = 100;
const PHONE_RE = /^\+225[0-9]{10}$/;

export default function Send() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ phone?: string; amount?: string }>();

  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(0);
  const [phone, setPhone] = useState(params.phone || '+225');
  const [amount, setAmount] = useState(params.amount || '');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [hasPin, setHasPin] = useState(false);
  const [pinVisible, setPinVisible] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!user?.id) { setLoading(false); return; }
      try {
        const [walletRes, pin] = await Promise.all([
          supabase.from('wallets').select('balance_xof').eq('user_id', user.id).maybeSingle(),
          hasPaymentPin(),
        ]);
        if (mounted) {
          setBalance((walletRes.data as any)?.balance_xof ?? 0);
          setHasPin(pin);
        }
      } catch (err) {
        console.error('[send] load:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [user?.id]);

  const amountNum = parseInt(amount || '0', 10);
  const amountValid = amountNum >= MIN_XOF && amountNum <= balance;
  const phoneValid = PHONE_RE.test(phone);
  const canSubmit = amountValid && phoneValid && !submitting;

  const doSend = async () => {
    try {
      setSubmitting(true);
      const result = await sendMoney({
        recipientPhone: phone,
        amountXof: amountNum,
        note: note.trim() || undefined,
      });
      Alert.alert('Transfert réussi 🎉', `${formatXOF(amountNum)} envoyés à ${result.recipientName}.`, [{ text: 'OK', onPress: () => router.back() }]);
    } catch (err: any) {
      Alert.alert('Échec du transfert', err?.message ?? 'Une erreur est survenue.');
    } finally {
      setSubmitting(false);
    }
  };

  const gatedSend = () => {
    if (hasPin) setPinVisible(true);
    else doSend();
  };

  const handleContinue = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const recipient = await lookupRecipient(phone);
    setSubmitting(false);
    if (!recipient) {
      Alert.alert('Destinataire introuvable', 'Aucun compte Soutra-Playce n\'est associé à ce numéro.');
      return;
    }
    Alert.alert('Confirmer le transfert', `Envoyer ${formatXOF(amountNum)} à ${recipient.name} ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Envoyer', onPress: gatedSend },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <ScreenHeader title="Envoyer" />
        <ActivityIndicator size="large" color={colors.primary[500]} style={{ flex: 1, marginTop: spacing.xl }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScreenHeader title="Envoyer" subtitle="Transfert instantané à un autre user" />

        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['2xl'] }} keyboardShouldPersistTaps="handled">
          <View style={s.balanceCard}>
            <Text style={s.balanceLabel}>Solde disponible</Text>
            <Text style={s.balanceValue}>{formatXOF(balance)}</Text>
          </View>

          {/* Recipient */}
          <View style={s.sectionTitleRow}>
            <View style={s.sectionAccent} />
            <Text style={s.sectionTitle}>Numéro du destinataire</Text>
          </View>
          <View style={[s.fieldCard, phone.length > 4 && !phoneValid && s.fieldCardError]}>
            <Ionicons name="person-outline" size={18} color={colors.neutral[500]} />
            <TextInput
              style={s.textField}
              value={phone}
              onChangeText={(t) => setPhone(t.replace(/[^0-9+]/g, ''))}
              placeholder="+225XXXXXXXXXX"
              placeholderTextColor={colors.neutral[400]}
              keyboardType="phone-pad"
              maxLength={14}
              editable={!submitting}
            />
            <Pressable
              onPress={() => router.push('/scan')}
              hitSlop={6}
              style={s.scanShortcut}
            >
              <Ionicons name="qr-code" size={18} color={colors.primary[600]} />
            </Pressable>
          </View>
          {phone.length > 4 && !phoneValid && (
            <Text style={s.errorHint}>Format attendu : +225 suivi de 10 chiffres.</Text>
          )}

          {/* Amount */}
          <View style={s.sectionTitleRow}>
            <View style={s.sectionAccent} />
            <Text style={s.sectionTitle}>Montant</Text>
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
              editable={!submitting}
            />
            <Text style={s.amountCurrency}>FCFA</Text>
          </View>
          {amount.length > 0 && !amountValid && (
            <Text style={s.errorHint}>
              {amountNum > balance ? `Solde insuffisant (${formatXOF(balance)}).` : `Minimum ${formatXOF(MIN_XOF)}.`}
            </Text>
          )}

          {/* Note */}
          <View style={s.sectionTitleRow}>
            <View style={s.sectionAccent} />
            <Text style={s.sectionTitle}>Note (optionnelle)</Text>
          </View>
          <View style={s.fieldCard}>
            <TextInput
              style={s.textField}
              value={note}
              onChangeText={setNote}
              placeholder="Ex : remboursement, cadeau…"
              placeholderTextColor={colors.neutral[400]}
              maxLength={140}
              editable={!submitting}
            />
          </View>

          <View style={s.infoBox}>
            <View style={s.infoIconWrap}>
              <Ionicons name="warning-outline" size={18} color="#d97706" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.infoTitle}>Transfert irréversible</Text>
              <Text style={s.infoText}>
                Vérifie bien le numéro — un transfert envoyé ne peut pas être annulé.
              </Text>
            </View>
          </View>
        </ScrollView>

        <View style={s.footer}>
          <Pressable
            style={({ pressed }) => [
              s.sendBtn,
              !canSubmit && s.sendBtnDisabled,
              pressed && canSubmit && { transform: [{ scale: 0.98 }], opacity: 0.92 },
            ]}
            onPress={handleContinue}
            disabled={!canSubmit}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="send" size={16} color="#fff" />
                <Text style={s.sendBtnText}>
                  {amountValid ? `Envoyer ${formatXOF(amountNum)}` : 'Envoyer'}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
      <PinPrompt
        visible={pinVisible}
        title="Confirme ton envoi"
        onSuccess={() => { setPinVisible(false); doSend(); }}
        onCancel={() => setPinVisible(false)}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.light },
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
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: '#fff', borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.neutral[200],
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
  },
  fieldCardError: { borderColor: colors.danger },
  textField: { flex: 1, fontSize: typography.fontSize.base, color: colors.dark, padding: 0, paddingVertical: 4 },
  scanShortcut: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary[50], alignItems: 'center', justifyContent: 'center' },
  amountInput: { flex: 1, fontSize: 28, fontWeight: '700', color: colors.dark, padding: 0 },
  amountCurrency: { fontSize: typography.fontSize.base, fontWeight: '700', color: colors.neutral[500] },
  errorHint: { marginTop: spacing.xs, fontSize: typography.fontSize.xs, color: colors.danger, fontWeight: '600' },
  infoBox: { flexDirection: 'row', gap: spacing.md, backgroundColor: '#fef3c7', borderRadius: radius.lg, padding: spacing.md, marginTop: spacing.xl, borderWidth: 1, borderColor: '#fde68a' },
  infoIconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  infoTitle: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.dark, marginBottom: 2 },
  infoText: { fontSize: typography.fontSize.xs, color: colors.neutral[700], lineHeight: 18 },
  footer: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.neutral[100], backgroundColor: colors.light },
  sendBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.primary[500], borderRadius: radius.full, paddingVertical: spacing.lg,
    shadowColor: colors.primary[500], shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  sendBtnDisabled: { opacity: 0.4, shadowOpacity: 0 },
  sendBtnText: { fontSize: typography.fontSize.base, fontWeight: '700', color: '#fff' },
});
