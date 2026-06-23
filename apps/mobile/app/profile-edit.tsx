import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, radius, spacing } from '@soutra/shared';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { pickAvatarFromGallery, pickAvatarFromCamera, uploadAvatar, removeAvatar } from '@/lib/profile-photo';
import { pickCoverFromGallery, pickCoverFromCamera, uploadCover, removeCover } from '@/lib/profile-cover';

export default function ProfileEdit() {
  const router = useRouter();
  const { user } = useAuth();
  const sb = supabase as any;

  const [fullName, setFullName] = useState('');
  const [city, setCity] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [coverBusy, setCoverBusy] = useState(false);

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    let mounted = true;
    (async () => {
      const { data } = await sb
        .from('profiles')
        .select('full_name, city, bio, avatar_url, cover_url')
        .eq('id', user.id)
        .maybeSingle();
      if (!mounted) return;
      if (data) {
        setFullName(data.full_name ?? '');
        setCity(data.city ?? 'Abidjan');
        setBio(data.bio ?? '');
        setAvatarUrl(data.avatar_url ?? null);
        setCoverUrl(data.cover_url ?? null);
      }
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [user?.id]);

  async function changeCover(source: 'gallery' | 'camera') {
    if (!user?.id || coverBusy) return;
    const asset = source === 'gallery' ? await pickCoverFromGallery() : await pickCoverFromCamera();
    if (!asset) return;
    setCoverBusy(true);
    try {
      const url = await uploadCover(user.id, asset);
      setCoverUrl(url);
    } catch (err: any) {
      Alert.alert('Erreur', err?.message ?? 'Upload impossible.');
    } finally {
      setCoverBusy(false);
    }
  }

  function askChangeCover() {
    Alert.alert('Photo de couverture', undefined, [
      { text: 'Galerie', onPress: () => changeCover('gallery') },
      { text: 'Caméra', onPress: () => changeCover('camera') },
      ...(coverUrl ? [{ text: 'Retirer la couverture', style: 'destructive' as const, onPress: () => removeCoverPhoto() }] : []),
      { text: 'Annuler', style: 'cancel' as const },
    ]);
  }

  async function removeCoverPhoto() {
    if (!user?.id) return;
    setCoverBusy(true);
    try {
      await removeCover(user.id);
      setCoverUrl(null);
    } catch (err: any) {
      Alert.alert('Erreur', err?.message ?? 'Suppression impossible.');
    } finally {
      setCoverBusy(false);
    }
  }

  async function changePhoto(source: 'gallery' | 'camera') {
    if (!user?.id || photoBusy) return;
    const asset = source === 'gallery' ? await pickAvatarFromGallery() : await pickAvatarFromCamera();
    if (!asset) return;
    setPhotoBusy(true);
    try {
      const url = await uploadAvatar(user.id, asset);
      setAvatarUrl(url);
    } catch (err: any) {
      Alert.alert('Erreur', err?.message ?? 'Upload impossible.');
    } finally {
      setPhotoBusy(false);
    }
  }

  function askChangePhoto() {
    Alert.alert('Changer ma photo', undefined, [
      { text: 'Galerie', onPress: () => changePhoto('gallery') },
      { text: 'Caméra', onPress: () => changePhoto('camera') },
      ...(avatarUrl ? [{ text: 'Retirer la photo', style: 'destructive' as const, onPress: () => removePhoto() }] : []),
      { text: 'Annuler', style: 'cancel' as const },
    ]);
  }

  async function removePhoto() {
    if (!user?.id) return;
    setPhotoBusy(true);
    try {
      await removeAvatar(user.id);
      setAvatarUrl(null);
    } catch (err: any) {
      Alert.alert('Erreur', err?.message ?? 'Suppression impossible.');
    } finally {
      setPhotoBusy(false);
    }
  }

  const initial = (fullName?.trim()?.[0] || user?.phone?.replace(/[+\s]/g, '')?.slice(-2, -1) || 'U').toUpperCase();

  async function save() {
    if (!user?.id) return;
    if (fullName.trim().length < 2) {
      Alert.alert('Nom requis', 'Indique ton nom complet (2 caractères minimum).');
      return;
    }
    setSaving(true);
    const { error } = await sb
      .from('profiles')
      .update({
        full_name: fullName.trim(),
        city: city.trim() || 'Abidjan',
        bio: bio.trim() || null,
      })
      .eq('id', user.id);
    setSaving(false);
    if (error) {
      Alert.alert('Erreur', error.message ?? 'Enregistrement impossible.');
      return;
    }
    Alert.alert('Profil mis à jour', 'Tes informations ont été enregistrées.', [
      { text: 'OK', onPress: () => router.back() },
    ]);
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Pressable hitSlop={10} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color={colors.dark} />
        </Pressable>
        <Text style={s.headerTitle}>Modifier le profil</Text>
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
            {/* Cover photo block (PR4 audit UX) — style FB/LinkedIn */}
            <Pressable
              onPress={askChangeCover}
              disabled={coverBusy}
              style={s.coverBlock}
              accessibilityRole="imagebutton"
              accessibilityLabel="Modifier la photo de couverture"
            >
              {coverUrl ? (
                <Image source={{ uri: coverUrl }} style={s.coverImg} resizeMode="cover" />
              ) : (
                <View style={[s.coverImg, s.coverPlaceholder]}>
                  <Ionicons name="image-outline" size={32} color={colors.neutral[400]} />
                  <Text style={s.coverPlaceholderText}>Ajouter une photo de couverture</Text>
                </View>
              )}
              {coverBusy ? (
                <View style={s.coverOverlay}><ActivityIndicator color="#fff" /></View>
              ) : (
                <View style={s.coverEditBadge}>
                  <Ionicons name="camera" size={14} color="#fff" />
                  <Text style={s.coverEditText}>{coverUrl ? 'Modifier' : 'Ajouter'}</Text>
                </View>
              )}
            </Pressable>

            {/* Avatar block */}
            <View style={s.avatarBlock}>
              <Pressable onPress={askChangePhoto} style={s.avatarWrap} disabled={photoBusy}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={s.avatarImg} />
                ) : (
                  <View style={[s.avatarImg, s.avatarPlaceholder]}>
                    <Text style={s.avatarLetter}>{initial}</Text>
                  </View>
                )}
                {photoBusy ? (
                  <View style={s.avatarOverlay}><ActivityIndicator color="#fff" /></View>
                ) : (
                  <View style={s.avatarBadge}>
                    <Ionicons name="camera" size={16} color="#fff" />
                  </View>
                )}
              </Pressable>
              <Pressable onPress={askChangePhoto} disabled={photoBusy} hitSlop={6}>
                <Text style={s.avatarHint}>{avatarUrl ? 'Changer la photo' : 'Ajouter une photo'}</Text>
              </Pressable>
            </View>

            <Text style={s.label}>Nom complet</Text>
            <TextInput
              value={fullName}
              onChangeText={setFullName}
              style={s.input}
              placeholder="Ton nom"
              placeholderTextColor={colors.neutral[400]}
              autoCapitalize="words"
            />

            <Text style={[s.label, s.spaced]}>Ville</Text>
            <TextInput
              value={city}
              onChangeText={setCity}
              style={s.input}
              placeholder="Abidjan"
              placeholderTextColor={colors.neutral[400]}
            />

            <Text style={[s.label, s.spaced]}>Bio</Text>
            <TextInput
              value={bio}
              onChangeText={setBio}
              style={[s.input, s.textArea]}
              placeholder="Quelques mots sur toi…"
              placeholderTextColor={colors.neutral[400]}
              multiline
              maxLength={280}
            />
            <Text style={s.counter}>{bio.length}/280</Text>

            <Pressable
              onPress={save}
              disabled={saving}
              style={({ pressed }) => [s.cta, pressed && { opacity: 0.85 }]}
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.ctaText}>Enregistrer</Text>}
            </Pressable>
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
  // PR4 cover photo
  coverBlock: {
    position: 'relative',
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.neutral[100],
    marginBottom: spacing.lg,
  },
  coverImg: { width: '100%', height: '100%' },
  coverPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderWidth: 2,
    borderColor: colors.neutral[200],
    borderStyle: 'dashed',
    borderRadius: radius.lg,
  },
  coverPlaceholderText: {
    fontSize: typography.fontSize.sm,
    color: colors.neutral[500],
    fontWeight: '600',
  },
  coverEditBadge: {
    position: 'absolute',
    bottom: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  coverEditText: { color: '#fff', fontSize: typography.fontSize.xs, fontWeight: '700' },
  coverOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarBlock: { alignItems: 'center', marginBottom: spacing.xl, gap: spacing.sm },
  avatarWrap: { width: 120, height: 120, position: 'relative' },
  avatarImg: { width: 120, height: 120, borderRadius: 60, backgroundColor: colors.primary[500] },
  avatarPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { color: '#fff', fontSize: 48, fontWeight: '700' },
  avatarBadge: {
    position: 'absolute', right: 4, bottom: 4,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.primary[500],
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: colors.light,
  },
  avatarOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 60, backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarHint: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.primary[500] },
  label: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.neutral[700], marginBottom: spacing.sm },
  spaced: { marginTop: spacing.base },
  input: {
    fontSize: typography.fontSize.base,
    borderWidth: 1, borderColor: colors.neutral[200], backgroundColor: '#fff',
    borderRadius: radius.md, paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    color: colors.dark,
  },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  counter: { marginTop: spacing.xs, fontSize: typography.fontSize.xs, color: colors.neutral[400], textAlign: 'right' },
  cta: {
    marginTop: spacing.xl, backgroundColor: colors.primary[500],
    paddingVertical: spacing.base, borderRadius: radius.md, alignItems: 'center', elevation: 2,
  },
  ctaText: { color: '#fff', fontWeight: '700', fontSize: typography.fontSize.base },
});
