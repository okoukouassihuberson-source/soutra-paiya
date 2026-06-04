// ============================================================================
// PaymentConfirmModal — modal de confirmation PIN pour paiement vocal.
//
// Déclenché par l'action authenticate_and_pay émise par Sia (Phase 4).
// L'utilisateur tape son PIN à 4 chiffres ; on appelle directement
// l'Edge function pay-reservation qui valide le PIN bcrypt côté serveur
// ET fait le débit wallet atomique en une seule transaction.
//
// Pourquoi PIN obligatoire (et pas biométrique seul) : le serveur ne peut pas
// valider une biométrie locale ; il a besoin du PIN pour crypt() contre
// payment_pins.pin_hash. Si l'utilisateur a la biométrie activée, on garde
// l'icône comme raccourci futur (V2 : token de session post-PIN qui permettra
// à la biométrie d'autoriser).
// ============================================================================

import { useEffect, useState } from 'react';
import {
  Modal, View, Text, Pressable, StyleSheet, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, radius, spacing, formatXOF } from '@soutra/shared';
import { payReservationFromWallet, type PayReservationResult } from '@/lib/assistant';

interface Props {
  visible: boolean;
  reservationId: string;
  amountXof: number;
  venueName?: string;
  onSuccess: (result: PayReservationResult) => void;
  onCancel: () => void;
}

export function PaymentConfirmModal({
  visible, reservationId, amountXof, venueName, onSuccess, onCancel,
}: Props) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Reset à l'ouverture
  useEffect(() => {
    if (!visible) return;
    setPin('');
    setError(null);
    setSubmitting(false);
  }, [visible]);

  const submit = async (value: string) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await payReservationFromWallet(reservationId, value);
      onSuccess(res);
    } catch (err: any) {
      // L'Edge function map déjà les erreurs en messages clairs (PIN_WRONG →
      // "PIN incorrect", INSUFFICIENT_FUNDS → "Solde insuffisant", etc.)
      setError(err?.message ?? 'Paiement impossible');
      setPin('');
      setSubmitting(false);
    }
  };

  const pressDigit = (digit: string) => {
    if (submitting || pin.length >= 4) return;
    setError(null);
    const next = pin + digit;
    setPin(next);
    if (next.length === 4) void submit(next);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <Pressable style={s.close} hitSlop={12} onPress={onCancel} disabled={submitting}>
            <Ionicons name="close" size={24} color={colors.neutral[500]} />
          </Pressable>

          {/* Header : montant + venue */}
          <View style={s.amountCircle}>
            <Ionicons name="card" size={28} color={colors.primary[500]} />
          </View>
          <Text style={s.amountLabel}>Confirme le paiement</Text>
          <Text style={s.amountValue}>{formatXOF(amountXof)}</Text>
          {venueName && (
            <Text style={s.venueLabel}>Acompte chez {venueName}</Text>
          )}

          <Text style={s.pinHint}>Saisis ton PIN à 4 chiffres</Text>

          {/* Dots */}
          <View style={s.dots}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={[s.dot, i < pin.length && s.dotFilled]} />
            ))}
          </View>

          {/* Status zone */}
          <View style={s.statusZone}>
            {submitting ? (
              <ActivityIndicator color={colors.primary[500]} />
            ) : error ? (
              <Text style={s.error}>{error}</Text>
            ) : null}
          </View>

          {/* Pad numérique */}
          <View style={s.pad}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
              <Pressable
                key={d}
                style={({ pressed }) => [s.key, pressed && s.keyPressed]}
                onPress={() => pressDigit(d)}
                disabled={submitting}
              >
                <Text style={s.keyText}>{d}</Text>
              </Pressable>
            ))}
            <View style={s.key} />
            <Pressable
              style={({ pressed }) => [s.key, pressed && s.keyPressed]}
              onPress={() => pressDigit('0')}
              disabled={submitting}
            >
              <Text style={s.keyText}>0</Text>
            </Pressable>
            <Pressable
              style={s.key}
              onPress={() => !submitting && setPin((p) => p.slice(0, -1))}
              disabled={submitting}
            >
              <Ionicons name="backspace-outline" size={26} color={colors.dark} />
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.light,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
  },
  close: { position: 'absolute', top: spacing.lg, right: spacing.lg, zIndex: 1 },
  amountCircle: {
    width: 60, height: 60, borderRadius: radius.full,
    backgroundColor: colors.primary[50],
    alignItems: 'center', justifyContent: 'center',
  },
  amountLabel: {
    marginTop: spacing.md,
    fontSize: typography.fontSize.xs,
    fontWeight: '700', color: colors.neutral[500],
    textTransform: 'uppercase', letterSpacing: 0.3,
  },
  amountValue: {
    marginTop: 4,
    fontSize: typography.fontSize['2xl'],
    fontWeight: '800', color: colors.dark,
  },
  venueLabel: {
    marginTop: 4,
    fontSize: typography.fontSize.sm, color: colors.neutral[600],
  },
  pinHint: {
    marginTop: spacing.lg,
    fontSize: typography.fontSize.sm, color: colors.neutral[700], fontWeight: '600',
  },
  dots: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  dot: {
    width: 16, height: 16, borderRadius: radius.full,
    borderWidth: 2, borderColor: colors.neutral[300],
  },
  dotFilled: { backgroundColor: colors.primary[500], borderColor: colors.primary[500] },
  statusZone: { height: 28, justifyContent: 'center' },
  error: { color: colors.danger, fontSize: typography.fontSize.sm, fontWeight: '600' },
  pad: {
    flexDirection: 'row', flexWrap: 'wrap',
    width: 260, justifyContent: 'space-between', rowGap: spacing.md,
  },
  key: {
    width: 76, height: 64, borderRadius: radius.lg,
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.neutral[200],
  },
  keyPressed: { backgroundColor: colors.neutral[100] },
  keyText: { fontSize: 24, fontWeight: '700', color: colors.dark },
});
