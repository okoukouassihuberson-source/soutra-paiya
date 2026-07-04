// ============================================================================
// Écran "Ajouter un lieu" — contribution communautaire (PR 9/10 Découverte).
//
// Permet à n'importe quel utilisateur connecté de soumettre un nouveau venue
// à la modération admin. Champs : nom, catégorie, adresse, ville, téléphone,
// description, photo de couverture (optionnel). GPS auto-rempli si autorisé.
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import {
  typography, radius, spacing, type ColorPalette,
  VENUE_CATEGORIES, VENUE_CATEGORY_GROUPS,
  type VenueCategoryGroup, type VenueCategoryMeta,
} from '@soutra/shared';

type VenueCategory = VenueCategoryMeta['value'];
import { useColors } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { submitVenueSubmission } from '@/lib/venue-submissions';

const GROUP_ORDER: VenueCategoryGroup[] = [
  'restauration', 'hebergement', 'loisirs', 'sport',
  'commerce', 'education', 'sante', 'services', 'tourisme', 'autres',
];

export default function AddVenue() {
  const router = useRouter();
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const { user } = useAuth();

  const [name, setName] = useState('');
  const [category, setCategory] = useState<VenueCategory | ''>('');
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('Abidjan');
  const [district, setDistrict] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [website, setWebsite] = useState('');
  const [description, setDescription] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Au mount, tente de récupérer la position GPS (silencieux si refusé).
  useEffect(() => {
    (async () => {
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
        }
      } catch {}
    })();
  }, []);

  const requestGps = async () => {
    setGpsBusy(true);
    try {
      let perm = await Location.getForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        perm = await Location.requestForegroundPermissionsAsync();
      }
      if (perm.status !== 'granted') {
        Alert.alert('Permission refusée', 'Active la géolocalisation pour précisez l\'emplacement.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
    } catch (err: any) {
      Alert.alert('GPS indisponible', err?.message ?? 'Réessaie plus tard.');
    } finally {
      setGpsBusy(false);
    }
  };

  const pickCover = async () => {
    if (!user?.id) {
      Alert.alert('Connexion requise', 'Connecte-toi pour ajouter une photo.');
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission requise', 'Autorise l\'accès à tes photos.');
      return;
    }
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.7,
      allowsEditing: true,
      aspect: [16, 9],
    });
    if (r.canceled || !r.assets[0]) return;
    const asset = r.assets[0];
    if (!asset.base64) {
      Alert.alert('Erreur', 'Impossible de lire la photo.');
      return;
    }
    if (asset.fileSize && asset.fileSize > 8 * 1024 * 1024) {
      Alert.alert('Image trop lourde', 'Choisis une image de moins de 8 Mo.');
      return;
    }
    try {
      setUploading(true);
      const ext = (asset.uri.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const path = `${user.id}/submissions/${Date.now()}.${ext}`;
      const buf = decode(asset.base64);
      const { error: upErr } = await supabase.storage
        .from('social-media')
        .upload(path, buf, {
          contentType: asset.mimeType || `image/${ext}`,
          upsert: false,
        });
      if (upErr) throw new Error(upErr.message);
      const url = supabase.storage.from('social-media').getPublicUrl(path).data.publicUrl;
      setCoverUrl(url);
    } catch (err: any) {
      Alert.alert('Erreur upload', err?.message ?? 'Réessaie.');
    } finally {
      setUploading(false);
    }
  };

  const categoryLabel = category
    ? VENUE_CATEGORIES.find((m) => m.value === category)?.label ?? 'Catégorie'
    : 'Choisir une catégorie…';

  const canSubmit =
    !submitting &&
    !uploading &&
    name.trim().length >= 2 &&
    !!category &&
    address.trim().length >= 4;

  const submit = async () => {
    try {
      setSubmitting(true);
      const res = await submitVenueSubmission({
        name: name.trim(),
        category,
        address: address.trim(),
        city: city.trim() || 'Abidjan',
        district: district.trim() || undefined,
        phone: phone.trim() || undefined,
        whatsapp: whatsapp.trim() || undefined,
        website: website.trim() || undefined,
        description: description.trim() || undefined,
        lat: coords?.lat,
        lng: coords?.lng,
        coverUrl: coverUrl ?? undefined,
      });
      if (!res.ok && res.reason === 'ALREADY_SUBMITTED') {
        Alert.alert('Déjà soumis', 'Une contribution avec ce nom et cette adresse est déjà en cours d\'examen.');
      } else {
        Alert.alert(
          'Contribution envoyée ✓',
          'Merci ! L\'équipe Soutra-Playce va vérifier les infos et publier la fiche sous 24-48 h.',
          [{ text: 'OK', onPress: () => router.back() }],
        );
      }
    } catch (err: any) {
      const code = err?.message ?? '';
      const msg =
        code === 'NOT_AUTHENTICATED' ? 'Connecte-toi pour contribuer.'
        : code === 'NAME_REQUIRED' ? 'Renseigne le nom du lieu.'
        : code === 'ADDRESS_REQUIRED' ? 'Renseigne l\'adresse.'
        : code === 'INVALID_CATEGORY' ? 'Catégorie invalide.'
        : code || 'Impossible d\'envoyer la contribution.';
      Alert.alert('Erreur', msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={s.header}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="chevron-back" size={26} color={c.dark} />
          </Pressable>
          <Text style={s.headerTitle}>Ajouter un lieu</Text>
          <View style={{ width: 26 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl }} keyboardShouldPersistTaps="handled">
          <View style={s.banner}>
            <Ionicons name="information-circle" size={18} color={c.primary[600]} />
            <Text style={s.bannerText}>
              Tu connais un lieu pas encore listé ? Soumets-le, on le vérifie et on le publie pour toute la communauté.
            </Text>
          </View>

          {/* Cover photo (optionnel) */}
          <Text style={s.label}>Photo de couverture (optionnel)</Text>
          <Pressable
            onPress={pickCover}
            disabled={uploading || submitting}
            style={({ pressed }) => [s.coverBox, pressed && !uploading && { opacity: 0.85 }]}
          >
            {uploading ? (
              <ActivityIndicator color={c.primary[500]} />
            ) : coverUrl ? (
              <Image source={{ uri: coverUrl }} style={s.coverImg} />
            ) : (
              <>
                <Ionicons name="image-outline" size={30} color={c.neutral[500]} />
                <Text style={s.coverHint}>Toucher pour ajouter une photo</Text>
              </>
            )}
          </Pressable>

          {/* Nom */}
          <Text style={s.label}>Nom du lieu *</Text>
          <TextInput
            style={s.input}
            value={name}
            onChangeText={setName}
            placeholder="Ex : Restaurant Le Baobab"
            placeholderTextColor={c.neutral[400]}
            editable={!submitting}
          />

          {/* Catégorie */}
          <Text style={s.label}>Catégorie *</Text>
          <Pressable
            style={s.input}
            onPress={() => setShowCategoryPicker((v) => !v)}
            disabled={submitting}
          >
            <Text style={[s.inputText, !category && { color: c.neutral[500] }]}>{categoryLabel}</Text>
          </Pressable>
          {showCategoryPicker && (
            <View style={s.categoryPickerBox}>
              {GROUP_ORDER.map((g) => {
                const items = VENUE_CATEGORIES.filter((m) => m.group === g);
                if (items.length === 0) return null;
                return (
                  <View key={g}>
                    <Text style={s.categoryGroupLabel}>{VENUE_CATEGORY_GROUPS[g]}</Text>
                    <View style={s.categoryChipsRow}>
                      {items.map((m) => {
                        const active = category === m.value;
                        return (
                          <Pressable
                            key={m.value}
                            onPress={() => { setCategory(m.value); setShowCategoryPicker(false); }}
                            style={({ pressed }) => [
                              s.categoryChip,
                              active && s.categoryChipActive,
                              pressed && { opacity: 0.85 },
                            ]}
                          >
                            <Text style={{ fontSize: 14 }}>{m.emoji}</Text>
                            <Text style={[s.categoryChipText, active && { color: '#fff' }]}>{m.label}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* Adresse */}
          <Text style={s.label}>Adresse *</Text>
          <TextInput
            style={s.input}
            value={address}
            onChangeText={setAddress}
            placeholder="Ex : Rue des Jardins, Riviera 2"
            placeholderTextColor={c.neutral[400]}
            editable={!submitting}
          />

          {/* Ville + quartier */}
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Ville</Text>
              <TextInput
                style={s.input}
                value={city}
                onChangeText={setCity}
                placeholder="Abidjan"
                placeholderTextColor={c.neutral[400]}
                editable={!submitting}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Quartier</Text>
              <TextInput
                style={s.input}
                value={district}
                onChangeText={setDistrict}
                placeholder="Cocody, Plateau…"
                placeholderTextColor={c.neutral[400]}
                editable={!submitting}
              />
            </View>
          </View>

          {/* GPS */}
          <Text style={s.label}>Coordonnées GPS</Text>
          <Pressable
            style={({ pressed }) => [s.gpsBtn, pressed && { opacity: 0.85 }]}
            onPress={requestGps}
            disabled={gpsBusy || submitting}
          >
            {gpsBusy ? (
              <ActivityIndicator color={c.primary[600]} />
            ) : coords ? (
              <>
                <Ionicons name="checkmark-circle" size={18} color={c.success} />
                <Text style={s.gpsText}>
                  {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                </Text>
                <Text style={s.gpsSub}>Toucher pour recalibrer</Text>
              </>
            ) : (
              <>
                <Ionicons name="location-outline" size={18} color={c.primary[600]} />
                <Text style={s.gpsText}>Utiliser ma position actuelle</Text>
              </>
            )}
          </Pressable>

          {/* Contact */}
          <Text style={s.label}>Téléphone</Text>
          <TextInput
            style={s.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="+225 07 00 00 00 00"
            placeholderTextColor={c.neutral[400]}
            keyboardType="phone-pad"
            editable={!submitting}
          />

          <Text style={s.label}>WhatsApp (optionnel)</Text>
          <TextInput
            style={s.input}
            value={whatsapp}
            onChangeText={setWhatsapp}
            placeholder="+225 07 00 00 00 00"
            placeholderTextColor={c.neutral[400]}
            keyboardType="phone-pad"
            editable={!submitting}
          />

          <Text style={s.label}>Site web (optionnel)</Text>
          <TextInput
            style={s.input}
            value={website}
            onChangeText={setWebsite}
            placeholder="https://…"
            placeholderTextColor={c.neutral[400]}
            keyboardType="url"
            autoCapitalize="none"
            editable={!submitting}
          />

          {/* Description */}
          <Text style={s.label}>Description (optionnel)</Text>
          <TextInput
            style={[s.input, s.inputMultiline]}
            value={description}
            onChangeText={(v) => setDescription(v.slice(0, 2000))}
            placeholder="Décris brièvement le lieu, l'ambiance, la spécialité…"
            placeholderTextColor={c.neutral[400]}
            multiline
            textAlignVertical="top"
            editable={!submitting}
          />
          <Text style={s.counter}>{description.length} / 2000</Text>

          <Pressable
            disabled={!canSubmit}
            onPress={submit}
            style={({ pressed }) => [
              s.submitBtn,
              { backgroundColor: canSubmit ? c.primary[500] : c.neutral[200] },
              pressed && canSubmit && { opacity: 0.9 },
            ]}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={[s.submitText, { color: canSubmit ? '#fff' : c.neutral[500] }]}>
                Envoyer la contribution
              </Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.light },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
      borderBottomWidth: 1, borderBottomColor: c.neutral[100],
    },
    headerTitle: { fontSize: typography.fontSize.lg, fontWeight: '700', color: c.dark },
    banner: {
      flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
      backgroundColor: c.primary[50],
      borderRadius: radius.md, padding: spacing.md,
      marginBottom: spacing.lg,
    },
    bannerText: { flex: 1, fontSize: typography.fontSize.xs, color: c.primary[700], lineHeight: 17 },
    label: {
      fontSize: typography.fontSize.xs, fontWeight: '700',
      color: c.neutral[600], textTransform: 'uppercase', letterSpacing: 0.4,
      marginTop: spacing.md, marginBottom: 6,
    },
    input: {
      backgroundColor: c.neutral[50], borderRadius: radius.md,
      borderWidth: 1, borderColor: c.neutral[200],
      paddingHorizontal: spacing.md, paddingVertical: spacing.md,
      fontSize: typography.fontSize.base, color: c.dark,
    },
    inputText: { fontSize: typography.fontSize.base, color: c.dark },
    inputMultiline: { minHeight: 100 },
    row: { flexDirection: 'row', gap: spacing.md },
    counter: { fontSize: typography.fontSize.xs, color: c.neutral[500], textAlign: 'right', marginTop: 4 },

    coverBox: {
      height: 160,
      backgroundColor: c.neutral[50],
      borderRadius: radius.lg,
      borderWidth: 1, borderColor: c.neutral[200],
      borderStyle: 'dashed',
      alignItems: 'center', justifyContent: 'center',
      gap: spacing.xs,
      overflow: 'hidden',
    },
    coverImg: { width: '100%', height: '100%' },
    coverHint: { fontSize: typography.fontSize.xs, color: c.neutral[500] },

    categoryPickerBox: {
      marginTop: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1, borderColor: c.neutral[200],
      backgroundColor: c.neutral[50],
    },
    categoryGroupLabel: {
      fontSize: typography.fontSize.xs, fontWeight: '700',
      color: c.neutral[600], textTransform: 'uppercase', letterSpacing: 0.4,
      marginTop: spacing.sm, marginBottom: spacing.xs,
    },
    categoryChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
    categoryChip: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      paddingHorizontal: spacing.sm, paddingVertical: 6,
      borderRadius: radius.full,
      backgroundColor: '#fff',
      borderWidth: 1, borderColor: c.neutral[200],
    },
    categoryChipActive: { backgroundColor: c.primary[500], borderColor: c.primary[500] },
    categoryChipText: { fontSize: typography.fontSize.xs, color: c.dark, fontWeight: '600' },

    gpsBtn: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
      backgroundColor: c.primary[50],
      borderRadius: radius.md,
      borderWidth: 1, borderColor: c.primary[200],
      paddingHorizontal: spacing.md, paddingVertical: spacing.md,
      flexWrap: 'wrap',
    },
    gpsText: { fontSize: typography.fontSize.sm, fontWeight: '600', color: c.primary[700] },
    gpsSub: { fontSize: typography.fontSize.xs, color: c.neutral[600], marginLeft: spacing.xs },

    submitBtn: {
      marginTop: spacing.xl,
      paddingVertical: spacing.md,
      borderRadius: radius.full,
      alignItems: 'center',
    },
    submitText: { fontWeight: '700', fontSize: typography.fontSize.base },
  });
}
