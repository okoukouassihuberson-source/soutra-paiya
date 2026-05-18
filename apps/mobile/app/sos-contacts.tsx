import { useCallback, useEffect, useState } from 'react';
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

interface Contact {
  contact_name: string;
  contact_phone: string;
}

const POSITIONS = [1, 2, 3];

export default function SosContacts() {
  const router = useRouter();
  const { user } = useAuth();
  const sb = supabase as any;

  const [slots, setSlots] = useState<(Contact | null)[]>([null, null, null]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    const { data } = await sb
      .from('sos_contacts')
      .select('position, contact_name, contact_phone')
      .eq('user_id', user.id);
    const next: (Contact | null)[] = [null, null, null];
    for (const row of data ?? []) {
      const pos = Number(row.position);
      if (pos >= 1 && pos <= 3) {
        next[pos - 1] = { contact_name: row.contact_name, contact_phone: row.contact_phone };
      }
    }
    setSlots(next);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { void load(); }, [load]);

  function startEdit(position: number) {
    const existing = slots[position - 1];
    setName(existing?.contact_name ?? '');
    setPhone(existing?.contact_phone ?? '');
    setEditing(position);
  }

  function cancelEdit() {
    setEditing(null);
    setName('');
    setPhone('');
  }

  async function saveContact() {
    if (!user?.id || editing === null) return;
    if (name.trim().length < 2) {
      Alert.alert('Nom requis', 'Indique le nom du contact.');
      return;
    }
    if (phone.trim().length < 6) {
      Alert.alert('Numéro requis', 'Indique un numéro de téléphone valide.');
      return;
    }
    setSaving(true);
    const { error } = await sb
      .from('sos_contacts')
      .upsert(
        {
          user_id: user.id,
          position: editing,
          contact_name: name.trim(),
          contact_phone: phone.trim(),
        },
        { onConflict: 'user_id,position' },
      );
    setSaving(false);
    if (error) {
      Alert.alert('Erreur', error.message ?? 'Enregistrement impossible.');
      return;
    }
    cancelEdit();
    await load();
  }

  function removeContact(position: number) {
    if (!user?.id) return;
    Alert.alert('Supprimer', 'Retirer ce contact SOS ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          const { error } = await sb
            .from('sos_contacts')
            .delete()
            .eq('user_id', user.id)
            .eq('position', position);
          if (error) {
            Alert.alert('Erreur', error.message ?? 'Suppression impossible.');
            return;
          }
          await load();
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Pressable hitSlop={10} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color={colors.dark} />
        </Pressable>
        <Text style={s.headerTitle}>Mes contacts SOS</Text>
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
              <Ionicons name="medkit" size={22} color={colors.danger} />
              <Text style={s.infoText}>
                Jusqu'à 3 proches alertés automatiquement en cas d'urgence (SOS).
              </Text>
            </View>

            {POSITIONS.map((position) => {
              const contact = slots[position - 1];
              const isEditing = editing === position;

              if (isEditing) {
                return (
                  <View key={position} style={s.editCard}>
                    <Text style={s.slotLabel}>Contact {position}</Text>
                    <TextInput
                      value={name}
                      onChangeText={setName}
                      style={s.input}
                      placeholder="Nom du contact"
                      placeholderTextColor={colors.neutral[400]}
                      autoCapitalize="words"
                    />
                    <TextInput
                      value={phone}
                      onChangeText={setPhone}
                      style={[s.input, { marginTop: spacing.sm }]}
                      placeholder="Numéro de téléphone"
                      placeholderTextColor={colors.neutral[400]}
                      keyboardType="phone-pad"
                    />
                    <View style={s.editActions}>
                      <Pressable onPress={cancelEdit} style={[s.btn, s.btnGhost]}>
                        <Text style={s.btnGhostText}>Annuler</Text>
                      </Pressable>
                      <Pressable
                        onPress={saveContact}
                        disabled={saving}
                        style={[s.btn, s.btnPrimary]}
                      >
                        {saving
                          ? <ActivityIndicator color="#fff" size="small" />
                          : <Text style={s.btnPrimaryText}>Enregistrer</Text>}
                      </Pressable>
                    </View>
                  </View>
                );
              }

              if (contact) {
                return (
                  <View key={position} style={s.contactCard}>
                    <View style={s.contactBadge}>
                      <Text style={s.contactBadgeText}>{position}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.contactName}>{contact.contact_name}</Text>
                      <Text style={s.contactPhone}>{contact.contact_phone}</Text>
                    </View>
                    <Pressable hitSlop={8} onPress={() => startEdit(position)}>
                      <Ionicons name="create-outline" size={22} color={colors.neutral[500]} />
                    </Pressable>
                    <Pressable hitSlop={8} onPress={() => removeContact(position)} style={{ marginLeft: spacing.md }}>
                      <Ionicons name="trash-outline" size={22} color={colors.danger} />
                    </Pressable>
                  </View>
                );
              }

              return (
                <Pressable
                  key={position}
                  onPress={() => startEdit(position)}
                  style={({ pressed }) => [s.emptySlot, pressed && { opacity: 0.6 }]}
                >
                  <Ionicons name="add-circle-outline" size={22} color={colors.primary[500]} />
                  <Text style={s.emptyText}>Ajouter un contact ({position})</Text>
                </Pressable>
              );
            })}
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
    backgroundColor: '#FDECEC', borderRadius: radius.md, padding: spacing.base,
    marginBottom: spacing.base,
  },
  infoText: { flex: 1, fontSize: typography.fontSize.sm, color: colors.neutral[700], lineHeight: 20 },
  slotLabel: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.dark, marginBottom: spacing.sm },
  editCard: {
    backgroundColor: '#fff', borderRadius: radius.md, padding: spacing.base,
    marginTop: spacing.md, borderWidth: 1, borderColor: colors.primary[500],
  },
  input: {
    fontSize: typography.fontSize.base,
    borderWidth: 1, borderColor: colors.neutral[200], backgroundColor: '#fff',
    borderRadius: radius.md, paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    color: colors.dark,
  },
  editActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.base },
  btn: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: 'center' },
  btnGhost: { backgroundColor: colors.neutral[100] },
  btnGhostText: { color: colors.neutral[600], fontWeight: '600' },
  btnPrimary: { backgroundColor: colors.primary[500] },
  btnPrimaryText: { color: '#fff', fontWeight: '700' },
  contactCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: '#fff', borderRadius: radius.md, padding: spacing.base, marginTop: spacing.md,
  },
  contactBadge: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: colors.danger,
    alignItems: 'center', justifyContent: 'center',
  },
  contactBadgeText: { color: '#fff', fontWeight: '700' },
  contactName: { fontSize: typography.fontSize.base, fontWeight: '600', color: colors.dark },
  contactPhone: { fontSize: typography.fontSize.sm, color: colors.neutral[500], marginTop: 2 },
  emptySlot: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, justifyContent: 'center',
    borderWidth: 1, borderStyle: 'dashed', borderColor: colors.neutral[300],
    borderRadius: radius.md, paddingVertical: spacing.base, marginTop: spacing.md,
  },
  emptyText: { fontSize: typography.fontSize.sm, color: colors.primary[500], fontWeight: '600' },
});
