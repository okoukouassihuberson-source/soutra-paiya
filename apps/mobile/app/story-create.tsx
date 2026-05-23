import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors, typography, radius, spacing } from '@soutra/shared';
import { useAuth } from '@/lib/auth-context';
import { createStory } from '@/lib/stories';

export default function StoryCreate() {
  const router = useRouter();
  const { user } = useAuth();
  const [image, setImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [caption, setCaption] = useState('');
  const [posting, setPosting] = useState(false);

  // À l'ouverture de l'écran, on ouvre directement le picker.
  useEffect(() => {
    pickImage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pickImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission requise', 'Autorise l\'accès à tes photos.');
      router.back();
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.7,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets[0]) {
      router.back();
      return;
    }
    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > 8 * 1024 * 1024) {
      Alert.alert('Image trop lourde', 'Choisis une image de moins de 8 Mo.');
      router.back();
      return;
    }
    setImage(asset);
  }

  async function publish() {
    if (!user?.id) {
      Alert.alert('Connexion requise', 'Reconnecte-toi.');
      return;
    }
    if (!image) return;
    setPosting(true);
    try {
      await createStory({ userId: user.id, image, caption });
      router.back();
    } catch (err: any) {
      Alert.alert('Erreur', err?.message ?? 'Publication échouée.');
    } finally {
      setPosting(false);
    }
  }

  if (!image) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}><ActivityIndicator size="large" color={colors.primary[500]} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="close" size={26} color="#fff" />
        </Pressable>
        <Text style={s.title}>Nouvelle story</Text>
        <Pressable onPress={publish} disabled={posting} style={s.publishBtn}>
          {posting ? <ActivityIndicator color="#fff" /> : <Text style={s.publishLabel}>Publier</Text>}
        </Pressable>
      </View>

      <View style={s.preview}>
        <Image source={{ uri: image.uri }} style={s.previewImg} resizeMode="cover" />
        <View style={s.captionWrap}>
          <TextInput
            value={caption}
            onChangeText={(v) => v.length <= 140 && setCaption(v)}
            placeholder="Ajoute une légende (facultative)"
            placeholderTextColor="rgba(255,255,255,0.7)"
            style={s.captionInput}
            multiline
          />
        </View>
      </View>

      <Text style={s.hint}>Ta story sera visible pendant 24h.</Text>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#000' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, zIndex: 2 },
  title: { color: '#fff', fontSize: typography.fontSize.base, fontWeight: '700' },
  publishBtn: { backgroundColor: colors.primary[500], paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.full, minWidth: 84, alignItems: 'center' },
  publishLabel: { color: '#fff', fontWeight: '700', fontSize: typography.fontSize.sm },
  preview: { flex: 1, position: 'relative' },
  previewImg: { flex: 1, width: '100%' },
  captionWrap: { position: 'absolute', bottom: spacing.xl, left: spacing.lg, right: spacing.lg, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: radius.lg, padding: spacing.md },
  captionInput: { color: '#fff', fontSize: typography.fontSize.base, fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hint: { color: 'rgba(255,255,255,0.6)', textAlign: 'center', padding: spacing.md, fontSize: typography.fontSize.xs },
});
