import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, radius, spacing } from '@soutra/shared';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

interface ProfileRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  kyc_status: string | null;
  referral_code: string | null;
  role: string | null;
}

export default function Profile() {
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<ProfileRow | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let mounted = true;
    (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, phone, email, kyc_status, referral_code, role')
        .eq('id', user.id)
        .maybeSingle();
      if (!mounted) return;
      if (error) {
        console.error('[profile] load error:', error);
      } else {
        setProfile(data as ProfileRow | null);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  const displayName = profile?.full_name?.trim() || profile?.phone || user?.phone || 'Utilisateur';
  const initial = (profile?.full_name?.trim()?.[0] ?? user?.phone?.replace(/[+\s]/g, '')?.slice(-2, -1) ?? 'U').toUpperCase();
  const kycLabel = (() => {
    switch (profile?.kyc_status) {
      case 'verified': return '✓ Vérifié';
      case 'pending': return '⏳ En cours';
      case 'rejected': return '✗ Rejeté';
      default: return 'Non vérifié';
    }
  })();
  const kycColor =
    profile?.kyc_status === 'verified'
      ? colors.success
      : profile?.kyc_status === 'rejected'
      ? colors.danger
      : colors.warning;

  const handleMenuPress = (label: string) => {
    switch (label) {
      case 'Modifier le profil':
        Alert.alert('Bientôt disponible', 'Modification du profil en construction.');
        break;
      case 'Vérification KYC':
        Alert.alert(
          'Vérification KYC',
          'Le KYC est nécessaire pour augmenter tes limites au-delà de 200 000 FCFA. Bientôt disponible.'
        );
        break;
      case 'Mes contacts SOS':
        Alert.alert('Contacts SOS', 'Gestion des contacts SOS en construction.');
        break;
      case 'Code de parrainage':
        Alert.alert(
          'Code de parrainage',
          profile?.referral_code
            ? `Ton code : ${profile.referral_code}\n\nPartage-le pour gagner 500 FCFA par filleul.`
            : 'Ton code de parrainage est en cours de génération.'
        );
        break;
      case "Centre d'aide":
        Alert.alert('Centre d\'aide', 'Tu peux nous contacter à support@soutra.ci');
        break;
      case 'Conditions & Confidentialité':
        Alert.alert(
          'CGU & Confidentialité',
          'Les CGU et la politique de confidentialité seront bientôt disponibles ici.'
        );
        break;
      default:
        break;
    }
  };

  const handleSignOut = () => {
    Alert.alert('Déconnexion', 'Veux-tu vraiment te déconnecter ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Se déconnecter', style: 'destructive', onPress: () => { void signOut(); } },
    ]);
  };

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        <View style={s.avatarRow}>
          <View style={s.avatar}>
            <Text style={s.avatarLetter}>{initial}</Text>
          </View>
          <View style={{ marginLeft: spacing.base, flex: 1 }}>
            <Text style={s.name}>{displayName}</Text>
            <Text style={[s.kyc, { color: kycColor }]}>KYC : {kycLabel}</Text>
          </View>
        </View>

        <View style={s.menu}>
          {[
            { label: 'Modifier le profil', icon: 'person-outline' as const },
            { label: 'Vérification KYC', icon: 'shield-checkmark-outline' as const },
            { label: 'Mes contacts SOS', icon: 'medkit-outline' as const },
            { label: 'Code de parrainage', icon: 'gift-outline' as const },
            { label: "Centre d'aide", icon: 'help-circle-outline' as const },
            { label: 'Conditions & Confidentialité', icon: 'document-text-outline' as const },
          ].map((it) => (
            <Pressable
              key={it.label}
              style={({ pressed }) => [s.menuItem, pressed && { opacity: 0.6 }]}
              onPress={() => handleMenuPress(it.label)}
            >
              <Ionicons name={it.icon} size={22} color={colors.dark} />
              <Text style={s.menuLabel}>{it.label}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.neutral[400]} />
            </Pressable>
          ))}
        </View>

        <Pressable
          onPress={handleSignOut}
          style={({ pressed }) => [s.signOut, pressed && { opacity: 0.7 }]}
        >
          <Text style={s.signOutText}>Se déconnecter</Text>
        </Pressable>
        <Text style={s.version}>Version 0.1.2 · Beta</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.light },
  avatarRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xl },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primary[500], alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { color: '#fff', fontSize: 24, fontWeight: '700' },
  name: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.dark },
  kyc: { fontSize: typography.fontSize.xs, marginTop: 2 },
  menu: { backgroundColor: '#fff', borderRadius: radius.lg, overflow: 'hidden' },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.base, padding: spacing.base, borderBottomColor: colors.neutral[100], borderBottomWidth: 1 },
  menuLabel: { flex: 1, fontSize: typography.fontSize.base, color: colors.dark },
  signOut: { marginTop: spacing.xl, padding: spacing.base, alignItems: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.danger },
  signOutText: { color: colors.danger, fontWeight: '600' },
  version: { textAlign: 'center', marginTop: spacing.lg, color: colors.neutral[400], fontSize: typography.fontSize.xs },
});
