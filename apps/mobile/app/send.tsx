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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, radius, spacing, formatXOF } from '@soutra/shared';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { lookupRecipient, sendMoney } from '@/lib/wallet';
import { hasPaymentPin } from '@/lib/security';
import { PinPrompt } from '@/components/PinPrompt';

const MIN_XOF = 100;
const PHONE_RE = /^\+225[0-9]{10}$/;

export default function Send() {
  const router = useRouter();
  const { user } = useAuth();
  // Pré-remplissage possible depuis le scanner QR (/scan -> /send).
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
      if (!user?.id) {
        setLoading(false);
        return;
      }
      try {
        const [walletRes, pin] = await Promise.all([
          supabase
            .from('wallets')
            .select('balance_xof')
            .eq('user_id', user.id)
            .maybeSingle(),
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
    return () => {
      mounted = false;
    };
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
      Alert.alert(
        'Transfert réussi 🎉',
        `${formatXOF(amountNum)} envoyés à ${result.recipientName}.`,
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch (err: any) {
      Alert.alert('Échec du transfert', err?.message ?? 'Une erreur est survenue.');
    } finally {
      setSubmitting(false);
    }
  };

  // Si un PIN de paiement est défini, on le demande avant d'exécuter l'envoi.
  const gatedSend = () => {
    if (hasPin) setPinVisible(true);
    else doSend();
  };

  const handleContinue = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    // Vérifie le destinataire AVANT de confirmer (éviter une erreur de numéro).
    const recipient = await lookupRecipient(phone);
    setSubmitting(false);
    if (!recipient) {
      Alert.alert(
        'Destinataire introuvable',
        'Aucun compte Soutra-Paiya n\'est associé à ce numéro.',
      );
      return;
    }
    Alert.alert(
      'Confirmer le transfert',
      `Envoyer ${formatXOF(amountNum)} à ${recipient.name} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Envoyer', onPress: gatedSend },
      ],
    );
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
          <Text style={s.headerTitle}>Envoyer</Text>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['2xl'] }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={s.balanceLine}>
            <Text style={s.balanceLabel}>Solde disponible</Text>
            <Text style={s.balanceValue}>{formatXOF(balance)}</Text>
          </View>

          <Text style={s.label}>Numéro du destinataire</Text>
          <TextInput
            style={s.input}
            value={phone}
            onChangeText={(t) => setPhone(t.replace(/[^0-9+]/g, ''))}
            placeholder="+225XXXXXXXXXX"
            placeholderTextColor={colors.neutral[400]}
            keyboardType="phone-pad"
            maxLength={14}
            editable={!submitting}
          />
          {phone.length > 4 && !phoneValid && (
            <Text style={s.errorHint}>Format attendu : +225 suivi de 10 chiffres.</Text>
          )}

          <Text style={s.label}>Montant</Text>
          <View style={s.amountRow}>
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
              {amountNum > balance
                ? 'Montant supérieur à ton solde.'
                : `Minimum ${formatXOF(MIN_XOF)}.`}
            </Text>
          )}

          <Text style={s.label}>Note (optionnel)</Text>
          <TextInput
            style={s.noteInput}
            value={note}
            onChangeText={setNote}
            placeholder="Ex : remboursement, cadeau…"
            placeholderTextColor={colors.neutral[400]}
            maxLength={140}
            editable={!submitting}
          />

          <View style={s.infoBox}>
            <Ionicons name="lock-closed-outline" size={20} color={colors.primary[500]} />
            <Text style={s.infoText}>
              Le transfert est instantané et débite ton wallet immédiatement.
              Vérifie bien le numéro — un transfert envoyé ne peut pas être annulé.
            </Text>
          </View>
        </ScrollView>

        <View style={s.footer}>
          <Pressable
            style={({ pressed }) => [
              s.sendBtn,
              !canSubmit && s.sendBtnDisabled,
              pressed && { opacity: 0.85 },
            ]}
            onPress={handleContinue}
            disabled={!canSubmit}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.sendBtnText}>
                {amountValid ? `Envoyer ${formatXOF(amountNum)}` : 'Envoyer'}
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
      <PinPrompt
        visible={pinVisible}
        title="Confirme ton envoi"
        onSuccess={() => {
          setPinVisible(false);
          doSend();
        }}
        onCancel={() => setPinVisible(false)}
      />
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
  input: {
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: typography.fontSize.base,
    color: colors.dark,
  },
  amountRow: {
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
  noteInput: {
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: typography.fontSize.sm,
    color: colors.dark,
  },
  errorHint: { marginTop: spacing.xs, fontSize: typography.fontSize.xs, color: colors.danger },
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
  sendBtn: {
    backgroundColor: colors.primary[500],
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { fontSize: typography.fontSize.base, fontWeight: '700', color: '#fff' },
});
