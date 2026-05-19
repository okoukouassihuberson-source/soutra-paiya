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
import { createSplit } from '@/lib/splits';

type Mode = 'equal' | 'custom';
const MIN_SHARE = 100;
const PHONE_RE = /^\+225[0-9]{10}$/;

interface Row {
  phone: string;
  amount: string;
}

export default function SplitCreate() {
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [total, setTotal] = useState('');
  const [mode, setMode] = useState<Mode>('equal');
  const [rows, setRows] = useState<Row[]>([{ phone: '+225', amount: '' }]);
  const [submitting, setSubmitting] = useState(false);

  const totalNum = parseInt(total || '0', 10);
  const validRows = rows.filter((r) => PHONE_RE.test(r.phone));
  // Partage égal : le total est divisé entre les participants + le créateur.
  const equalShare =
    validRows.length > 0 ? Math.floor(totalNum / (validRows.length + 1)) : 0;

  const shareOf = (r: Row): number =>
    mode === 'equal' ? equalShare : parseInt(r.amount || '0', 10);

  const requestedTotal = validRows.reduce((sum, r) => sum + shareOf(r), 0);
  const myShare = totalNum - requestedTotal;

  const updateRow = (i: number, field: keyof Row, value: string) => {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  };
  const addRow = () => setRows((rs) => [...rs, { phone: '+225', amount: '' }]);
  const removeRow = (i: number) =>
    setRows((rs) => (rs.length > 1 ? rs.filter((_, idx) => idx !== i) : rs));

  const handleSend = async () => {
    if (totalNum < MIN_SHARE) {
      Alert.alert('Montant', `Le total doit être d'au moins ${formatXOF(MIN_SHARE)}.`);
      return;
    }
    if (validRows.length === 0) {
      Alert.alert('Participants', 'Ajoute au moins un participant avec un numéro valide.');
      return;
    }
    const phones = validRows.map((r) => r.phone);
    if (new Set(phones).size !== phones.length) {
      Alert.alert('Doublon', 'Un même numéro apparaît plusieurs fois.');
      return;
    }
    const participants = validRows.map((r) => ({
      phone: r.phone,
      amountXof: shareOf(r),
    }));
    if (participants.some((p) => p.amountXof < MIN_SHARE)) {
      Alert.alert('Montant', `Chaque part doit être d'au moins ${formatXOF(MIN_SHARE)}.`);
      return;
    }
    if (mode === 'custom' && requestedTotal > totalNum) {
      Alert.alert('Montant', 'La somme des parts dépasse le total de l\'addition.');
      return;
    }

    try {
      setSubmitting(true);
      const splitId = await createSplit({
        title: title.trim() || undefined,
        totalXof: totalNum,
        participants,
      });
      Alert.alert(
        'Partage créé 🎉',
        `${participants.length} demande(s) de paiement envoyée(s).`,
        [
          {
            text: 'Voir le suivi',
            onPress: () => router.replace({ pathname: '/split', params: { id: splitId } }),
          },
        ],
      );
    } catch (err: any) {
      Alert.alert('Erreur', err?.message ?? 'Impossible de créer le partage.');
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
          <Text style={s.headerTitle}>Partager une addition</Text>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['2xl'] }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={s.label}>Intitulé (optionnel)</Text>
          <TextInput
            style={s.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Ex : Resto de vendredi"
            placeholderTextColor={colors.neutral[400]}
            maxLength={60}
            editable={!submitting}
          />

          <Text style={s.label}>Montant total de l'addition</Text>
          <View style={s.amountRow}>
            <TextInput
              style={s.amountInput}
              value={total}
              onChangeText={(t) => setTotal(t.replace(/[^0-9]/g, ''))}
              placeholder="0"
              placeholderTextColor={colors.neutral[400]}
              keyboardType="number-pad"
              maxLength={7}
              editable={!submitting}
            />
            <Text style={s.amountCurrency}>FCFA</Text>
          </View>

          <View style={s.modeRow}>
            {(['equal', 'custom'] as Mode[]).map((m) => (
              <Pressable
                key={m}
                style={[s.modeBtn, mode === m && s.modeBtnActive]}
                onPress={() => setMode(m)}
                disabled={submitting}
              >
                <Text style={[s.modeText, mode === m && s.modeTextActive]}>
                  {m === 'equal' ? 'Égal' : 'Personnalisé'}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={s.label}>Participants</Text>
          {rows.map((r, i) => {
            const phoneOk = PHONE_RE.test(r.phone);
            return (
              <View key={i} style={s.row}>
                <View style={{ flex: 1, gap: spacing.sm }}>
                  <TextInput
                    style={[s.rowInput, r.phone.length > 4 && !phoneOk && s.rowInputError]}
                    value={r.phone}
                    onChangeText={(t) => updateRow(i, 'phone', t.replace(/[^0-9+]/g, ''))}
                    placeholder="+225XXXXXXXXXX"
                    placeholderTextColor={colors.neutral[400]}
                    keyboardType="phone-pad"
                    maxLength={14}
                    editable={!submitting}
                  />
                  {mode === 'custom' ? (
                    <View style={s.shareInputRow}>
                      <TextInput
                        style={s.shareInput}
                        value={r.amount}
                        onChangeText={(t) => updateRow(i, 'amount', t.replace(/[^0-9]/g, ''))}
                        placeholder="Part"
                        placeholderTextColor={colors.neutral[400]}
                        keyboardType="number-pad"
                        maxLength={7}
                        editable={!submitting}
                      />
                      <Text style={s.shareCurrency}>FCFA</Text>
                    </View>
                  ) : (
                    <Text style={s.shareEqual}>
                      Part : {phoneOk ? formatXOF(equalShare) : '—'}
                    </Text>
                  )}
                </View>
                <Pressable
                  hitSlop={8}
                  onPress={() => removeRow(i)}
                  disabled={submitting || rows.length === 1}
                  style={{ opacity: rows.length === 1 ? 0.3 : 1 }}
                >
                  <Ionicons name="close-circle" size={24} color={colors.neutral[400]} />
                </Pressable>
              </View>
            );
          })}

          <Pressable style={s.addBtn} onPress={addRow} disabled={submitting}>
            <Ionicons name="add" size={18} color={colors.primary[500]} />
            <Text style={s.addBtnText}>Ajouter une personne</Text>
          </Pressable>

          <View style={s.summary}>
            <View style={s.summaryLine}>
              <Text style={s.summaryLabel}>Demandé aux participants</Text>
              <Text style={s.summaryValue}>{formatXOF(requestedTotal)}</Text>
            </View>
            <View style={s.summaryLine}>
              <Text style={s.summaryLabel}>Ta part</Text>
              <Text style={[s.summaryValue, myShare < 0 && { color: colors.danger }]}>
                {formatXOF(myShare)}
              </Text>
            </View>
          </View>
        </ScrollView>

        <View style={s.footer}>
          <Pressable
            style={({ pressed }) => [s.btn, submitting && s.btnDisabled, pressed && { opacity: 0.85 }]}
            onPress={handleSend}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.btnText}>Envoyer les demandes</Text>
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
  modeRow: {
    flexDirection: 'row',
    marginTop: spacing.md,
    backgroundColor: colors.neutral[100],
    borderRadius: radius.full,
    padding: 4,
  },
  modeBtn: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.full, alignItems: 'center' },
  modeBtnActive: { backgroundColor: colors.primary[500] },
  modeText: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.neutral[600] },
  modeTextActive: { color: '#fff' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  rowInput: {
    backgroundColor: '#fff',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.fontSize.sm,
    color: colors.dark,
  },
  rowInputError: { borderColor: colors.danger },
  shareInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: '#fff',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    paddingHorizontal: spacing.md,
  },
  shareInput: { flex: 1, paddingVertical: spacing.sm, fontSize: typography.fontSize.sm, color: colors.dark },
  shareCurrency: { fontSize: typography.fontSize.xs, color: colors.neutral[500] },
  shareEqual: { fontSize: typography.fontSize.xs, color: colors.neutral[600], paddingLeft: spacing.xs },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.primary[200],
    borderStyle: 'dashed',
  },
  addBtnText: { color: colors.primary[500], fontWeight: '600', fontSize: typography.fontSize.sm },
  summary: {
    marginTop: spacing.xl,
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    padding: spacing.lg,
    gap: spacing.sm,
  },
  summaryLine: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryLabel: { fontSize: typography.fontSize.sm, color: colors.neutral[600] },
  summaryValue: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.dark },
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
