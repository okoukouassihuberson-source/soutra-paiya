// ============================================================================
// Écran "Gérer mon établissement" — édition post-création.
//
// Complète ce que pro_create_venue (0061) ne collecte pas à la création :
// sous-catégorie, description enrichie, contacts, horaires détaillés, logo/
// couverture/galerie. Écrit directement sur `venues` (policy
// venues_owner_all, migration 0001) — pas de RPC nécessaire pour ces champs,
// contrairement à la création.
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView, Image,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import {
  typography, radius, spacing, type ColorPalette,
  VENUE_CATEGORIES, VENUE_CATEGORY_GROUPS,
  type VenueCategoryGroup, type VenueCategoryMeta,
} from '@soutra/shared';
import { useColors } from '@/lib/theme';
import {
  listMyProVenues, getVenueDetail, updateProVenue, uploadVenueMedia,
  type ProVenue, type VenueDetail,
} from '@/lib/pro-venue';

type VenueCategory = VenueCategoryMeta['value'];
type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

const GROUP_ORDER: VenueCategoryGroup[] = [
  'restauration', 'hebergement', 'loisirs', 'sport',
  'commerce', 'education', 'sante', 'services', 'tourisme', 'autres',
];
const WEEKDAYS: { id: DayKey; label: string }[] = [
  { id: 'mon', label: 'Lun' }, { id: 'tue', label: 'Mar' }, { id: 'wed', label: 'Mer' },
  { id: 'thu', label: 'Jeu' }, { id: 'fri', label: 'Ven' }, { id: 'sat', label: 'Sam' }, { id: 'sun', label: 'Dim' },
];
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export default function ProManage() {
  const router = useRouter();
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const params = useLocalSearchParams<{ venueId?: string }>();

  const [venueId, setVenueId] = useState<string | null>(params.venueId ?? null);
  const [myVenues, setMyVenues] = useState<ProVenue[] | null>(null);
  const [venue, setVenue] = useState<VenueDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  const [name, setName] = useState('');
  const [category, setCategory] = useState<VenueCategory | ''>('');
  const [subcategory, setSubcategory] = useState('');
  const [description, setDescription] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');
  const [address, setAddress] = useState('');
  const [selectedDays, setSelectedDays] = useState<DayKey[]>([]);
  const [openTime, setOpenTime] = useState('09:00');
  const [closeTime, setCloseTime] = useState('22:00');

  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [galleryUrls, setGalleryUrls] = useState<string[]>([]);
  const [uploadingKind, setUploadingKind] = useState<string | null>(null);

  // 1) Si pas de venueId passé en param, résout via la liste des venues du user.
  useEffect(() => {
    if (venueId) return;
    (async () => {
      try {
        const list = await listMyProVenues();
        setMyVenues(list);
        if (list.length === 1) setVenueId(list[0].id);
        else setLoading(false);
      } catch {
        setLoading(false);
      }
    })();
  }, [venueId]);

  // 2) Charge le détail complet une fois le venueId connu.
  useEffect(() => {
    if (!venueId) return;
    setLoading(true);
    (async () => {
      try {
        const v = await getVenueDetail(venueId);
        setVenue(v);
        setName(v.name);
        setCategory(v.category as VenueCategory);
        setSubcategory(v.subcategory ?? '');
        setDescription(v.description ?? '');
        setPhone(v.phone ?? '');
        setWhatsapp(v.whatsapp ?? '');
        setEmail(v.email ?? '');
        setCity(v.city ?? 'Abidjan');
        setDistrict(v.district ?? '');
        setAddress(v.address);
        setLogoUrl(v.logo_url);
        setCoverUrl(v.cover_url);
        setGalleryUrls(v.gallery_urls ?? []);
        const hours = v.opening_hours ?? {};
        const days = Object.keys(hours) as DayKey[];
        setSelectedDays(days);
        if (days.length && hours[days[0]]) {
          setOpenTime(hours[days[0]][0]);
          setCloseTime(hours[days[0]][1]);
        }
      } catch (err: any) {
        Alert.alert('Erreur', err?.message ?? 'Établissement introuvable.');
      } finally {
        setLoading(false);
      }
    })();
  }, [venueId]);

  function toggleDay(id: DayKey) {
    setSelectedDays((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]));
  }

  async function pickAndUpload(kind: 'logo' | 'cover' | 'gallery') {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission requise', 'Autorise l\'accès à tes photos.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7, base64: true, allowsEditing: kind !== 'gallery',
    });
    if (res.canceled || !res.assets[0]?.base64 || !venueId) return;
    setUploadingKind(kind);
    try {
      const url = await uploadVenueMedia(venueId, kind, res.assets[0].base64, galleryUrls);
      if (kind === 'logo') setLogoUrl(url);
      else if (kind === 'cover') setCoverUrl(url);
      else setGalleryUrls((prev) => [...prev, url]);
    } catch (err: any) {
      Alert.alert('Erreur upload', err?.message ?? 'Réessaie.');
    } finally {
      setUploadingKind(null);
    }
  }

  const categoryLabel = category ? VENUE_CATEGORIES.find((m) => m.value === category)?.label ?? 'Catégorie' : '—';

  async function save() {
    if (!venueId) return;
    if (name.trim().length < 2 || !category || address.trim().length < 4) {
      Alert.alert('Champs requis', 'Nom, catégorie et adresse sont obligatoires.');
      return;
    }
    if (selectedDays.length > 0 && (!TIME_RE.test(openTime) || !TIME_RE.test(closeTime))) {
      Alert.alert('Horaires invalides', 'Format attendu : HH:MM (ex. 09:00).');
      return;
    }
    setSaving(true);
    try {
      const opening_hours = Object.fromEntries(
        selectedDays.map((d) => [d, [openTime, closeTime] as [string, string]]),
      );
      await updateProVenue(venueId, {
        name: name.trim(), category, subcategory: subcategory.trim() || null,
        description: description.trim() || null,
        phone: phone.trim() || null, whatsapp: whatsapp.trim() || null, email: email.trim() || null,
        city: city.trim() || 'Abidjan', district: district.trim() || null, address: address.trim(),
        opening_hours,
      });
      Alert.alert('Enregistré ✓', 'Les informations de ton établissement sont à jour.');
    } catch (err: any) {
      Alert.alert('Erreur', err?.message ?? 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={s.center}><ActivityIndicator size="large" color={c.primary[500]} /></View>
      </SafeAreaView>
    );
  }

  if (!venueId && myVenues) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={s.header}>
          <Pressable onPress={() => router.back()} hitSlop={10}><Ionicons name="chevron-back" size={26} color={c.dark} /></Pressable>
          <Text style={s.headerTitle}>Gérer mon établissement</Text>
          <View style={{ width: 26 }} />
        </View>
        {myVenues.length === 0 ? (
          <View style={s.center}>
            <Ionicons name="storefront-outline" size={48} color={c.neutral[300]} />
            <Text style={s.emptyTitle}>Aucun établissement</Text>
            <Pressable onPress={() => router.push('/pro-create' as any)} style={[s.submitBtn, { backgroundColor: c.primary[500], marginTop: spacing.lg }]}>
              <Text style={s.submitText}>Créer mon établissement</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
            <Text style={s.label}>Choisis l'établissement à gérer</Text>
            {myVenues.map((v) => (
              <Pressable key={v.id} onPress={() => setVenueId(v.id)} style={s.venueRow}>
                <Text style={s.venueRowText}>{v.name}</Text>
                <Ionicons name="chevron-forward" size={18} color={c.neutral[400]} />
              </Pressable>
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.header}>
          <Pressable onPress={() => router.back()} hitSlop={10}><Ionicons name="chevron-back" size={26} color={c.dark} /></Pressable>
          <Text style={s.headerTitle}>Gérer mon établissement</Text>
          <View style={{ width: 26 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl }} keyboardShouldPersistTaps="handled">
          {venue?.status === 'active' && (
            <View style={[s.banner, { backgroundColor: c.secondary[50] }]}>
              <Ionicons name="checkmark-circle" size={18} color={c.success} />
              <Text style={[s.bannerText, { color: c.secondary[700] }]}>Visible sur Soutra-Playce</Text>
            </View>
          )}

          <Text style={s.section}>Informations générales</Text>
          <Text style={s.label}>Nom</Text>
          <TextInput style={s.input} value={name} onChangeText={setName} placeholderTextColor={c.neutral[400]} />

          <Text style={s.label}>Catégorie</Text>
          <Pressable style={s.input} onPress={() => setShowCategoryPicker((v) => !v)}>
            <Text style={s.inputText}>{categoryLabel}</Text>
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
                          <Pressable key={m.value} onPress={() => { setCategory(m.value); setShowCategoryPicker(false); }} style={[s.categoryChip, active && s.categoryChipActive]}>
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

          <Text style={s.label}>Sous-catégorie (optionnel)</Text>
          <TextInput style={s.input} value={subcategory} onChangeText={setSubcategory} placeholder="Ex. Maquis ivoirien" placeholderTextColor={c.neutral[400]} />

          <Text style={s.label}>Description</Text>
          <TextInput style={[s.input, s.inputMultiline]} value={description} onChangeText={(v) => setDescription(v.slice(0, 2000))} multiline textAlignVertical="top" placeholderTextColor={c.neutral[400]} />

          <Text style={s.section}>Contact</Text>
          <Text style={s.label}>Téléphone</Text>
          <TextInput style={s.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholderTextColor={c.neutral[400]} />
          <Text style={s.label}>WhatsApp</Text>
          <TextInput style={s.input} value={whatsapp} onChangeText={setWhatsapp} keyboardType="phone-pad" placeholderTextColor={c.neutral[400]} />
          <Text style={s.label}>E-mail</Text>
          <TextInput style={s.input} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholderTextColor={c.neutral[400]} />

          <Text style={s.section}>Localisation</Text>
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Ville</Text>
              <TextInput style={s.input} value={city} onChangeText={setCity} placeholderTextColor={c.neutral[400]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Quartier</Text>
              <TextInput style={s.input} value={district} onChangeText={setDistrict} placeholderTextColor={c.neutral[400]} />
            </View>
          </View>
          <Text style={s.label}>Adresse</Text>
          <TextInput style={s.input} value={address} onChangeText={setAddress} placeholderTextColor={c.neutral[400]} />

          <Text style={s.section}>Horaires d'ouverture</Text>
          <View style={s.categoryChipsRow}>
            {WEEKDAYS.map((d) => {
              const active = selectedDays.includes(d.id);
              return (
                <Pressable key={d.id} onPress={() => toggleDay(d.id)} style={[s.categoryChip, active && s.categoryChipActive]}>
                  <Text style={[s.categoryChipText, active && { color: '#fff' }]}>{d.label}</Text>
                </Pressable>
              );
            })}
          </View>
          {selectedDays.length > 0 && (
            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>Ouverture</Text>
                <TextInput style={s.input} value={openTime} onChangeText={setOpenTime} placeholder="09:00" placeholderTextColor={c.neutral[400]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>Fermeture</Text>
                <TextInput style={s.input} value={closeTime} onChangeText={setCloseTime} placeholder="22:00" placeholderTextColor={c.neutral[400]} />
              </View>
            </View>
          )}

          <Text style={s.section}>Photos</Text>
          <Text style={s.label}>Logo</Text>
          <Pressable onPress={() => pickAndUpload('logo')} disabled={uploadingKind === 'logo'}>
            {logoUrl ? <Image source={{ uri: logoUrl }} style={s.logoPreview} /> : (
              <View style={s.photoPicker}>
                {uploadingKind === 'logo' ? <ActivityIndicator color={c.primary[500]} /> : <Ionicons name="image-outline" size={24} color={c.primary[500]} />}
                <Text style={s.photoPickerText}>Ajouter un logo</Text>
              </View>
            )}
          </Pressable>

          <Text style={s.label}>Photo de couverture</Text>
          <Pressable onPress={() => pickAndUpload('cover')} disabled={uploadingKind === 'cover'}>
            {coverUrl ? <Image source={{ uri: coverUrl }} style={s.coverPreview} /> : (
              <View style={s.photoPicker}>
                {uploadingKind === 'cover' ? <ActivityIndicator color={c.primary[500]} /> : <Ionicons name="image-outline" size={24} color={c.primary[500]} />}
                <Text style={s.photoPickerText}>Ajouter une photo de couverture</Text>
              </View>
            )}
          </Pressable>

          <Text style={s.label}>Galerie</Text>
          <View style={s.galleryRow}>
            {galleryUrls.map((uri) => <Image key={uri} source={{ uri }} style={s.galleryThumb} />)}
            <Pressable onPress={() => pickAndUpload('gallery')} disabled={uploadingKind === 'gallery'} style={s.galleryAdd}>
              {uploadingKind === 'gallery' ? <ActivityIndicator color={c.primary[500]} /> : <Ionicons name="add" size={24} color={c.primary[500]} />}
            </Pressable>
          </View>

          <Pressable onPress={save} disabled={saving} style={({ pressed }) => [s.submitBtn, { backgroundColor: c.primary[500] }, pressed && { opacity: 0.9 }]}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.submitText}>Enregistrer</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.light },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: c.neutral[100],
    },
    headerTitle: { fontSize: typography.fontSize.lg, fontWeight: '700', color: c.dark },
    emptyTitle: { fontSize: typography.fontSize.base, fontWeight: '600', color: c.neutral[600] },
    banner: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      backgroundColor: c.primary[50], borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md,
    },
    bannerText: { fontSize: typography.fontSize.xs, fontWeight: '600' },
    section: { marginTop: spacing.lg, marginBottom: spacing.xs, fontSize: typography.fontSize.base, fontWeight: '700', color: c.dark },
    label: {
      fontSize: typography.fontSize.xs, fontWeight: '700', color: c.neutral[600],
      textTransform: 'uppercase', letterSpacing: 0.4, marginTop: spacing.md, marginBottom: 6,
    },
    input: {
      backgroundColor: c.neutral[50], borderRadius: radius.md, borderWidth: 1, borderColor: c.neutral[200],
      paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: typography.fontSize.base, color: c.dark,
    },
    inputText: { fontSize: typography.fontSize.base, color: c.dark },
    inputMultiline: { minHeight: 90 },
    row: { flexDirection: 'row', gap: spacing.md },
    categoryPickerBox: {
      marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.md,
      borderWidth: 1, borderColor: c.neutral[200], backgroundColor: c.neutral[50],
    },
    categoryGroupLabel: {
      fontSize: typography.fontSize.xs, fontWeight: '700', color: c.neutral[600],
      textTransform: 'uppercase', letterSpacing: 0.4, marginTop: spacing.sm, marginBottom: spacing.xs,
    },
    categoryChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
    categoryChip: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.full,
      backgroundColor: '#fff', borderWidth: 1, borderColor: c.neutral[200],
    },
    categoryChipActive: { backgroundColor: c.primary[500], borderColor: c.primary[500] },
    categoryChipText: { fontSize: typography.fontSize.xs, color: c.dark, fontWeight: '600' },
    photoPicker: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
      borderWidth: 1, borderStyle: 'dashed', borderColor: c.neutral[300], borderRadius: radius.md, paddingVertical: spacing.lg,
    },
    photoPickerText: { fontSize: typography.fontSize.sm, color: c.primary[500], fontWeight: '600' },
    logoPreview: { width: 96, height: 96, borderRadius: radius.md },
    coverPreview: { width: '100%', height: 150, borderRadius: radius.md },
    galleryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    galleryThumb: { width: 76, height: 76, borderRadius: radius.sm },
    galleryAdd: {
      width: 76, height: 76, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderStyle: 'dashed', borderColor: c.neutral[300],
    },
    venueRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: c.neutral[100],
    },
    venueRowText: { fontSize: typography.fontSize.base, color: c.dark, fontWeight: '600' },
    submitBtn: { marginTop: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.full, alignItems: 'center' },
    submitText: { fontWeight: '700', fontSize: typography.fontSize.base, color: '#fff' },
  });
}
