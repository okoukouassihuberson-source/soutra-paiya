import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, radius, spacing } from '@soutra/shared';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

const ID_TYPES = ['CNI', 'Passeport', 'Permis de conduire'];

export default function Kyc() {
  const router = useRouter();
  const { user } = useAuth();
  const sb = supabase as any;

  const [status, setStatus] = useState<string>('none');
  const [legalName, setLegalName] = useState('');
  const [idType, setIdType] = useState<string>('CNI');
  const [idNumber, setIdNumber] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    let mounted = true;
    (async () => {
      const { data } = await sb
        .from('profiles')
        .select('kyc_status, full_name, kyc_id_type, kyc_id_number')
        .eq('id', user.id)
        .maybeSingle();
      if (!mounted) return;
      if (data) {
        setStatus(data.kyc_status ?? 'none');
        setLegalName(data.full_name ?? '');
        if (data.kyc_id_type) setIdType(data.kyc_id_type);
        setIdNumber(data.kyc_id_number ?? '');
      }
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [user?.id]);

  async function submit() {
    if (!user?.id) return;
    if (legalName.trim().length < 2) {
      Alert.alert('Nom requis', 'Indique ton nom légal complet.');
      return;
    }
    if (idNumber.trim().length < 3) {
      Alert.alert('Numéro requis', 'Indique le numéro de ta pièce d\'identité.');
      return;
    }
    setSaving(true);
    const { error } = await sb
      .from('profiles')
      .update({
        full_name: legalName.trim(),
        kyc_id_type: idType,
        kyc_id_number: idNumber.trim(),
        kyc_submitted_at: new Date().toISOString(),
        kyc_status: 'pending',
      })
      .eq('id', user.id);
    setSaving(false);
    if (error) {
      Alert.alert('Erreur', error.message ?? 'Envoi impossible.');
      return;
    }
    setStatus('pending');
    Alert.alert(
      'Demande envoyée',
      'Ta vérification KYC est en cours d\'examen. Tu seras notifié du résultat.',
    );
  }

  const canSubmit = status === 'none' || status === 'rejected';

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Pressable hitSlop={10} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color={colors.dark} />
        </Pressable>
        <Text style={s.headerTitle}>Vérification KYC</Text>
        <View style={{ width: 28 }} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary[500]} style={s.center} />
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
            <View style={s.infoCard}>
              <Ionicons name="shield-checkmark" size={22} color={colors.secondary[500]} />
              <Text style={s.infoText}>
                La vérification d'identité permet d'augmenter tes limites au-delà
                de 200 000 FCFA et de sécuriser ton compte.
              </Text>
            </View>

            {status === 'verified' && (
              <View style={[s.statusCard, { backgroundColor: colors.secondary[50] }]}>
                <Text style={[s.statusTitle, { color: colors.success }]}>✓ Compte vérifié</Text>
                <Text style={s.statusBody}>Ton identité a été validée. Tes limites sont relevées.</Text>
              </View>
            )}

            {status === 'pending' && (
              <View style={[s.statusCard, { backgroundColor: '#FFF7E6' }]}>
                <Text style={[s.statusTitle, { color: colors.warning }]}>⏳ Demande en cours</Text>
                <Text style={s.statusBody}>
                  Ta demande est en cours d'examen. Tu seras notifié du résultat.
                </Text>
              </View>
            )}

            {status === 'rejected' && (
              <View style={[s.statusCard, { backgroundColor: '#FDECEC' }]}>
                <Text style={[s.statusTitle, { color: colors.danger }]}>✗ Demande rejetée</Text>
                <Text style={s.statusBody}>Vérifie tes informations et renvoie ta demande.</Text>
              </View>
            )}

            {canSubmit && (
              <>
                <Text style={[s.label, s.spaced]}>Nom légal complet</Text>
                <TextInput
                  value={legalName}
                  onChangeText={setLegalName}
                  style={s.input}
                  placeholder="Tel qu'inscrit sur ta pièce"
                  placeholderTextColor={colors.neutral[400]}
                  autoCapitalize="words"
                />

                <Text style={[s.label, s.spaced]}>Type de pièce</Text>
                <View style={s.chips}>
                  {ID_TYPES.map((t) => {
                    const active = idType === t;
                    return (
                      <Pressable
                        key={t}
                        onPress={() => setIdType(t)}
                        style={[s.chip, active && s.chipActive]}
                      >
                        <Text style={[s.chipText, active && s.chipTextActive]}>{t}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={[s.label, s.spaced]}>Numéro de la pièce</Text>
                <TextInput
                  value={idNumber}
                  onChangeText={setIdNumber}
                  style={s.input}
                  placeholder="Numéro du document"
                  placeholderTextColor={colors.neutral[400]}
                  autoCapitalize="characters"
                />

                <Pressable
                  onPress={submit}
                  disabled={saving}
                  style={({ pressed }) => [s.cta, pressed && { opacity: 0.85 }]}
                >
                  {saving
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={s.ctaText}>Envoyer ma demande</Text>}
                </Pressable>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.light },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.base,
  },
  headerTitle: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.dark },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  infoCard: {
    flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start',
    backgroundColor: colors.secondary[50], borderRadius: radius.md, padding: spacing.base,
  },
  infoText: { flex: 1, fontSize: typography.fontSize.sm, color: colors.neutral[700], lineHeight: 20 },
  statusCard: { marginTop: spacing.base, borderRadius: radius.md, padding: spacing.base },
  statusTitle: { fontSize: typography.fontSize.base, fontWeight: '700' },
  statusBody: { marginTop: spacing.xs, fontSize: typography.fontSize.sm, color: colors.neutral[600] },
  label: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.neutral[700], marginBottom: spacing.sm },
  spaced: { marginTop: spacing.lg },
  input: {
    fontSize: typography.fontSize.base,
    borderWidth: 1, borderColor: colors.neutral[200], backgroundColor: '#fff',
    borderRadius: radius.md, paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    color: colors.dark,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    borderWidth: 1, borderColor: colors.neutral[200], backgroundColor: '#fff',
    borderRadius: radius.full, paddingHorizontal: spacing.base, paddingVertical: spacing.sm,
  },
  chipActive: { backgroundColor: colors.primary[500], borderColor: colors.primary[500] },
  chipText: { fontSize: typography.fontSize.sm, color: colors.neutral[700] },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  cta: {
    marginTop: spacing.xl, backgroundColor: colors.primary[500],
    paddingVertical: spacing.base, borderRadius: radius.md, alignItems: 'center', elevation: 2,
  },
  ctaText: { color: '#fff', fontWeight: '700', fontSize: typography.fontSize.base },
});
