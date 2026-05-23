import { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, Image, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors, typography, radius, spacing } from '@soutra/shared';
import { useAuth } from '@/lib/auth-context';
import { createPost } from '@/lib/social';

const MAX_LEN = 1000;

export default function PostCreate() {
  const router = useRouter();
  const { user } = useAuth();
  const [body, setBody] = useState('');
  const [image, setImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [posting, setPosting] = useState(false);

  async function pickImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission requise', 'Autorise l\'accès à tes photos pour publier une image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.7,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    // Garde-fou taille (8 Mo équivalent base64 ~ 11 Mo)
    if (asset.fileSize && asset.fileSize > 8 * 1024 * 1024) {
      Alert.alert('Image trop lourde', 'Choisis une image de moins de 8 Mo.');
      return;
    }
    setImage(asset);
  }

  async function publish() {
    if (!user?.id) {
      Alert.alert('Connexion requise', 'Reconnecte-toi pour publier.');
      return;
    }
    if (!body.trim() && !image) {
      Alert.alert('Post vide', 'Ajoute un texte ou une image.');
      return;
    }
    setPosting(true);
    try {
      await createPost({ userId: user.id, body, image });
      router.back();
    } catch (err: any) {
      Alert.alert('Erreur', err?.message ?? 'Publication échouée.');
    } finally {
      setPosting(false);
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="close" size={26} color={colors.dark} />
        </Pressable>
        <Text style={s.title}>Nouveau post</Text>
        <Pressable onPress={publish} disabled={posting} style={[s.publishBtn, (!body.trim() && !image) && s.publishBtnDisabled]}>
          {posting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={s.publishLabel}>Publier</Text>
          )}
        </Pressable>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
          <TextInput
            value={body}
            onChangeText={(v) => v.length <= MAX_LEN && setBody(v)}
            placeholder="Quoi de neuf ?"
            placeholderTextColor={colors.neutral[400]}
            multiline
            style={s.input}
            autoFocus
          />
          <Text style={s.counter}>{body.length} / {MAX_LEN}</Text>

          {image && (
            <View style={s.preview}>
              <Image source={{ uri: image.uri }} style={s.previewImg} resizeMode="cover" />
              <Pressable onPress={() => setImage(null)} style={s.removeBtn} hitSlop={10}>
                <Ionicons name="close-circle" size={28} color="#fff" />
              </Pressable>
            </View>
          )}

          <View style={s.tools}>
            <Pressable onPress={pickImage} style={s.toolBtn}>
              <Ionicons name="image-outline" size={22} color={colors.primary[500]} />
              <Text style={s.toolLabel}>{image ? 'Changer la photo' : 'Ajouter une photo'}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.light },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.neutral[200],
  },
  title: { fontSize: typography.fontSize.base, fontWeight: '700', color: colors.dark },
  publishBtn: {
    backgroundColor: colors.primary[500],
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    borderRadius: radius.full, minWidth: 80, alignItems: 'center',
  },
  publishBtnDisabled: { backgroundColor: colors.neutral[300] },
  publishLabel: { color: '#fff', fontWeight: '700', fontSize: typography.fontSize.sm },
  input: { fontSize: typography.fontSize.base, color: colors.dark, minHeight: 140, textAlignVertical: 'top' },
  counter: { textAlign: 'right', fontSize: typography.fontSize.xs, color: colors.neutral[400], marginTop: spacing.xs },
  preview: { marginTop: spacing.md, borderRadius: radius.lg, overflow: 'hidden', position: 'relative' },
  previewImg: { width: '100%', aspectRatio: 4 / 3, backgroundColor: colors.neutral[100] },
  removeBtn: { position: 'absolute', top: spacing.sm, right: spacing.sm },
  tools: { marginTop: spacing.lg, flexDirection: 'row', gap: spacing.md },
  toolBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.base, paddingVertical: spacing.sm,
    backgroundColor: colors.primary[50], borderRadius: radius.full,
  },
  toolLabel: { fontSize: typography.fontSize.sm, color: colors.primary[600], fontWeight: '600' },
});
