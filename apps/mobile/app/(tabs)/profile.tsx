import { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Alert, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, radius, spacing } from '@soutra/shared';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { Skeleton } from '@/components/Skeleton';

interface ProfileRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  kyc_status: string | null;
  referral_code: string | null;
  role: string | null;
  avatar_url: string | null;
}

type Stats = { reservations: number; posts: number; matches: number } | null;

export default function Profile() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [stats, setStats] = useState<Stats>(null);

  useFocusEffect(
    useCallback(() => {
      if (!user?.id) return;
      let active = true;
      (async () => {
        const [profileRes, resCount, postCount, matchRes] = await Promise.all([
          supabase
            .from('profiles')
            .select('id, full_name, phone, email, kyc_status, referral_code, role, avatar_url')
            .eq('id', user.id)
            .maybeSingle(),
          (supabase as any)
            .from('reservations')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id),
          (supabase as any)
            .from('posts')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id),
          (supabase as any).rpc('list_my_matches'),
        ]);
        if (!active) return;
        if (profileRes.error) {
          console.error('[profile] load error:', profileRes.error);
        } else {
          setProfile(profileRes.data as ProfileRow | null);
        }
        setStats({
          reservations: resCount.count ?? 0,
          posts: postCount.count ?? 0,
          matches: Array.isArray(matchRes.data) ? matchRes.data.length : 0,
        });
      })();
      return () => { active = false; };
    }, [user?.id]),
  );

  const displayName = profile?.full_name?.trim() || profile?.phone || user?.phone || 'Utilisateur';
  const initial = (profile?.full_name?.trim()?.[0] ?? user?.phone?.replace(/[+\s]/g, '')?.slice(-2, -1) ?? 'U').toUpperCase();
  const kyc = kycMeta(profile?.kyc_status);

  const handleSignOut = () => {
    Alert.alert('Déconnexion', 'Veux-tu vraiment te déconnecter ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Se déconnecter', style: 'destructive', onPress: () => { void signOut(); } },
    ]);
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing['2xl'] }}>
        {/* Hero header */}
        <View style={s.hero}>
          <View style={s.bgCircle1} />
          <View style={s.bgCircle2} />

          {/* Top bar : settings */}
          <View style={s.heroTop}>
            <Text style={s.heroEyebrow}>Mon profil</Text>
            <Pressable onPress={() => router.push('/profile-edit' as any)} hitSlop={10} style={s.heroAction}>
              <Ionicons name="create-outline" size={18} color="#fff" />
            </Pressable>
          </View>

          {/* Avatar + nom */}
          <Pressable onPress={() => router.push('/profile-edit' as any)} style={s.avatarWrap}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={s.avatarImg} />
            ) : (
              <View style={[s.avatarImg, s.avatarFallback]}>
                <Text style={s.avatarLetter}>{initial}</Text>
              </View>
            )}
            <View style={s.avatarEditBadge}>
              <Ionicons name="camera" size={12} color="#fff" />
            </View>
          </Pressable>
          <Text style={s.heroName} numberOfLines={1}>{displayName}</Text>
          {profile?.phone && <Text style={s.heroPhone}>{profile.phone}</Text>}

          <View style={[s.kycPill, { backgroundColor: kyc.bg }]}>
            <Ionicons name={kyc.icon} size={12} color={kyc.color} />
            <Text style={[s.kycText, { color: kyc.color }]}>{kyc.label}</Text>
          </View>
        </View>

        {/* Stats */}
        <View style={s.statsRow}>
          <StatCard label="Réservations" value={stats?.reservations} icon="ticket" />
          <StatCard label="Posts" value={stats?.posts} icon="chatbubble" />
          <StatCard label="Matchs" value={stats?.matches} icon="heart" />
        </View>

        {/* Menu Mon compte */}
        <View style={s.sectionTitleRow}>
          <View style={s.sectionAccent} />
          <Text style={s.sectionTitle}>Mon compte</Text>
        </View>
        <View style={s.menu}>
          <MenuItem icon="person-outline" label="Modifier le profil" onPress={() => router.push('/profile-edit' as any)} />
          <MenuItem icon="shield-checkmark-outline" label="Vérification KYC" badge={kyc.label} badgeColor={kyc.color} onPress={() => router.push('/kyc' as any)} />
          <MenuItem icon="heart-outline" label="Mes favoris" onPress={() => router.push('/favorites' as any)} />
          <MenuItem icon="medkit-outline" label="Mes contacts SOS" onPress={() => router.push('/sos-contacts' as any)} last />
        </View>

        {/* Menu Programme */}
        <View style={s.sectionTitleRow}>
          <View style={s.sectionAccent} />
          <Text style={s.sectionTitle}>Programme</Text>
        </View>
        <View style={s.menu}>
          <MenuItem
            icon="gift-outline"
            label="Code de parrainage"
            value={profile?.referral_code ?? '…'}
            onPress={() => Alert.alert(
              'Code de parrainage',
              profile?.referral_code
                ? `Ton code : ${profile.referral_code}\n\nPartage-le pour gagner 500 FCFA par filleul.`
                : 'Ton code de parrainage est en cours de génération.'
            )}
            last
          />
        </View>

        {/* Menu Aide */}
        <View style={s.sectionTitleRow}>
          <View style={s.sectionAccent} />
          <Text style={s.sectionTitle}>Aide & légal</Text>
        </View>
        <View style={s.menu}>
          <MenuItem icon="sparkles-outline" label="Assistant Soutra" badge="IA" badgeColor={colors.primary[500]} onPress={() => router.push('/assistant' as any)} />
          <MenuItem icon="help-circle-outline" label="Centre d'aide" onPress={() => Alert.alert('Centre d\'aide', 'Pose ta question à l\'Assistant Soutra (au-dessus), ou écris à support@soutra.ci.')} />
          <MenuItem icon="document-text-outline" label="Conditions & Confidentialité" onPress={() => Alert.alert('CGU & Confidentialité', 'Les CGU et la politique de confidentialité seront bientôt disponibles ici.')} last />
        </View>

        {/* Sign out + version */}
        <Pressable
          onPress={handleSignOut}
          style={({ pressed }) => [s.signOut, pressed && { opacity: 0.8, transform: [{ scale: 0.97 }] }]}
        >
          <Ionicons name="log-out-outline" size={18} color={colors.danger} />
          <Text style={s.signOutText}>Se déconnecter</Text>
        </Pressable>
        <Text style={s.version}>Soutra-Playce · Version 0.1.2 · Beta</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number | undefined; icon: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={s.statCard}>
      <View style={s.statIconWrap}>
        <Ionicons name={icon} size={16} color={colors.primary[500]} />
      </View>
      {value === undefined ? (
        <Skeleton width={32} height={22} style={{ marginTop: 4 }} />
      ) : (
        <Text style={s.statValue}>{value}</Text>
      )}
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

function MenuItem({
  icon, label, onPress, value, badge, badgeColor, last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  value?: string;
  badge?: string;
  badgeColor?: string;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.menuItem, !last && s.menuItemBorder, pressed && { backgroundColor: colors.neutral[100] }]}
    >
      <View style={s.menuIconWrap}>
        <Ionicons name={icon} size={18} color={colors.primary[600]} />
      </View>
      <Text style={s.menuLabel}>{label}</Text>
      {value && <Text style={s.menuValue} numberOfLines={1}>{value}</Text>}
      {badge && (
        <View style={[s.menuBadge, { backgroundColor: (badgeColor || colors.neutral[500]) + '1A', borderColor: (badgeColor || colors.neutral[500]) + '40' }]}>
          <Text style={[s.menuBadgeText, { color: badgeColor || colors.neutral[500] }]}>{badge}</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={16} color={colors.neutral[400]} />
    </Pressable>
  );
}

function kycMeta(status?: string | null): { label: string; color: string; bg: string; icon: keyof typeof Ionicons.glyphMap } {
  switch (status) {
    case 'verified': return { label: 'Vérifié', color: colors.success, bg: 'rgba(0,184,148,0.15)', icon: 'shield-checkmark' };
    case 'pending': return { label: 'En cours', color: colors.warning, bg: 'rgba(255,193,7,0.18)', icon: 'time' };
    case 'rejected': return { label: 'Rejeté', color: colors.danger, bg: 'rgba(230,57,70,0.18)', icon: 'close-circle' };
    default: return { label: 'Non vérifié', color: '#fff', bg: 'rgba(255,255,255,0.2)', icon: 'shield-outline' };
  }
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.light },
  hero: {
    position: 'relative', overflow: 'hidden',
    backgroundColor: colors.primary[500],
    paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xl,
    alignItems: 'center',
  },
  bgCircle1: { position: 'absolute', top: -80, right: -80, width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255,255,255,0.08)' },
  bgCircle2: { position: 'absolute', bottom: -60, left: -60, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.06)' },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: spacing.md },
  heroEyebrow: { color: 'rgba(255,255,255,0.85)', fontSize: typography.fontSize.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  heroAction: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  avatarWrap: { width: 96, height: 96, borderRadius: 48, overflow: 'visible', marginBottom: spacing.md, position: 'relative' },
  avatarImg: { width: 96, height: 96, borderRadius: 48, borderWidth: 4, borderColor: '#fff' },
  avatarFallback: { backgroundColor: colors.dark, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { color: '#fff', fontSize: 40, fontWeight: '700' },
  avatarEditBadge: {
    position: 'absolute', right: 0, bottom: 0,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.dark, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  heroName: { color: '#fff', fontSize: typography.fontSize.xl, fontWeight: '700', textAlign: 'center' },
  heroPhone: { color: 'rgba(255,255,255,0.85)', fontSize: typography.fontSize.sm, marginTop: 2 },
  kycPill: { marginTop: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.md, paddingVertical: 5, borderRadius: radius.full },
  kycText: { fontSize: typography.fontSize.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },

  statsRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: -spacing.lg },
  statCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: radius.lg,
    padding: spacing.md, alignItems: 'center',
    elevation: 3, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
  },
  statIconWrap: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary[50], alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  statValue: { fontSize: typography.fontSize.xl, fontWeight: '700', color: colors.dark },
  statLabel: { fontSize: typography.fontSize.xs, color: colors.neutral[500], marginTop: 2, fontWeight: '600' },

  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.md },
  sectionAccent: { width: 4, height: 18, borderRadius: 2, backgroundColor: colors.primary[500] },
  sectionTitle: { flex: 1, fontSize: typography.fontSize.base, fontWeight: '700', color: colors.dark },

  menu: { marginHorizontal: spacing.lg, backgroundColor: '#fff', borderRadius: radius.lg, overflow: 'hidden', elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  menuItemBorder: { borderBottomWidth: 1, borderBottomColor: colors.neutral[100] },
  menuIconWrap: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.primary[50], alignItems: 'center', justifyContent: 'center' },
  menuLabel: { flex: 1, fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.dark },
  menuValue: { fontSize: typography.fontSize.xs, color: colors.neutral[500], maxWidth: 100, fontWeight: '600' },
  menuBadge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.full, borderWidth: 1 },
  menuBadgeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },

  signOut: {
    marginTop: spacing.xl, marginHorizontal: spacing.lg,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    paddingVertical: spacing.md, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.danger,
    backgroundColor: 'rgba(230,57,70,0.05)',
  },
  signOutText: { color: colors.danger, fontWeight: '700', fontSize: typography.fontSize.sm },
  version: { textAlign: 'center', marginTop: spacing.lg, color: colors.neutral[400], fontSize: typography.fontSize.xs },
});
