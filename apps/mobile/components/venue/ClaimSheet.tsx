// ============================================================================
// ClaimSheet — bottom sheet "Revendiquer cet établissement" + KYC pro.
//
// L'utilisateur joint trois documents (CNI, registre de commerce, preuve
// optionnelle) + des infos déclaratives (nom de l'entité, rôle, téléphone).
// Upload via le bucket `social-media` existant (chemin `<user_id>/claims/…`)
// puis appel RPC `submit_venue_claim`.
// ============================================================================
import { useMemo, useState } from 'react';
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
import { submitVenueClaim } from '@/lib/venue-claims';

interface Props {
  visible: boolean;
  onClose: () => void;
  venueId: string;
  venueName: string;
  onSubmitted?: () => void;
}

type DocSlot = 'id' | 'business' | 'proof';

interface SlotMeta {
  key: DocSlot;
  label: string;
  hint: string;
  required: boolean;
}

const SLOTS: SlotMeta[] = [
  { key: 'id',       label: 'Pièce d\'identité',     hint: 'CNI, passeport ou permis recto',        required: true  },
  { key: 'business', label: 'Justificatif d\'activité', hint: 'Registre de commerce, facture, etc.', required: true  },
  { key: 'proof',    label: 'Preuve complémentaire', hint: 'Photo de la devanture (optionnel)',    required: false },
];

export function ClaimSheet({ visible, onClose, venueId, venueName, onSubmitted }: Props) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const { user } = useAuth();

  const [businessName, setBusinessName] = useState('');
  const [businessRole, setBusinessRole] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [docs, setDocs] = useState<Record<DocSlot, string | null>>({
    id: null, business: null, proof: null,
  });
  const [uploadingSlot, setUploadingSlot] = useState<DocSlot | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setBusinessName('');
    setBusinessRole('');
    setContactPhone('');
    setNotes('');
    setDocs({ id: null, business: null, proof: null });
    setUploadingSlot(null);
    setSubmitting(false);
  };

  const close = () => {
    if (submitting || uploadingSlot) return;
    reset();
    onClose();
  };

  const pickDoc = async (slot: DocSlot) => {
    if (!user?.id) {
      Alert.alert('Connexion requise', 'Connecte-toi pour revendiquer cet établissement.');
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission requise', 'Autorise l\'accès à tes photos pour joindre le document.');
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
      setUploadingSlot(slot);
      const ext = (asset.uri.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const path = `${user.id}/claims/${venueId}/${slot}-${Date.now()}.${ext}`;
      const buf = decode(asset.base64);
      const { error: upErr } = await supabase.storage
        .from('social-media')
        .upload(path, buf, {
          contentType: asset.mimeType || `image/${ext}`,
          upsert: false,
        });
      if (upErr) throw new Error(upErr.message);
      const url = supabase.storage.from('social-media').getPublicUrl(path).data.publicUrl;
      setDocs((prev) => ({ ...prev, [slot]: url }));
    } catch (err: any) {
      Alert.alert('Erreur upload', err?.message ?? 'Réessaie.');
    } finally {
      setUploadingSlot(null);
    }
  };

  const canSubmit =
    !submitting &&
    !uploadingSlot &&
    !!docs.id &&
    !!docs.business &&
    businessName.trim().length >= 2 &&
    contactPhone.trim().length >= 8;

  const submit = async () => {
    try {
      setSubmitting(true);
      const res = await submitVenueClaim({
        venueId,
        idDocUrl: docs.id ?? undefined,
        businessDocUrl: docs.business ?? undefined,
        proofUrl: docs.proof ?? undefined,
        businessName: businessName.trim() || undefined,
        businessRole: businessRole.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      if (!res.ok && res.reason === 'ALREADY_OWNER') {
        Alert.alert('Déjà propriétaire', 'Tu possèdes déjà cet établissement.');
      } else if (!res.ok && res.reason === 'ALREADY_PENDING') {
        Alert.alert('Demande en cours', 'Tu as déjà une demande en cours pour ce lieu.');
      } else {
        Alert.alert(
          'Demande envoyée ✓',
          'L\'équipe Soutra-Explore va vérifier ton dossier sous 24-48 h. Tu seras notifié.',
        );
        onSubmitted?.();
      }
      reset();
      onClose();
    } catch (err: any) {
      const code = err?.message ?? '';
      const msg =
        code === 'NOT_AUTHENTICATED' ? 'Connecte-toi pour revendiquer un établissement.'
        : code === 'VENUE_NOT_ACTIVE' ? 'Ce lieu n\'est pas activé.'
        : code === 'VENUE_NOT_FOUND' ? 'Lieu introuvable.'
        : code || 'Impossible d\'envoyer la demande.';
      Alert.alert('Erreur', msg);
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <KeyboardAvoidingView
        style={s.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Fermer" />

        <View style={s.sheet}>
          <View style={s.handle} />

          <View style={s.headerRow}>
            <Ionicons name="shield-checkmark" size={20} color={c.primary[600]} />
            <Text style={s.title}>Revendiquer ce lieu</Text>
            <Pressable hitSlop={10} onPress={close} style={s.closeBtn} disabled={submitting}>
              <Ionicons name="close" size={20} color={c.neutral[600]} />
            </Pressable>
          </View>

          <Text style={s.subtitle} numberOfLines={2}>{venueName}</Text>

          <View style={s.banner}>
            <Ionicons name="information-circle" size={18} color={c.primary[600]} />
            <Text style={s.bannerText}>
              Une fois validé, tu pourras gérer la fiche, les promos, les réservations et les analytics depuis l'espace Pro.
            </Text>
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: spacing.lg }} keyboardShouldPersistTaps="handled">
            <Text style={s.section}>Documents KYC</Text>
            {SLOTS.map((slot) => {
              const url = docs[slot.key];
              const isUp = uploadingSlot === slot.key;
              return (
                <View key={slot.key} style={s.docRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.docLabel}>
                      {slot.label}{slot.required && <Text style={{ color: c.danger }}> *</Text>}
                    </Text>
                    <Text style={s.docHint}>{slot.hint}</Text>
                  </View>
                  {url ? (
                    <View style={s.docPreviewWrap}>
                      <Image source={{ uri: url }} style={s.docPreview} />
                      <Pressable
                        onPress={() => pickDoc(slot.key)}
                        style={s.docReplace}
                        hitSlop={6}
                        disabled={isUp || submitting}
                      >
                        <Ionicons name="refresh" size={14} color="#fff" />
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable
                      onPress={() => pickDoc(slot.key)}
                      style={({ pressed }) => [s.docBtn, pressed && { opacity: 0.85 }]}
                      disabled={isUp || submitting}
                    >
                      {isUp ? (
                        <ActivityIndicator color={c.primary[600]} />
                      ) : (
                        <>
                          <Ionicons name="cloud-upload-outline" size={18} color={c.primary[600]} />
                          <Text style={s.docBtnText}>Joindre</Text>
                        </>
                      )}
                    </Pressable>
                  )}
                </View>
              );
            })}

            <Text style={[s.section, { marginTop: spacing.lg }]}>Informations légales</Text>

            <Text style={s.label}>Nom de l'entité (SARL, SAS…) *</Text>
            <TextInput
              style={s.input}
              value={businessName}
              onChangeText={setBusinessName}
              placeholder="Ex : Maquis Le Baobab SARL"
              placeholderTextColor={c.neutral[400]}
              editable={!submitting}
            />

            <Text style={[s.label, { marginTop: spacing.sm }]}>Ton rôle</Text>
            <TextInput
              style={s.input}
              value={businessRole}
              onChangeText={setBusinessRole}
              placeholder="Gérant, propriétaire, etc."
              placeholderTextColor={c.neutral[400]}
              editable={!submitting}
            />

            <Text style={[s.label, { marginTop: spacing.sm }]}>Téléphone à rappeler *</Text>
            <TextInput
              style={s.input}
              value={contactPhone}
              onChangeText={setContactPhone}
              placeholder="+225 07 00 00 00 00"
              placeholderTextColor={c.neutral[400]}
              keyboardType="phone-pad"
              editable={!submitting}
            />

            <Text style={[s.label, { marginTop: spacing.sm }]}>Notes (optionnel)</Text>
            <TextInput
              style={[s.input, s.inputMultiline]}
              value={notes}
              onChangeText={(v) => setNotes(v.slice(0, 2000))}
              placeholder="Précise tout ce qui aide à valider la demande…"
              placeholderTextColor={c.neutral[400]}
              multiline
              textAlignVertical="top"
              editable={!submitting}
            />
            <Text style={s.counter}>{notes.length} / 2000</Text>
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
                Envoyer la demande
              </Text>
            )}
          </Pressable>
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
    handle: {
      alignSelf: 'center',
      width: 40, height: 4, borderRadius: 2,
      backgroundColor: c.neutral[200], marginTop: 6,
    },
    headerRow: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      paddingVertical: spacing.md,
      borderBottomWidth: 1, borderBottomColor: c.neutral[100],
    },
    title: { flex: 1, fontSize: typography.fontSize.lg, fontWeight: '700', color: c.dark },
    closeBtn: {
      width: 32, height: 32, borderRadius: 16,
      backgroundColor: c.neutral[100],
      alignItems: 'center', justifyContent: 'center',
    },
    subtitle: {
      fontSize: typography.fontSize.sm, color: c.neutral[600], fontWeight: '600',
      marginTop: spacing.xs, marginBottom: spacing.sm,
    },
    banner: {
      flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
      backgroundColor: c.primary[50],
      borderRadius: radius.md, padding: spacing.md,
      marginBottom: spacing.md,
    },
    bannerText: {
      flex: 1, fontSize: typography.fontSize.xs,
      color: c.primary[700], lineHeight: 17,
    },
    section: {
      fontSize: typography.fontSize.xs, fontWeight: '700',
      color: c.neutral[500], textTransform: 'uppercase', letterSpacing: 0.4,
      marginTop: spacing.sm, marginBottom: spacing.sm,
    },
    docRow: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.md,
      paddingVertical: spacing.sm,
      borderBottomWidth: 1, borderBottomColor: c.neutral[100],
    },
    docLabel: { fontSize: typography.fontSize.sm, fontWeight: '600', color: c.dark },
    docHint: { fontSize: typography.fontSize.xs, color: c.neutral[600], marginTop: 2 },
    docBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: c.primary[50],
      borderRadius: radius.full,
      paddingHorizontal: spacing.md, paddingVertical: 8,
      borderWidth: 1, borderColor: c.primary[200],
      minWidth: 92, justifyContent: 'center',
    },
    docBtnText: { color: c.primary[700], fontSize: typography.fontSize.xs, fontWeight: '700' },
    docPreviewWrap: { position: 'relative' },
    docPreview: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: c.neutral[100] },
    docReplace: {
      position: 'absolute', bottom: -4, right: -4,
      width: 22, height: 22, borderRadius: 11,
      backgroundColor: c.primary[500],
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 2, borderColor: c.light,
    },
    label: { fontSize: typography.fontSize.xs, fontWeight: '600', color: c.neutral[700], marginBottom: 4 },
    input: {
      backgroundColor: c.neutral[50],
      borderRadius: radius.md,
      borderWidth: 1, borderColor: c.neutral[200],
      padding: spacing.md,
      fontSize: typography.fontSize.base, color: c.dark,
    },
    inputMultiline: { minHeight: 80, paddingTop: spacing.md },
    counter: { fontSize: typography.fontSize.xs, color: c.neutral[500], textAlign: 'right', marginTop: 4 },
    submitBtn: {
      marginTop: spacing.md,
      paddingVertical: spacing.md,
      borderRadius: radius.full,
      alignItems: 'center',
    },
    submitText: { fontWeight: '700', fontSize: typography.fontSize.base },
  });
}
