// ============================================================================
// ReviewFormSheet — bottom sheet de soumission / édition d'un avis.
//
// Modèle "avis vérifié" (migration 0076) : un avis doit être rattaché à une
// réservation/séjour/commande terminée et non encore notée par l'utilisateur.
// Flow : charge les visites éligibles -> 0 = état vide, 1 = auto-sélection,
// plusieurs = liste à choisir -> formulaire (étoiles + texte + photos).
// En mode édition (editingReview fourni), le picker de visite est sauté.
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { typography, radius, spacing, type ColorPalette } from '@soutra/shared';
import { useColors } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { StarRatingInput } from './StarRatingInput';
import {
  listMyReviewableVisits,
  submitReview,
  updateReview,
  type Review,
  type ReviewableVisit,
} from '@/lib/reviews';

interface Props {
  visible: boolean;
  onClose: () => void;
  venueId: string;
  venueName: string;
  editingReview?: Review | null;
  onSubmitted?: () => void;
}

const MAX_PHOTOS = 5;

export function ReviewFormSheet({ visible, onClose, venueId, venueName, editingReview, onSubmitted }: Props) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const { user } = useAuth();

  const isEdit = !!editingReview;

  const [loadingVisits, setLoadingVisits] = useState(false);
  const [visits, setVisits] = useState<ReviewableVisit[]>([]);
  const [selectedVisit, setSelectedVisit] = useState<ReviewableVisit | null>(null);

  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [photos, setPhotos] = useState<(string | null)[]>([null, null, null, null, null]);
  const [uploadingSlot, setUploadingSlot] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (isEdit && editingReview) {
      setRating(editingReview.rating);
      setBody(editingReview.body ?? '');
      const padded = [...editingReview.photos, null, null, null, null, null].slice(0, MAX_PHOTOS);
      setPhotos(padded);
      return;
    }
    setLoadingVisits(true);
    setSelectedVisit(null);
    listMyReviewableVisits(venueId)
      .then((list) => {
        setVisits(list);
        if (list.length === 1) setSelectedVisit(list[0]);
      })
      .catch(() => setVisits([]))
      .finally(() => setLoadingVisits(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, isEdit]);

  const reset = () => {
    setRating(0);
    setBody('');
    setPhotos([null, null, null, null, null]);
    setUploadingSlot(null);
    setSubmitting(false);
    setVisits([]);
    setSelectedVisit(null);
  };

  const close = () => {
    if (submitting || uploadingSlot !== null) return;
    reset();
    onClose();
  };

  const pickPhoto = async (slotIndex: number) => {
    if (!user?.id) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission requise', "Autorise l'accès à tes photos pour joindre une image.");
      return;
    }
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.7,
      allowsEditing: false,
    });
    if (r.canceled || !r.assets[0]) return;
    const asset = r.assets[0];
    if (asset.fileSize && asset.fileSize > 8 * 1024 * 1024) {
      Alert.alert('Image trop lourde', 'Choisis un fichier de moins de 8 Mo.');
      return;
    }
    if (!asset.base64) {
      Alert.alert('Erreur', 'Impossible de lire le fichier.');
      return;
    }
    try {
      setUploadingSlot(slotIndex);
      const ext = (asset.uri.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const path = `${user.id}/reviews/${venueId}/${slotIndex}-${Date.now()}.${ext}`;
      const buf = decode(asset.base64);
      const { error: upErr } = await supabase.storage
        .from('social-media')
        .upload(path, buf, { contentType: asset.mimeType || `image/${ext}`, upsert: false });
      if (upErr) throw new Error(upErr.message);
      const url = supabase.storage.from('social-media').getPublicUrl(path).data.publicUrl;
      setPhotos((prev) => prev.map((p, i) => (i === slotIndex ? url : p)));
    } catch (err: any) {
      Alert.alert('Erreur upload', err?.message ?? 'Réessaie.');
    } finally {
      setUploadingSlot(null);
    }
  };

  const removePhoto = (slotIndex: number) => {
    setPhotos((prev) => prev.map((p, i) => (i === slotIndex ? null : p)));
  };

  const canSubmit =
    rating > 0 && !submitting && uploadingSlot === null && (isEdit || !!selectedVisit);

  const errorMessage = (code: string) => {
    switch (code) {
      case 'NOT_AUTHENTICATED': return 'Connecte-toi pour laisser un avis.';
      case 'INVALID_RATING': return 'Sélectionne une note entre 1 et 5 étoiles.';
      case 'TOO_MANY_PHOTOS': return `Maximum ${MAX_PHOTOS} photos.`;
      case 'INELIGIBLE_RESERVATION':
      case 'INELIGIBLE_BOOKING':
      case 'INELIGIBLE_ORDER':
        return "Cette expérience n'est plus éligible à un avis.";
      case 'ALREADY_REVIEWED': return 'Tu as déjà noté cette expérience.';
      case 'NOT_FOUND_OR_FORBIDDEN': return 'Avis introuvable ou action non autorisée.';
      default: return code || "Impossible d'envoyer l'avis.";
    }
  };

  const submit = async () => {
    try {
      setSubmitting(true);
      const finalPhotos = photos.filter((p): p is string => !!p);
      if (isEdit && editingReview) {
        await updateReview(editingReview.id, { rating, body: body.trim() || undefined, photos: finalPhotos });
        Alert.alert('Avis modifié ✓', 'Merci, ton avis a été mis à jour.');
      } else if (selectedVisit) {
        await submitReview({
          venueId,
          rating,
          body: body.trim() || undefined,
          photos: finalPhotos,
          sourceType: selectedVisit.sourceType,
          sourceId: selectedVisit.sourceId,
        });
        Alert.alert('Avis publié ✓', 'Merci pour ton retour !');
      }
      onSubmitted?.();
      reset();
      onClose();
    } catch (err: any) {
      Alert.alert('Erreur', errorMessage(err?.message ?? ''));
      setSubmitting(false);
    }
  };

  const showVisitPicker = !isEdit && !loadingVisits && visits.length > 1 && !selectedVisit;
  const showEmptyState = !isEdit && !loadingVisits && visits.length === 0;
  const showForm = isEdit || (!loadingVisits && !!selectedVisit);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <KeyboardAvoidingView style={s.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Fermer" />

        <View style={s.sheet}>
          <View style={s.handle} />

          <View style={s.headerRow}>
            <Ionicons name="star" size={20} color={c.warning} />
            <Text style={s.title}>{isEdit ? 'Modifier ton avis' : 'Laisser un avis'}</Text>
            <Pressable hitSlop={10} onPress={close} style={s.closeBtn} disabled={submitting}>
              <Ionicons name="close" size={20} color={c.neutral[600]} />
            </Pressable>
          </View>

          <Text style={s.subtitle} numberOfLines={2}>{venueName}</Text>

          {loadingVisits && (
            <View style={s.center}>
              <ActivityIndicator color={c.primary[500]} />
            </View>
          )}

          {showEmptyState && (
            <View style={s.center}>
              <Ionicons name="information-circle-outline" size={36} color={c.neutral[400]} />
              <Text style={s.emptyText}>
                Tu dois avoir vécu une expérience terminée dans cet établissement (réservation, séjour ou commande) pour laisser un avis.
              </Text>
            </View>
          )}

          {showVisitPicker && (
            <ScrollView contentContainerStyle={{ paddingBottom: spacing.lg }}>
              <Text style={s.section}>Quelle expérience veux-tu noter ?</Text>
              {visits.map((v) => (
                <Pressable
                  key={`${v.sourceType}-${v.sourceId}`}
                  onPress={() => setSelectedVisit(v)}
                  style={({ pressed }) => [s.visitRow, pressed && { opacity: 0.85 }]}
                >
                  <Text style={s.visitLabel}>{v.label}</Text>
                  <Ionicons name="chevron-forward" size={18} color={c.neutral[400]} />
                </Pressable>
              ))}
            </ScrollView>
          )}

          {showForm && (
            <>
              <ScrollView contentContainerStyle={{ paddingBottom: spacing.lg }} keyboardShouldPersistTaps="handled">
                {selectedVisit && !isEdit && (
                  <Text style={s.visitContext}>{selectedVisit.label}</Text>
                )}

                <Text style={s.section}>Ta note</Text>
                <View style={{ marginBottom: spacing.md }}>
                  <StarRatingInput value={rating} onChange={setRating} size={36} disabled={submitting} />
                </View>

                <Text style={s.section}>Ton commentaire (optionnel)</Text>
                <TextInput
                  style={[s.input, s.inputMultiline]}
                  value={body}
                  onChangeText={(v) => setBody(v.slice(0, 1000))}
                  placeholder="Partage ton expérience…"
                  placeholderTextColor={c.neutral[400]}
                  multiline
                  textAlignVertical="top"
                  editable={!submitting}
                />
                <Text style={s.counter}>{body.length} / 1000</Text>

                <Text style={[s.section, { marginTop: spacing.md }]}>Photos (optionnel)</Text>
                <View style={s.photoGrid}>
                  {photos.map((url, i) => {
                    const isUp = uploadingSlot === i;
                    return url ? (
                      <View key={i} style={s.photoPreviewWrap}>
                        <Image source={{ uri: url }} style={s.photoPreview} />
                        <Pressable onPress={() => removePhoto(i)} style={s.photoRemove} hitSlop={6} disabled={submitting}>
                          <Ionicons name="close" size={14} color="#fff" />
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable
                        key={i}
                        onPress={() => pickPhoto(i)}
                        style={({ pressed }) => [s.photoAddBtn, pressed && { opacity: 0.85 }]}
                        disabled={isUp || submitting}
                      >
                        {isUp ? (
                          <ActivityIndicator color={c.primary[600]} />
                        ) : (
                          <Ionicons name="camera-outline" size={22} color={c.primary[600]} />
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>

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
                    {isEdit ? 'Enregistrer' : 'Publier mon avis'}
                  </Text>
                )}
              </Pressable>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: c.light,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.lg,
      maxHeight: '92%',
    },
    handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: c.neutral[200], marginTop: 6 },
    headerRow: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: c.neutral[100],
    },
    title: { flex: 1, fontSize: typography.fontSize.lg, fontWeight: '700', color: c.dark },
    closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: c.neutral[100], alignItems: 'center', justifyContent: 'center' },
    subtitle: { fontSize: typography.fontSize.sm, color: c.neutral[600], fontWeight: '600', marginTop: spacing.xs, marginBottom: spacing.sm },
    center: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
    emptyText: { fontSize: typography.fontSize.sm, color: c.neutral[600], textAlign: 'center', paddingHorizontal: spacing.lg, lineHeight: 20 },
    section: { fontSize: typography.fontSize.xs, fontWeight: '700', color: c.neutral[500], textTransform: 'uppercase', letterSpacing: 0.4, marginTop: spacing.sm, marginBottom: spacing.sm },
    visitRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingVertical: spacing.md, paddingHorizontal: spacing.md,
      borderRadius: radius.lg, borderWidth: 1, borderColor: c.neutral[200],
      backgroundColor: c.neutral[50], marginBottom: spacing.sm,
    },
    visitLabel: { fontSize: typography.fontSize.sm, fontWeight: '600', color: c.dark },
    visitContext: { fontSize: typography.fontSize.xs, color: c.primary[600], fontWeight: '700', marginBottom: spacing.sm },
    input: {
      backgroundColor: c.neutral[50], borderRadius: radius.md, borderWidth: 1, borderColor: c.neutral[200],
      padding: spacing.md, fontSize: typography.fontSize.base, color: c.dark,
    },
    inputMultiline: { minHeight: 90, paddingTop: spacing.md },
    counter: { fontSize: typography.fontSize.xs, color: c.neutral[500], textAlign: 'right', marginTop: 4 },
    photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    photoAddBtn: {
      width: 64, height: 64, borderRadius: radius.md,
      borderWidth: 1.5, borderColor: c.primary[200], borderStyle: 'dashed',
      backgroundColor: c.primary[50], alignItems: 'center', justifyContent: 'center',
    },
    photoPreviewWrap: { position: 'relative' },
    photoPreview: { width: 64, height: 64, borderRadius: radius.md, backgroundColor: c.neutral[100] },
    photoRemove: {
      position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10,
      backgroundColor: c.danger, alignItems: 'center', justifyContent: 'center',
      borderWidth: 2, borderColor: c.light,
    },
    submitBtn: { marginTop: spacing.md, paddingVertical: spacing.md, borderRadius: radius.full, alignItems: 'center' },
    submitText: { fontWeight: '700', fontSize: typography.fontSize.base },
  });
}
