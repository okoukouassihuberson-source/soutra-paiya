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
import { useAuth } from '@/lib/auth-context';
import { lookupRecipient } from '@/lib/wallet';
import { createPaymentRequest } from '@/lib/requests';

const MIN_XOF = 100;
const MAX_XOF = 2_000_000;
const PHONE_RE = /^\+225[0-9]{10}$/;

export default function Request() {
  const router = useRouter();
  const { user } = useAuth();

  const [phone, setPhone] = useState('+225');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const amountNum = parseInt(amount || '0', 10);
  const amountValid = amountNum >= MIN_XOF && amountNum <= MAX_XOF;
  const phoneValid = PHONE_RE.test(phone);
  const canSubmit = amountValid && phoneValid && !submitting;

  const doCreate = async () => {
    if (!user?.id) return;
    try {
      setSubmitting(true);
      const { payerName } = await createPaymentRequest({
        requesterId: user.id,
        payerPhone: phone,
        amountXof: amountNum,
        note: note.trim() || undefined,
      });
      Alert.alert(
        'Demande envoyée',
        `${payerName} a reçu ta demande de ${formatXOF(amountNum)}.`,
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch (err: any) {
      Alert.alert('Erreur', err?.message ?? 'Impossible d\'envoyer la demande.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleContinue = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const payer = await lookupRecipient(phone);
    setSubmitting(false);
    if (!payer) {
      Alert.alert(
        'Destinataire introuvable',
        "Aucun compte Soutra-Explore n'est associé à ce numéro.",
      );
      return;
    }
    Alert.alert(
      'Confirmer la demande',
      `Demander ${formatXOF(amountNum)} à ${payer.name} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Demander', onPress: doCreate },
      ],
    );
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
          <Text style={s.headerTitle}>Demander de l'argent</Text>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['2xl'] }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={s.label}>Numéro de la personne</Text>
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

          <Text style={s.label}>Montant demandé</Text>
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
              Montant entre {formatXOF(MIN_XOF)} et {formatXOF(MAX_XOF)}.
            </Text>
          )}

          <Text style={s.label}>Motif (optionnel)</Text>
          <TextInput
            style={s.noteInput}
            value={note}
            onChangeText={setNote}
            placeholder="Ex : ma part du resto"
            placeholderTextColor={colors.neutral[400]}
            maxLength={140}
            editable={!submitting}
          />

          <View style={s.infoBox}>
            <Ionicons name="notifications-outline" size={20} color={colors.primary[500]} />
            <Text style={s.infoText}>
              La personne reçoit ta demande en temps réel et choisit de payer
              ou de refuser. Rien n'est débité tant qu'elle n'a pas accepté.
            </Text>
          </View>
        </ScrollView>

        <View style={s.footer}>
          <Pressable
            style={({ pressed }) => [
              s.btn,
              !canSubmit && s.btnDisabled,
              pressed && { opacity: 0.85 },
            ]}
            onPress={handleContinue}
            disabled={!canSubmit}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.btnText}>
                {amountValid ? `Demander ${formatXOF(amountNum)}` : 'Envoyer la demande'}
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
  btn: {
    backgroundColor: colors.primary[500],
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { fontSize: typography.fontSize.base, fontWeight: '700', color: '#fff' },
});
