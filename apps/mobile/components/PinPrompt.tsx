import { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, radius, spacing } from '@soutra/shared';
import {
  authenticateBiometric,
  isBiometricAvailable,
  isBiometricEnabled,
  verifyPaymentPin,
} from '@/lib/security';

// Modale de confirmation : PIN à 4 chiffres, avec biométrie si activée.
export function PinPrompt({
  visible,
  title,
  onSuccess,
  onCancel,
}: {
  visible: boolean;
  title?: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);

  // À l'ouverture : réinitialise et tente la biométrie si elle est activée.
  useEffect(() => {
    if (!visible) return;
    setPin('');
    setError(null);
    setChecking(false);
    let cancelled = false;
    (async () => {
      const [enabled, available] = await Promise.all([
        isBiometricEnabled(),
        isBiometricAvailable(),
      ]);
      if (cancelled) return;
      const usable = enabled && available;
      setBioAvailable(usable);
      if (usable) {
        const ok = await authenticateBiometric();
        if (!cancelled && ok) onSuccess();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const submit = async (value: string) => {
    setChecking(true);
    const ok = await verifyPaymentPin(value);
    setChecking(false);
    if (ok) {
      onSuccess();
    } else {
      setError('Code PIN incorrect');
      setPin('');
    }
  };

  const pressDigit = (digit: string) => {
    if (checking || pin.length >= 4) return;
    setError(null);
    const next = pin + digit;
    setPin(next);
    if (next.length === 4) submit(next);
  };

  const runBiometric = async () => {
    if (checking) return;
    const ok = await authenticateBiometric();
    if (ok) onSuccess();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <Pressable style={s.close} hitSlop={12} onPress={onCancel}>
            <Ionicons name="close" size={24} color={colors.neutral[500]} />
          </Pressable>

          <View style={s.lockCircle}>
            <Ionicons name="lock-closed" size={28} color={colors.primary[500]} />
          </View>
          <Text style={s.title}>{title ?? 'Saisis ton code PIN'}</Text>

          <View style={s.dots}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={[s.dot, i < pin.length && s.dotFilled]} />
            ))}
          </View>

          <View style={s.statusZone}>
            {checking ? (
              <ActivityIndicator color={colors.primary[500]} />
            ) : error ? (
              <Text style={s.error}>{error}</Text>
            ) : null}
          </View>

          <View style={s.pad}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
              <Pressable
                key={d}
                style={({ pressed }) => [s.key, pressed && s.keyPressed]}
                onPress={() => pressDigit(d)}
              >
                <Text style={s.keyText}>{d}</Text>
              </Pressable>
            ))}
            <Pressable
              style={s.key}
              onPress={runBiometric}
              disabled={!bioAvailable}
            >
              {bioAvailable && (
                <Ionicons name="finger-print" size={28} color={colors.primary[500]} />
              )}
            </Pressable>
            <Pressable
              style={({ pressed }) => [s.key, pressed && s.keyPressed]}
              onPress={() => pressDigit('0')}
            >
              <Text style={s.keyText}>0</Text>
            </Pressable>
            <Pressable
              style={s.key}
              onPress={() => !checking && setPin((p) => p.slice(0, -1))}
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
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.light,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
  },
  close: { position: 'absolute', top: spacing.lg, right: spacing.lg },
  lockCircle: {
    width: 60,
    height: 60,
    borderRadius: radius.full,
    backgroundColor: colors.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    marginTop: spacing.md,
    fontSize: typography.fontSize.base,
    fontWeight: '700',
    color: colors.dark,
  },
  dots: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  dot: {
    width: 16,
    height: 16,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.neutral[300],
  },
  dotFilled: { backgroundColor: colors.primary[500], borderColor: colors.primary[500] },
  statusZone: { height: 28, justifyContent: 'center' },
  error: { color: colors.danger, fontSize: typography.fontSize.sm, fontWeight: '600' },
  pad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 260,
    justifyContent: 'space-between',
    rowGap: spacing.md,
  },
  key: {
    width: 76,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },
  keyPressed: { backgroundColor: colors.neutral[100] },
  keyText: { fontSize: 24, fontWeight: '700', color: colors.dark },
});
