import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, radius, spacing, phoneSchema, passwordSchema } from '@soutra/shared';
import { supabase } from '@/lib/supabase';

type Mode = 'login' | 'register';

/** Traduit les messages d'erreur Supabase en français lisible. */
function frenchError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Numéro ou mot de passe incorrect.';
  if (m.includes('already registered') || m.includes('already been registered'))
    return 'Ce numéro a déjà un compte — connecte-toi.';
  if (m.includes('password')) return 'Mot de passe invalide (8 caractères minimum).';
  if (m.includes('rate') || m.includes('too many') || m.includes('seconds'))
    return 'Trop de tentatives. Réessaie dans quelques minutes.';
  return message;
}

export default function Login() {
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
      setError('Indique ton nom complet.');
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
          setError('Compte créé. Désactive « Confirm phone » côté Supabase pour la connexion immédiate.');
          return;
        }
      }
      // Session posée -> RootNav (app/_layout.tsx) redirige vers les tabs.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inattendue.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={s.container}>
          <Text style={s.brand}>Soutra<Text style={{ color: colors.primary[500] }}>-Paiya</Text></Text>
          <Text style={s.tagline}>
            {mode === 'login' ? 'Connecte-toi à ton compte' : 'Crée ton compte en 30 secondes'}
          </Text>

          <View style={{ marginTop: spacing['2xl'] }}>
            {mode === 'register' && (
              <>
                <Text style={s.label}>Nom complet</Text>
                <TextInput
                  value={fullName}
                  onChangeText={setFullName}
                  style={s.input}
                  placeholder="Ex. Kouassi Yao"
                  placeholderTextColor={colors.neutral[400]}
                  autoCapitalize="words"
                />
              </>
            )}

            <Text style={[s.label, mode === 'register' && s.labelSpaced]}>
              Numéro de téléphone
            </Text>
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

            <Text style={[s.label, s.labelSpaced]}>Mot de passe</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              style={s.input}
              placeholder="8 caractères minimum"
              placeholderTextColor={colors.neutral[400]}
              autoCapitalize="none"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />

            {error && <Text style={s.error}>{error}</Text>}

            <Pressable onPress={submit} disabled={loading} style={({ pressed }) => [s.cta, pressed && { opacity: 0.85 }]}>
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.ctaText}>{mode === 'login' ? 'Se connecter' : 'Créer mon compte'}</Text>}
            </Pressable>

            <Pressable
              onPress={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}
              disabled={loading}
              style={s.switchBtn}
            >
              <Text style={s.switchText}>
                {mode === 'login' ? "Pas encore de compte ? S'inscrire" : 'Déjà un compte ? Se connecter'}
              </Text>
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
