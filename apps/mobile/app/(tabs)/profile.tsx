import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, radius, spacing } from '@soutra/shared';
import { useAuth } from '@/lib/auth-context';

export default function Profile() {
  const { session, signOut } = useAuth();
  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        <View style={s.avatarRow}>
          <View style={s.avatar}><Text style={s.avatarLetter}>{(session?.user?.phone ?? 'U')[1] || 'U'}</Text></View>
          <View style={{ marginLeft: spacing.base }}>
            <Text style={s.name}>{session?.user?.phone ?? 'Utilisateur'}</Text>
            <Text style={s.kyc}>KYC : non vérifié</Text>
          </View>
        </View>

        <View style={s.menu}>
          {[
            { label: 'Modifier le profil', icon: 'person-outline' as const },
            { label: 'Vérification KYC', icon: 'shield-checkmark-outline' as const },
            { label: 'Mes contacts SOS', icon: 'medkit-outline' as const },
            { label: 'Code de parrainage', icon: 'gift-outline' as const },
            { label: 'Centre d\'aide', icon: 'help-circle-outline' as const },
            { label: 'Conditions & Confidentialité', icon: 'document-text-outline' as const },
          ].map((it) => (
            <Pressable key={it.label} style={s.menuItem}>
              <Ionicons name={it.icon} size={22} color={colors.dark} />
              <Text style={s.menuLabel}>{it.label}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.neutral[400]} />
            </Pressable>
          ))}
        </View>

        <Pressable onPress={signOut} style={s.signOut}>
          <Text style={s.signOutText}>Se déconnecter</Text>
        </Pressable>
        <Text style={s.version}>Version 0.1.0 · Beta</Text>
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
  kyc: { fontSize: typography.fontSize.xs, color: colors.warning, marginTop: 2 },
  menu: { backgroundColor: '#fff', borderRadius: radius.lg, overflow: 'hidden' },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.base, padding: spacing.base, borderBottomColor: colors.neutral[100], borderBottomWidth: 1 },
  menuLabel: { flex: 1, fontSize: typography.fontSize.base, color: colors.dark },
  signOut: { marginTop: spacing.xl, padding: spacing.base, alignItems: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.danger },
  signOutText: { color: colors.danger, fontWeight: '600' },
  version: { textAlign: 'center', marginTop: spacing.lg, color: colors.neutral[400], fontSize: typography.fontSize.xs },
});
