import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, radius, spacing, phoneSchema, passwordSchema } from '@soutra/shared';
import { supabase } from '@/lib/supabase';
import { useI18n, useSetLocale, LOCALES, tr } from '@/lib/i18n';

type Mode = 'login' | 'register';

/** Traduit les messages d'erreur Supabase dans la langue courante. */
function frenchError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return tr('login.errCredentials');
  if (m.includes('already registered') || m.includes('already been registered'))
    return tr('login.errExists');
  if (m.includes('password')) return tr('login.errPassword');
  if (m.includes('rate') || m.includes('too many') || m.includes('seconds'))
    return tr('login.errRate');
  return message;
}

export default function Login() {
  const { t, locale } = useI18n();
  const setLocale = useSetLocale();
  const [mode, setMode] = useState<Mode>('login');
  const [phone, setPhone] = useState('+225');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    const phoneCheck = phoneSchema.safeParse(phone);
    if (!phoneCheck.success) { setError(phoneCheck.error.issues[0].message); return; }
    const passwordCheck = passwordSchema.safeParse(password);
    if (!passwordCheck.success) { setError(passwordCheck.error.issues[0].message); return; }
    if (mode === 'register' && fullName.trim().length < 2) {
      setError(t('login.needName'));
      return;
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ phone, password });
        if (error) { setError(frenchError(error.message)); return; }
      } else {
        const { data, error } = await supabase.auth.signUp({
          phone,
          password,
          options: { data: { full_name: fullName.trim() } },
        });
        if (error) { setError(frenchError(error.message)); return; }
        if (!data.session) {
          setError(t('login.created'));
          return;
        }
      }
      // Session posée -> RootNav (app/_layout.tsx) redirige vers les tabs.
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login.unexpected'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={s.container}>
          {/* Choix de la langue avant connexion (le français reste le défaut). */}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginBottom: spacing.sm }}>
            {LOCALES.map((l) => (
              <Pressable key={l} onPress={() => setLocale(l)} hitSlop={8} accessibilityRole="button" accessibilityState={{ selected: locale === l }}>
                <Text style={{ fontWeight: locale === l ? '800' : '500', color: locale === l ? colors.primary[600] : colors.neutral[500], fontSize: typography.fontSize.sm }}>{l.toUpperCase()}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={s.brand}>Soutra<Text style={{ color: colors.primary[500] }}>-Playce</Text></Text>
          <Text style={s.tagline}>
            {mode === 'login' ? t('login.welcomeLogin') : t('login.welcomeRegister')}
          </Text>

          <View style={{ marginTop: spacing['2xl'] }}>
            {mode === 'register' && (
              <>
                <Text style={s.label}>{t('login.fullName')}</Text>
                <TextInput
                  value={fullName}
                  onChangeText={setFullName}
                  style={s.input}
                  placeholder={t('login.fullNamePh')}
                  placeholderTextColor={colors.neutral[400]}
                  autoCapitalize="words"
                />
              </>
            )}

            <Text style={[s.label, mode === 'register' && s.labelSpaced]}>
              {t('login.phone')}
            </Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              style={s.input}
              placeholder={t('money.phonePh')}
              placeholderTextColor={colors.neutral[400]}
              autoCapitalize="none"
              autoComplete="tel"
            />

            <Text style={[s.label, s.labelSpaced]}>{t('login.password')}</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              style={s.input}
              placeholder={t('login.passwordPh')}
              placeholderTextColor={colors.neutral[400]}
              autoCapitalize="none"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />

            {error && <Text style={s.error}>{error}</Text>}

            <Pressable onPress={submit} disabled={loading} style={({ pressed }) => [s.cta, pressed && { opacity: 0.85 }]}>
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.ctaText}>{mode === 'login' ? t('login.signIn') : t('login.signUp')}</Text>}
            </Pressable>

            <Pressable
              onPress={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}
              disabled={loading}
              style={s.switchBtn}
            >
              <Text style={s.switchText}>
                {mode === 'login' ? t('login.toRegister') : t('login.toLogin')}
              </Text>
            </Pressable>
          </View>

          <Text style={s.terms}>
            {t('login.terms')}
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
  labelSpaced: { marginTop: spacing.base },
  input: {
    fontSize: typography.fontSize.base,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    backgroundColor: '#fff',
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    color: colors.dark,
  },
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
  switchBtn: { marginTop: spacing.base, paddingVertical: spacing.sm, alignItems: 'center' },
  switchText: { color: colors.neutral[500], fontWeight: '500', fontSize: typography.fontSize.sm },
  terms: { marginTop: 'auto', fontSize: typography.fontSize.xs, color: colors.neutral[500], textAlign: 'center', paddingBottom: spacing.base },
});
