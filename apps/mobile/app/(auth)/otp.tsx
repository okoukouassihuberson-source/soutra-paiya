import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, radius, spacing, otpSchema } from '@soutra/shared';
import { supabase } from '@/lib/supabase';

export default function Otp() {
  const { phone, channel } = useLocalSearchParams<{ phone: string; channel?: string }>();
  const router = useRouter();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const via = channel === 'sms' ? 'par SMS' : 'sur WhatsApp';

  async function verify() {
    setError(null);
    const r = otpSchema.safeParse(code);
    if (!r.success) { setError(r.error.issues[0].message); return; }
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({ phone: phone as string, token: code, type: 'sms' });
    setLoading(false);
    if (error) setError(error.message);
    // Sinon, _layout redirige automatiquement vers les tabs
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.container}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={s.back}>← Retour</Text>
        </Pressable>
        <Text style={s.title}>Entre ton code</Text>
        <Text style={s.subtitle}>Envoyé {via} au {phone}</Text>

        <TextInput
          value={code}
          onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          style={s.input}
          placeholder="000000"
          placeholderTextColor={colors.neutral[300]}
          maxLength={6}
          autoFocus
        />

        {error && <Text style={s.error}>{error}</Text>}

        <Pressable onPress={verify} disabled={loading} style={({ pressed }) => [s.cta, pressed && { opacity: 0.85 }]}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.ctaText}>Valider</Text>}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.light },
  container: { flex: 1, padding: spacing.lg },
  back: { color: colors.primary[500], fontSize: typography.fontSize.base, fontWeight: '500' },
  title: { fontSize: typography.fontSize['2xl'], fontWeight: '700', color: colors.dark, marginTop: spacing.lg },
  subtitle: { fontSize: typography.fontSize.base, color: colors.neutral[600], marginTop: spacing.sm },
  input: {
    fontSize: 36,
    letterSpacing: 8,
    textAlign: 'center',
    marginTop: spacing.xl,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    backgroundColor: '#fff',
    borderRadius: radius.md,
    paddingVertical: spacing.base,
    fontWeight: '700',
    color: colors.dark,
  },
  error: { marginTop: spacing.md, color: colors.danger, fontSize: typography.fontSize.sm, textAlign: 'center' },
  cta: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary[500],
    paddingVertical: spacing.base,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  ctaText: { color: '#fff', fontWeight: '700', fontSize: typography.fontSize.base },
});
