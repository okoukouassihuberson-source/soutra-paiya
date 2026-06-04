import { useCallback, useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  Pressable,
  StyleSheet,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, radius, spacing } from '@soutra/shared';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import {
  hasPaymentPin,
  isBiometricAvailable,
  isBiometricEnabled,
  setBiometricEnabled as persistBiometric,
} from '@/lib/security';
import { useAccessibilityMode } from '@/lib/accessibility';

export default function Settings() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { enabled: accessibilityOn, setEnabled: setAccessibilityOn } = useAccessibilityMode();

  const [fullName, setFullName] = useState('');
  const [hasPin, setHasPin] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(false);

  const phone = user?.phone ? `+${user.phone.replace(/^\+/, '')}` : '';

  const load = useCallback(async () => {
    if (!user?.id) return;
    const [profileRes, pin, bioAvail, bioOn] = await Promise.all([
      supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
      hasPaymentPin(),
      isBiometricAvailable(),
      isBiometricEnabled(),
    ]);
    setFullName((profileRes.data as any)?.full_name || '');
    setHasPin(pin);
    setBioAvailable(bioAvail);
    setBioEnabled(bioOn);
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const toggleBiometric = async (value: boolean) => {
    if (value && !hasPin) {
      Alert.alert('Code PIN requis', "Définis d'abord un code PIN de paiement.");
      return;
    }
    setBioEnabled(value);
    await persistBiometric(value);
  };

  const confirmSignOut = () => {
    Alert.alert('Déconnexion', 'Veux-tu te déconnecter ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Se déconnecter', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Pressable hitSlop={10} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color={colors.dark} />
        </Pressable>
        <Text style={s.headerTitle}>Paramètres</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['2xl'] }}>
        <View style={s.profileCard}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>
              {(fullName || phone || '?').charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.profileName}>{fullName || 'Mon compte'}</Text>
            <Text style={s.profilePhone}>{phone}</Text>
          </View>
        </View>

        <Text style={s.section}>Compte</Text>
        <View style={s.group}>
          <Row
            icon="person-outline"
            label="Mon profil"
            onPress={() => router.push('/profile-edit')}
          />
          <Row
            icon="shield-checkmark-outline"
            label="Vérification d'identité (KYC)"
            onPress={() => router.push('/kyc')}
          />
          <Row
            icon="notifications-outline"
            label="Notifications"
            onPress={() => router.push('/notifications-settings' as any)}
          />

          {/* Mode accessibilité (Phase 6) — toggle global */}
          <View style={s.row}>
            <Ionicons name="accessibility-outline" size={22} color={colors.neutral[600]} />
            <View style={{ flex: 1 }}>
              <Text style={s.rowLabel}>Mode accessibilité (voix)</Text>
              <Text style={s.rowHint}>
                Ouvre Sia direct au lancement, lit les écrans et tes réponses à voix haute.
              </Text>
            </View>
            <Switch
              value={accessibilityOn}
              onValueChange={(v) => { void setAccessibilityOn(v); }}
              trackColor={{ true: colors.primary[500], false: colors.neutral[300] }}
            />
          </View>
        </View>

        <Text style={s.section}>Sécurité</Text>
        <View style={s.group}>
          <Row
            icon="keypad-outline"
            label="Code PIN de paiement"
            value={hasPin ? 'Activé' : 'Non défini'}
            onPress={() => router.push('/security-pin')}
          />
          <View style={s.row}>
            <Ionicons name="finger-print-outline" size={22} color={colors.neutral[600]} />
            <View style={{ flex: 1 }}>
              <Text style={s.rowLabel}>Déverrouillage biométrique</Text>
              {!bioAvailable && (
                <Text style={s.rowHint}>Non disponible sur cet appareil</Text>
              )}
              {bioAvailable && !hasPin && (
                <Text style={s.rowHint}>Définis d'abord un code PIN</Text>
              )}
            </View>
            <Switch
              value={bioEnabled}
              onValueChange={toggleBiometric}
              disabled={!bioAvailable || !hasPin}
              trackColor={{ true: colors.primary[500], false: colors.neutral[300] }}
            />
          </View>
          <Row
            icon="lock-closed-outline"
            label="Changer le mot de passe"
            onPress={() => router.push('/change-password')}
            last
          />
        </View>

        <View style={[s.group, { marginTop: spacing.xl }]}>
          <Pressable
            style={({ pressed }) => [s.row, pressed && { opacity: 0.6 }]}
            onPress={confirmSignOut}
          >
            <Ionicons name="log-out-outline" size={22} color={colors.danger} />
            <Text style={[s.rowLabel, { color: colors.danger, flex: 1 }]}>
              Se déconnecter
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({
  icon,
  label,
  value,
  onPress,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [s.row, !last && s.rowBorder, pressed && { opacity: 0.6 }]}
      onPress={onPress}
    >
      <Ionicons name={icon} size={22} color={colors.neutral[600]} />
      <Text style={[s.rowLabel, { flex: 1 }]}>{label}</Text>
      {!!value && <Text style={s.rowValue}>{value}</Text>}
      <Ionicons name="chevron-forward" size={18} color={colors.neutral[400]} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.light },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.base,
  },
  headerTitle: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.dark },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    padding: spacing.lg,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: radius.full,
    backgroundColor: colors.primary[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: typography.fontSize.lg, fontWeight: '700' },
  profileName: { fontSize: typography.fontSize.base, fontWeight: '700', color: colors.dark },
  profilePhone: { fontSize: typography.fontSize.sm, color: colors.neutral[500], marginTop: 2 },
  section: {
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
    color: colors.neutral[500],
    textTransform: 'uppercase',
  },
  group: {
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.neutral[100] },
  rowLabel: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.dark },
  rowHint: { fontSize: typography.fontSize.xs, color: colors.neutral[500], marginTop: 2 },
  rowValue: { fontSize: typography.fontSize.sm, color: colors.neutral[500] },
});
