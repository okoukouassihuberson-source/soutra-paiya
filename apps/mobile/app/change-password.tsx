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
import { colors, typography, radius, spacing, passwordSchema } from '@soutra/shared';
import { supabase } from '@/lib/supabase';

export default function ChangePassword() {
  const router = useRouter();
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  const pwOk = passwordSchema.safeParse(pw).success;
  const match = pw.length > 0 && pw === confirm;
  const canSubmit = pwOk && match && !saving;

  const handleSave = async () => {
    if (!canSubmit) return;
    try {
      setSaving(true);
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw new Error(error.message);
      Alert.alert(
        'Mot de passe modifié',
        'Ton nouveau mot de passe est actif.',
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch (err: any) {
      Alert.alert('Erreur', err?.message ?? 'Modification impossible.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={s.header}>
          <Pressable hitSlop={10} onPress={() => router.back()} disabled={saving}>
            <Ionicons name="chevron-back" size={28} color={colors.dark} />
          </Pressable>
          <Text style={s.headerTitle}>Changer le mot de passe</Text>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView
          contentContainerStyle={{ padding: spacing.lg }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={s.label}>Nouveau mot de passe</Text>
          <View style={s.inputRow}>
            <TextInput
              style={s.input}
              value={pw}
              onChangeText={setPw}
              placeholder="8 caractères minimum"
              placeholderTextColor={colors.neutral[400]}
              secureTextEntry={!show}
              editable={!saving}
              autoCapitalize="none"
            />
            <Pressable hitSlop={8} onPress={() => setShow((v) => !v)}>
              <Ionicons
                name={show ? 'eye-off-outline' : 'eye-outline'}
                size={22}
                color={colors.neutral[500]}
              />
            </Pressable>
          </View>
          {pw.length > 0 && !pwOk && (
            <Text style={s.errorHint}>8 caractères minimum.</Text>
          )}

          <Text style={s.label}>Confirme le mot de passe</Text>
          <View style={s.inputRow}>
            <TextInput
              style={s.input}
              value={confirm}
              onChangeText={setConfirm}
              placeholder="Retape le mot de passe"
              placeholderTextColor={colors.neutral[400]}
              secureTextEntry={!show}
              editable={!saving}
              autoCapitalize="none"
            />
          </View>
          {confirm.length > 0 && !match && (
            <Text style={s.errorHint}>Les mots de passe ne correspondent pas.</Text>
          )}

          <Pressable
            style={({ pressed }) => [
              s.btn,
              !canSubmit && s.btnDisabled,
              pressed && { opacity: 0.85 },
            ]}
            onPress={handleSave}
            disabled={!canSubmit}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.btnText}>Enregistrer</Text>
            )}
          </Pressable>
        </ScrollView>
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
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    paddingHorizontal: spacing.md,
  },
  input: {
    flex: 1,
    paddingVertical: spacing.md,
    fontSize: typography.fontSize.base,
    color: colors.dark,
  },
  errorHint: { marginTop: spacing.xs, fontSize: typography.fontSize.xs, color: colors.danger },
  btn: {
    backgroundColor: colors.primary[500],
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { fontSize: typography.fontSize.base, fontWeight: '700', color: '#fff' },
});
