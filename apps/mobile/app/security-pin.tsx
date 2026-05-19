import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, radius, spacing } from '@soutra/shared';
import { setPaymentPin } from '@/lib/security';

export default function SecurityPin() {
  const router = useRouter();
  const [step, setStep] = useState<'enter' | 'confirm'>('enter');
  const [first, setFirst] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setPin('');
    setFirst('');
    setStep('enter');
  };

  const onComplete = async (value: string) => {
    if (step === 'enter') {
      setFirst(value);
      setPin('');
      setError(null);
      setStep('confirm');
      return;
    }
    // Étape de confirmation.
    if (value !== first) {
      setError('Les deux codes ne correspondent pas');
      reset();
      return;
    }
    try {
      setSaving(true);
      await setPaymentPin(value);
      Alert.alert(
        'Code PIN enregistré 🔒',
        'Ton PIN sécurise désormais tes envois et paiements.',
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch (err: any) {
      setError(err?.message ?? 'Enregistrement impossible');
      reset();
    } finally {
      setSaving(false);
    }
  };

  const pressDigit = (digit: string) => {
    if (saving || pin.length >= 4) return;
    setError(null);
    const next = pin + digit;
    setPin(next);
    if (next.length === 4) onComplete(next);
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Pressable hitSlop={10} onPress={() => router.back()} disabled={saving}>
          <Ionicons name="chevron-back" size={28} color={colors.dark} />
        </Pressable>
        <Text style={s.headerTitle}>Code PIN de paiement</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={s.body}>
        <View style={s.lockCircle}>
          <Ionicons name="lock-closed" size={28} color={colors.primary[500]} />
        </View>
        <Text style={s.title}>
          {step === 'enter' ? 'Choisis un code à 4 chiffres' : 'Confirme ton code'}
        </Text>
        <Text style={s.subtitle}>
          Ce code te sera demandé pour valider tes envois d'argent.
        </Text>

        <View style={s.dots}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={[s.dot, i < pin.length && s.dotFilled]} />
          ))}
        </View>
        <View style={s.statusZone}>
          {saving ? (
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
          <View style={s.key} />
          <Pressable
            style={({ pressed }) => [s.key, pressed && s.keyPressed]}
            onPress={() => pressDigit('0')}
          >
            <Text style={s.keyText}>0</Text>
          </Pressable>
          <Pressable
            style={s.key}
            onPress={() => !saving && setPin((p) => p.slice(0, -1))}
          >
            <Ionicons name="backspace-outline" size={26} color={colors.dark} />
          </Pressable>
        </View>
      </View>
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
  body: { flex: 1, alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
  lockCircle: {
    width: 60,
    height: 60,
    borderRadius: radius.full,
    backgroundColor: colors.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    marginTop: spacing.lg,
    fontSize: typography.fontSize.lg,
    fontWeight: '700',
    color: colors.dark,
  },
  subtitle: {
    marginTop: spacing.xs,
    fontSize: typography.fontSize.sm,
    color: colors.neutral[600],
    textAlign: 'center',
  },
  dots: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  dot: {
    width: 16,
    height: 16,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.neutral[300],
  },
  dotFilled: { backgroundColor: colors.primary[500], borderColor: colors.primary[500] },
  statusZone: { height: 32, justifyContent: 'center' },
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyPressed: { backgroundColor: colors.neutral[100] },
  keyText: { fontSize: 26, fontWeight: '700', color: colors.dark },
});
