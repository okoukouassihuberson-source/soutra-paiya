import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, radius, spacing, phoneSchema } from '@soutra/shared';
import { supabase } from '@/lib/supabase';

export default function Login() {
  const router = useRouter();
  const [phone, setPhone] = useState('+225');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setError(null);
    const r = phoneSchema.safeParse(phone);
    if (!r.success) { setError(r.error.issues[0].message); return; }
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ phone });
    setLoading(false);
    if (error) setError(error.message);
    else router.push({ pathname: '/(auth)/otp', params: { phone } });
  }

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={s.container}>
          <Text style={s.brand}>Soutra<Text style={{ color: colors.primary[500] }}>-Paiya</Text></Text>
          <Text style={s.tagline}>Sortir, réserver, payer. Sans la galère.</Text>

          <View style={{ marginTop: spacing['2xl'] }}>
            <Text style={s.label}>Numéro de téléphone</Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              style={s.input}
              placeholder="+225XXXXXXXXXX"
              placeholderTextColor={colors.neutral[400]}
              autoCapitalize="none"
              autoComplete="tel"
            />
            <Text style={s.hint}>Tu vas recevoir un code par SMS</Text>

            {error && <Text style={s.error}>{error}</Text>}

            <Pressable onPress={send} disabled={loading} style={({ pressed }) => [s.cta, pressed && { opacity: 0.85 }]}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.ctaText}>Recevoir le code</Text>}
            </Pressable>
          </View>

          <Text style={s.terms}>
            En continuant, tu acceptes nos CGU et notre politique de confidentialité.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.light },
  container: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing['2xl'] },
  brand: { fontSize: typography.fontSize['2xl'], fontWeight: '700', color: colors.dark },
  tagline: { marginTop: spacing.sm, fontSize: typography.fontSize.base, color: colors.neutral[600] },
  label: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.neutral[700], marginBottom: spacing.sm },
  input: {
    fontSize: typography.fontSize.lg,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    backgroundColor: '#fff',
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
    color: colors.dark,
  },
  hint: { marginTop: spacing.sm, fontSize: typography.fontSize.xs, color: colors.neutral[500] },
  error: { marginTop: spacing.md, color: colors.danger, fontSize: typography.fontSize.sm },
  cta: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary[500],
    paddingVertical: spacing.base,
    borderRadius: radius.md,
    alignItems: 'center',
    elevation: 2,
  },
  ctaText: { color: '#fff', fontWeight: '700', fontSize: typography.fontSize.base },
  terms: { marginTop: 'auto', fontSize: typography.fontSize.xs, color: colors.neutral[500], textAlign: 'center', paddingBottom: spacing.base },
});
