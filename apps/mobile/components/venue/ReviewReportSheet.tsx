import { useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { typography, radius, spacing, type ColorPalette } from '@soutra/shared';
import { useColors } from '@/lib/theme';
import {
  submitReviewReport,
  REVIEW_REPORT_KIND_LABELS,
  type ReviewReportKind,
} from '@/lib/reviews';

interface Props {
  visible: boolean;
  onClose: () => void;
  reviewId: string;
}

const KINDS: ReviewReportKind[] = ['spam', 'offensive', 'fake', 'irrelevant', 'other'];

/** Bottom sheet "Signaler un avis" — calque ReportSheet.tsx (venues). */
export function ReviewReportSheet({ visible, onClose, reviewId }: Props) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const [selected, setSelected] = useState<ReviewReportKind | null>(null);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setSelected(null);
    setDetails('');
    setSubmitting(false);
  };

  const close = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const canSubmit = !!selected && !submitting;

  const submit = async () => {
    if (!selected) return;
    try {
      setSubmitting(true);
      const res = await submitReviewReport({ reviewId, kind: selected, details: details.trim() || undefined });
      if (!res.ok && res.reason === 'ALREADY_REPORTED') {
        Alert.alert('Déjà signalé', "Tu as déjà signalé cet avis. L'équipe traite ton signalement.");
      } else {
        Alert.alert('Signalement envoyé ✓', "Merci ! L'équipe Soutra-Playce va examiner cet avis.");
      }
      reset();
      onClose();
    } catch (err: any) {
      const code = err?.message ?? '';
      const msg = code === 'NOT_AUTHENTICATED' ? 'Connecte-toi pour signaler un avis.' : code || "Impossible d'envoyer le signalement.";
      Alert.alert('Erreur', msg);
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <KeyboardAvoidingView style={s.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Fermer" />

        <View style={s.sheet}>
          <View style={s.handle} />

          <View style={s.headerRow}>
            <Ionicons name="flag" size={20} color={c.danger} />
            <Text style={s.title}>Signaler cet avis</Text>
            <Pressable hitSlop={10} onPress={close} style={s.closeBtn} disabled={submitting}>
              <Ionicons name="close" size={20} color={c.neutral[600]} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: spacing.lg }} keyboardShouldPersistTaps="handled">
            <Text style={s.section}>Motif</Text>
            {KINDS.map((k) => {
              const meta = REVIEW_REPORT_KIND_LABELS[k];
              const active = selected === k;
              return (
                <Pressable
                  key={k}
                  onPress={() => setSelected(k)}
                  style={({ pressed }) => [s.kindRow, active && s.kindRowActive, pressed && { opacity: 0.85 }]}
                >
                  <Text style={s.kindEmoji}>{meta.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.kindLabel, active && { color: c.primary[700] }]}>{meta.label}</Text>
                    <Text style={s.kindDesc} numberOfLines={2}>{meta.description}</Text>
                  </View>
                  <View style={[s.radio, active && { borderColor: c.primary[500], backgroundColor: c.primary[500] }]}>
                    {active && <Ionicons name="checkmark" size={14} color="#fff" />}
                  </View>
                </Pressable>
              );
            })}

            <Text style={[s.section, { marginTop: spacing.md }]}>Détails (optionnel)</Text>
            <TextInput
              style={[s.input, s.inputMultiline]}
              value={details}
              onChangeText={(v) => setDetails(v.slice(0, 1000))}
              placeholder="Précise le problème pour aider l'équipe…"
              placeholderTextColor={c.neutral[400]}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              editable={!submitting}
            />
            <Text style={s.counter}>{details.length} / 1000</Text>
          </ScrollView>

          <Pressable
            disabled={!canSubmit}
            onPress={submit}
            style={({ pressed }) => [
              s.submitBtn,
              { backgroundColor: canSubmit ? c.primary[500] : c.neutral[200] },
              pressed && canSubmit && { opacity: 0.9 },
            ]}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={[s.submitText, { color: canSubmit ? '#fff' : c.neutral[500] }]}>
                Envoyer le signalement
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: c.light,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.lg,
      maxHeight: '90%',
    },
    handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: c.neutral[200], marginTop: 6 },
    headerRow: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: c.neutral[100],
    },
    title: { flex: 1, fontSize: typography.fontSize.lg, fontWeight: '700', color: c.dark },
    closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: c.neutral[100], alignItems: 'center', justifyContent: 'center' },
    section: { fontSize: typography.fontSize.xs, fontWeight: '700', color: c.neutral[500], textTransform: 'uppercase', letterSpacing: 0.4, marginTop: spacing.sm, marginBottom: spacing.sm },
    kindRow: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.md,
      paddingVertical: spacing.md, paddingHorizontal: spacing.md,
      borderRadius: radius.lg, borderWidth: 1, borderColor: c.neutral[200],
      backgroundColor: c.neutral[50], marginBottom: spacing.sm,
    },
    kindRowActive: { borderColor: c.primary[500], backgroundColor: c.primary[50] },
    kindEmoji: { fontSize: 24 },
    kindLabel: { fontSize: typography.fontSize.sm, fontWeight: '700', color: c.dark },
    kindDesc: { fontSize: typography.fontSize.xs, color: c.neutral[600], marginTop: 2, lineHeight: 17 },
    radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: c.neutral[300], alignItems: 'center', justifyContent: 'center' },
    input: {
      backgroundColor: c.neutral[50], borderRadius: radius.md, borderWidth: 1, borderColor: c.neutral[200],
      padding: spacing.md, fontSize: typography.fontSize.base, color: c.dark,
    },
    inputMultiline: { minHeight: 80, paddingTop: spacing.md },
    counter: { fontSize: typography.fontSize.xs, color: c.neutral[500], textAlign: 'right', marginTop: 4 },
    submitBtn: { marginTop: spacing.md, paddingVertical: spacing.md, borderRadius: radius.full, alignItems: 'center' },
    submitText: { fontWeight: '700', fontSize: typography.fontSize.base },
  });
}
