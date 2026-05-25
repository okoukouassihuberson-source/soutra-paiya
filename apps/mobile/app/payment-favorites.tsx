import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  Pressable,
  StyleSheet,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { typography, radius, spacing, type ColorPalette } from '@soutra/shared';
import { useColors } from '@/lib/theme';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Skeleton } from '@/components/Skeleton';
import {
  listPaymentFavorites,
  addPaymentFavoriteByPhone,
  removePaymentFavorite,
  renamePaymentFavorite,
  type PaymentFavorite,
} from '@/lib/payment-favorites';

export default function PaymentFavorites() {
  const router = useRouter();
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  const [favs, setFavs] = useState<PaymentFavorite[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<PaymentFavorite | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await listPaymentFavorites();
      setFavs(data);
    } catch (err: any) {
      console.error('[payment-favorites] load:', err);
      Alert.alert('Erreur', err?.message ?? 'Impossible de charger les favoris.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  const onUse = (f: PaymentFavorite) => {
    if (!f.phone) {
      Alert.alert('Numéro indisponible', "Ce contact n'a plus de numéro associé.");
      return;
    }
    router.push({ pathname: '/send', params: { phone: f.phone } });
  };

  const onDelete = (f: PaymentFavorite) => {
    Alert.alert(
      'Retirer le favori',
      `Retirer ${f.display_name} de tes favoris ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Retirer',
          style: 'destructive',
          onPress: async () => {
            try {
              await removePaymentFavorite(f.favorite_user_id);
              setFavs((cur) => cur.filter((x) => x.favorite_user_id !== f.favorite_user_id));
            } catch (err: any) {
              Alert.alert('Erreur', err?.message ?? 'Suppression impossible.');
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader
        title="Mes favoris"
        subtitle="Bénéficiaires en accès rapide"
        trailing={
          <Pressable hitSlop={10} onPress={() => setAddOpen(true)} style={s.headerBtn}>
            <Ionicons name="add" size={22} color={c.primary[600]} />
          </Pressable>
        }
      />

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['2xl'] }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading ? (
          <View>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} width="100%" height={72} borderRadius={16} style={{ marginBottom: spacing.sm }} />
            ))}
          </View>
        ) : favs.length === 0 ? (
          <View style={s.empty}>
            <View style={s.emptyIconWrap}>
              <Ionicons name="star-outline" size={36} color={c.primary[400]} />
            </View>
            <Text style={s.emptyTitle}>Pas encore de favoris</Text>
            <Text style={s.emptyText}>
              Ajoute tes proches ou tes vendeurs récurrents pour les retrouver en un tap depuis l'écran « Envoyer ».
            </Text>
            <Pressable onPress={() => setAddOpen(true)} style={s.emptyBtn}>
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={s.emptyBtnText}>Ajouter un favori</Text>
            </Pressable>
          </View>
        ) : (
          favs.map((f) => (
            <FavoriteRow
              key={f.favorite_user_id}
              c={c}
              fav={f}
              onUse={() => onUse(f)}
              onEdit={() => setEditing(f)}
              onDelete={() => onDelete(f)}
            />
          ))
        )}
      </ScrollView>

      <AddFavoriteModal
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onAdded={() => { setAddOpen(false); load(); }}
      />
      <RenameFavoriteModal
        fav={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(); }}
      />
    </SafeAreaView>
  );
}

function FavoriteRow({
  c,
  fav,
  onUse,
  onEdit,
  onDelete,
}: {
  c: ColorPalette;
  fav: PaymentFavorite;
  onUse: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const s = useMemo(() => makeStyles(c), [c]);
  const initial = (fav.display_name || '?').trim().charAt(0).toUpperCase();
  return (
    <View style={s.favRow}>
      <Pressable style={s.favLeft} onPress={onUse}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>{initial}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.favName} numberOfLines={1}>{fav.display_name}</Text>
          {fav.phone && (
            <Text style={s.favPhone} numberOfLines={1}>
              {fav.phone}
              {fav.label && fav.full_name ? ` · ${fav.full_name}` : ''}
            </Text>
          )}
        </View>
      </Pressable>
      <Pressable hitSlop={8} onPress={onEdit} style={s.favAction}>
        <Ionicons name="create-outline" size={18} color={c.neutral[600]} />
      </Pressable>
      <Pressable hitSlop={8} onPress={onDelete} style={s.favAction}>
        <Ionicons name="trash-outline" size={18} color={c.danger} />
      </Pressable>
    </View>
  );
}

function AddFavoriteModal({
  visible,
  onClose,
  onAdded,
}: {
  visible: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const [phone, setPhone] = useState('+225');
  const [label, setLabel] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!/^\+225[0-9]{10}$/.test(phone)) {
      Alert.alert('Numéro invalide', 'Format attendu : +225 suivi de 10 chiffres.');
      return;
    }
    try {
      setSubmitting(true);
      await addPaymentFavoriteByPhone(phone, label.trim() || undefined);
      setPhone('+225');
      setLabel('');
      onAdded();
    } catch (err: any) {
      const code = err?.message ?? '';
      const msg =
        code === 'RECIPIENT_NOT_FOUND'
          ? "Aucun compte Soutra-Playce n'est associé à ce numéro."
          : code === 'SELF_FAVORITE'
            ? 'Tu ne peux pas t\'ajouter toi-même.'
            : code || "Impossible d'ajouter ce favori.";
      Alert.alert('Erreur', msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={s.modalBackdrop}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={s.modalSheet}>
          <View style={s.modalHandle} />
          <Text style={s.modalTitle}>Ajouter un favori</Text>
          <Text style={s.modalSub}>Saisis le numéro du bénéficiaire.</Text>

          <Text style={s.fieldLabel}>Numéro</Text>
          <View style={s.fieldBox}>
            <Ionicons name="call-outline" size={18} color={c.neutral[500]} />
            <TextInput
              value={phone}
              onChangeText={(t) => setPhone(t.replace(/[^0-9+]/g, ''))}
              placeholder="+225XXXXXXXXXX"
              placeholderTextColor={c.neutral[400]}
              keyboardType="phone-pad"
              maxLength={14}
              style={s.fieldInput}
              editable={!submitting}
            />
          </View>

          <Text style={s.fieldLabel}>Alias (optionnel)</Text>
          <View style={s.fieldBox}>
            <Ionicons name="pricetag-outline" size={18} color={c.neutral[500]} />
            <TextInput
              value={label}
              onChangeText={setLabel}
              placeholder="Maman, Loyer, Pizza Bro…"
              placeholderTextColor={c.neutral[400]}
              maxLength={60}
              style={s.fieldInput}
              editable={!submitting}
            />
          </View>

          <Pressable
            disabled={submitting}
            onPress={submit}
            style={({ pressed }) => [
              s.modalConfirmBtn,
              { backgroundColor: c.primary[500] },
              pressed && { opacity: 0.9 },
            ]}
          >
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.modalConfirmText}>Ajouter</Text>}
          </Pressable>
          <Pressable onPress={onClose} style={s.modalCancelBtn} disabled={submitting}>
            <Text style={s.modalCancelText}>Annuler</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function RenameFavoriteModal({
  fav,
  onClose,
  onSaved,
}: {
  fav: PaymentFavorite | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const [label, setLabel] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Hydrate quand on ouvre sur un nouveau favori.
  useEffect(() => {
    if (fav) setLabel(fav.label ?? '');
  }, [fav?.favorite_user_id, fav]);

  const submit = async () => {
    if (!fav) return;
    try {
      setSubmitting(true);
      await renamePaymentFavorite(fav.favorite_user_id, label.trim());
      onSaved();
    } catch (err: any) {
      Alert.alert('Erreur', err?.message ?? 'Renommage impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={!!fav} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={s.modalBackdrop}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={s.modalSheet}>
          <View style={s.modalHandle} />
          <Text style={s.modalTitle}>Renommer</Text>
          <Text style={s.modalSub}>{fav?.full_name || fav?.phone || ''}</Text>

          <Text style={s.fieldLabel}>Alias</Text>
          <View style={s.fieldBox}>
            <Ionicons name="pricetag-outline" size={18} color={c.neutral[500]} />
            <TextInput
              value={label}
              onChangeText={setLabel}
              placeholder="Ex. Maman, Loyer…"
              placeholderTextColor={c.neutral[400]}
              maxLength={60}
              style={s.fieldInput}
              editable={!submitting}
              autoFocus
            />
          </View>

          <Pressable
            disabled={submitting}
            onPress={submit}
            style={({ pressed }) => [
              s.modalConfirmBtn,
              { backgroundColor: c.primary[500] },
              pressed && { opacity: 0.9 },
            ]}
          >
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.modalConfirmText}>Enregistrer</Text>}
          </Pressable>
          <Pressable onPress={onClose} style={s.modalCancelBtn} disabled={submitting}>
            <Text style={s.modalCancelText}>Annuler</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.light },
    headerBtn: {
      width: 40, height: 40, borderRadius: 20,
      backgroundColor: c.primary[50],
      alignItems: 'center', justifyContent: 'center',
    },

    favRow: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      backgroundColor: c.neutral[50],
      borderRadius: radius.lg,
      paddingHorizontal: spacing.md, paddingVertical: spacing.md,
      borderWidth: 1, borderColor: c.neutral[100],
      marginBottom: spacing.sm,
    },
    favLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    avatar: {
      width: 44, height: 44, borderRadius: 22,
      backgroundColor: c.primary[100],
      alignItems: 'center', justifyContent: 'center',
    },
    avatarText: { fontSize: typography.fontSize.lg, fontWeight: '700', color: c.primary[700] },
    favName: { fontSize: typography.fontSize.sm, fontWeight: '700', color: c.dark },
    favPhone: { fontSize: typography.fontSize.xs, color: c.neutral[500], marginTop: 2 },
    favAction: {
      width: 36, height: 36, borderRadius: 18,
      alignItems: 'center', justifyContent: 'center',
    },

    empty: { padding: spacing.xl, alignItems: 'center' },
    emptyIconWrap: {
      width: 80, height: 80, borderRadius: 40,
      backgroundColor: c.primary[50],
      alignItems: 'center', justifyContent: 'center',
      marginBottom: spacing.md,
    },
    emptyTitle: { fontSize: typography.fontSize.base, fontWeight: '700', color: c.dark, marginBottom: spacing.xs },
    emptyText: { fontSize: typography.fontSize.sm, color: c.neutral[500], textAlign: 'center', maxWidth: 320, lineHeight: 20 },
    emptyBtn: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      backgroundColor: c.primary[500],
      paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
      borderRadius: radius.full,
      marginTop: spacing.lg,
    },
    emptyBtnText: { color: '#fff', fontWeight: '700' },

    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalSheet: {
      backgroundColor: c.light,
      borderTopLeftRadius: 24, borderTopRightRadius: 24,
      padding: spacing.lg,
      paddingBottom: spacing['2xl'],
    },
    modalHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: c.neutral[200], marginBottom: spacing.md },
    modalTitle: { fontSize: typography.fontSize.lg, fontWeight: '700', color: c.dark },
    modalSub: { fontSize: typography.fontSize.sm, color: c.neutral[600], marginTop: 4 },

    fieldLabel: { fontSize: typography.fontSize.xs, color: c.neutral[600], fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3, marginTop: spacing.lg, marginBottom: spacing.sm },
    fieldBox: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      borderWidth: 1.5, borderColor: c.neutral[200],
      borderRadius: radius.lg,
      paddingHorizontal: spacing.md, paddingVertical: spacing.md,
      backgroundColor: c.neutral[50],
    },
    fieldInput: { flex: 1, fontSize: typography.fontSize.base, color: c.dark, padding: 0 },

    modalConfirmBtn: { marginTop: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.full, alignItems: 'center' },
    modalConfirmText: { color: '#fff', fontWeight: '700', fontSize: typography.fontSize.base },
    modalCancelBtn: { marginTop: spacing.sm, padding: spacing.sm, alignItems: 'center' },
    modalCancelText: { color: c.neutral[600], fontWeight: '600' },
  });
}
