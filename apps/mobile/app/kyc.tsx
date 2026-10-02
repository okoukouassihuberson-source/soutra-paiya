import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView, Image,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { colors, typography, radius, spacing } from '@soutra/shared';
import { useI18n, type TKey } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

const ID_TYPES = ['CNI', 'Passeport', 'Permis de conduire'];

export default function Kyc() {
  const { t } = useI18n();
  const router = useRouter();
  const { user } = useAuth();
  const sb = supabase as any;

  const [status, setStatus] = useState<string>('none');
  const [legalName, setLegalName] = useState('');
  const [idType, setIdType] = useState<string>('CNI');
  const [idNumber, setIdNumber] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
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

  async function pickPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('kyc.permTitle'), t('kyc.permBody'));
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.6,
      base64: true,
      allowsEditing: true,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    if (!asset.base64) {
      Alert.alert(t('kyc.error'), t('kyc.unreadable'));
      return;
    }
    setPhotoUri(asset.uri);
    setPhotoBase64(asset.base64);
  }

  async function submit() {
    if (!user?.id) return;
    if (legalName.trim().length < 2) {
      Alert.alert(t('kyc.nameReq'), t('kyc.nameReqBody'));
      return;
    }
    if (idNumber.trim().length < 3) {
      Alert.alert(t('kyc.numReq'), t('kyc.numReqBody'));
      return;
    }
    if (!photoBase64) {
      Alert.alert(t('kyc.photoReq'), t('kyc.photoReqBody'));
      return;
    }

    setSaving(true);
    try {
      // 1. Upload de la photo dans le bucket privé `kyc` (chemin: <user_id>/...).
      const path = `${user.id}/id-${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from('kyc')
        .upload(path, decode(photoBase64), { contentType: 'image/jpeg', upsert: true });
      if (upErr) {
        Alert.alert(
          t('kyc.uploadFail'),
          t('kyc.uploadHint') + upErr.message,
        );
        return;
      }

      // 2. Mise à jour du profil + passage en statut « pending ».
      const { error } = await sb
        .from('profiles')
        .update({
          full_name: legalName.trim(),
          kyc_id_type: idType,
          kyc_id_number: idNumber.trim(),
          kyc_doc_url: path,
          kyc_submitted_at: new Date().toISOString(),
          kyc_status: 'pending',
        })
        .eq('id', user.id);
      if (error) {
        Alert.alert(t('kyc.error'), error.message ?? t('kyc.sendFail'));
        return;
      }

      setStatus('pending');
      Alert.alert(
        t('kyc.sentTitle'),
        t('kyc.sentBody'),
      );
    } finally {
      setSaving(false);
    }
  }

  const canSubmit = status === 'none' || status === 'rejected';

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Pressable hitSlop={10} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color={colors.dark} />
        </Pressable>
        <Text style={s.headerTitle}>{t('kyc.title')}</Text>
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
                {t('kyc.info')}
              </Text>
            </View>

            {status === 'verified' && (
              <View style={[s.statusCard, { backgroundColor: colors.secondary[50] }]}>
                <Text style={[s.statusTitle, { color: colors.success }]}>{t('kyc.verifiedTitle')}</Text>
                <Text style={s.statusBody}>{t('kyc.verifiedBody')}</Text>
              </View>
            )}

            {status === 'pending' && (
              <View style={[s.statusCard, { backgroundColor: '#FFF7E6' }]}>
                <Text style={[s.statusTitle, { color: colors.warning }]}>{t('kyc.pendingTitle')}</Text>
                <Text style={s.statusBody}>
                  {t('kyc.pendingBody')}
                </Text>
              </View>
            )}

            {status === 'rejected' && (
              <View style={[s.statusCard, { backgroundColor: '#FDECEC' }]}>
                <Text style={[s.statusTitle, { color: colors.danger }]}>{t('kyc.rejectedTitle')}</Text>
                <Text style={s.statusBody}>{t('kyc.rejectedBody')}</Text>
              </View>
            )}

            {canSubmit && (
              <>
                <Text style={[s.label, s.spaced]}>{t('kyc.legalName')}</Text>
                <TextInput
                  value={legalName}
                  onChangeText={setLegalName}
                  style={s.input}
                  placeholder={t('kyc.legalNamePh')}
                  placeholderTextColor={colors.neutral[400]}
                  autoCapitalize="words"
                />

                <Text style={[s.label, s.spaced]}>{t('kyc.idType')}</Text>
                <View style={s.chips}>
                  {ID_TYPES.map((it) => {
                    const active = idType === it;
                    return (
                      <Pressable
                        key={it}
                        onPress={() => setIdType(it)}
                        style={[s.chip, active && s.chipActive]}
                      >
                        <Text style={[s.chipText, active && s.chipTextActive]}>{t(`kyc.id.${it}` as TKey)}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={[s.label, s.spaced]}>{t('kyc.idNumber')}</Text>
                <TextInput
                  value={idNumber}
                  onChangeText={setIdNumber}
                  style={s.input}
                  placeholder={t('kyc.idNumberPh')}
                  placeholderTextColor={colors.neutral[400]}
                  autoCapitalize="characters"
                />

                <Text style={[s.label, s.spaced]}>{t('kyc.photo')}</Text>
                {photoUri ? (
                  <Pressable onPress={pickPhoto} style={s.photoPreviewWrap}>
                    <Image source={{ uri: photoUri }} style={s.photoPreview} />
                    <View style={s.photoOverlay}>
                      <Ionicons name="camera-reverse-outline" size={18} color="#fff" />
                      <Text style={s.photoOverlayText}>{t('kyc.change')}</Text>
                    </View>
                  </Pressable>
                ) : (
                  <Pressable onPress={pickPhoto} style={s.photoPicker}>
                    <Ionicons name="camera-outline" size={28} color={colors.primary[500]} />
                    <Text style={s.photoPickerText}>{t('kyc.add')}</Text>
                  </Pressable>
                )}

                <Pressable
                  onPress={submit}
                  disabled={saving}
                  style={({ pressed }) => [s.cta, pressed && { opacity: 0.85 }]}
                >
                  {saving
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={s.ctaText}>{t('kyc.submit')}</Text>}
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
  photoPicker: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    borderWidth: 1, borderStyle: 'dashed', borderColor: colors.neutral[300],
    borderRadius: radius.md, paddingVertical: spacing.lg,
  },
  photoPickerText: { fontSize: typography.fontSize.sm, color: colors.primary[500], fontWeight: '600' },
  photoPreviewWrap: { borderRadius: radius.md, overflow: 'hidden' },
  photoPreview: { width: '100%', height: 200 },
  photoOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.55)', paddingVertical: spacing.sm,
  },
  photoOverlayText: { color: '#fff', fontSize: typography.fontSize.sm, fontWeight: '600' },
  cta: {
    marginTop: spacing.xl, backgroundColor: colors.primary[500],
    paddingVertical: spacing.base, borderRadius: radius.md, alignItems: 'center', elevation: 2,
  },
  ctaText: { color: '#fff', fontWeight: '700', fontSize: typography.fontSize.base },
});
