import { useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Alert, Image, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { typography, radius, spacing, type ColorPalette } from '@soutra/shared';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { Skeleton } from '@/components/Skeleton';
import { useColors, useTheme, type ThemeMode } from '@/lib/theme';

interface ProfileRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  kyc_status: string | null;
  referral_code: string | null;
  role: string | null;
  avatar_url: string | null;
  cover_url: string | null;
}

type Stats = { reservations: number; posts: number; matches: number } | null;

export default function Profile() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [stats, setStats] = useState<Stats>(null);
  const [themePickerOpen, setThemePickerOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!user?.id) return;
      let active = true;
      (async () => {
        const [profileRes, resCount, postCount, matchRes] = await Promise.all([
          supabase
            .from('profiles')
            .select('id, full_name, phone, email, kyc_status, referral_code, role, avatar_url, cover_url')
            .eq('id', user.id)
            .maybeSingle(),
          (supabase as any).from('reservations').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
          (supabase as any).from('posts').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
          (supabase as any).rpc('list_my_matches'),
        ]);
        if (!active) return;
        if (profileRes.error) console.error('[profile] load error:', profileRes.error);
        else setProfile(profileRes.data as ProfileRow | null);
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
  const kyc = kycMeta(profile?.kyc_status, c);

  const handleSignOut = () => {
    Alert.alert('Déconnexion', 'Veux-tu vraiment te déconnecter ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Se déconnecter', style: 'destructive', onPress: () => { void signOut(); } },
    ]);
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing['2xl'] }}>
        {/* Hero header — style FB/LinkedIn avec photo couverture optionnelle (PR4 audit UX) */}
        <View style={s.hero}>
          {profile?.cover_url ? (
            <>
              <Image source={{ uri: profile.cover_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              {/* Overlay sombre pour préserver la lisibilité du texte blanc */}
              <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.42)' }]} />
            </>
          ) : (
            <>
              <View style={s.bgCircle1} />
              <View style={s.bgCircle2} />
            </>
          )}

          <View style={s.heroTop}>
            <Text style={s.heroEyebrow}>Mon profil</Text>
            <Pressable onPress={() => router.push('/profile-edit' as any)} hitSlop={10} style={s.heroAction}>
              <Ionicons name="create-outline" size={18} color="#fff" />
            </Pressable>
          </View>

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
          <StatCard c={c} label="Réservations" value={stats?.reservations} icon="ticket" />
          <StatCard c={c} label="Posts" value={stats?.posts} icon="chatbubble" />
          <StatCard c={c} label="Matchs" value={stats?.matches} icon="heart" />
        </View>

        {/* Mon compte */}
        <View style={s.sectionTitleRow}>
          <View style={s.sectionAccent} />
          <Text style={s.sectionTitle}>Mon compte</Text>
        </View>
        <View style={s.menu}>
          <MenuItem c={c} icon="person-outline" label="Modifier le profil" onPress={() => router.push('/profile-edit' as any)} />
          <MenuItem c={c} icon="shield-checkmark-outline" label="Vérification KYC" badge={kyc.label} badgeColor={kyc.color} onPress={() => router.push('/kyc' as any)} />
          <MenuItem c={c} icon="heart-outline" label="Mes favoris" onPress={() => router.push('/favorites' as any)} />
          <MenuItem c={c} icon="medkit-outline" label="Mes contacts SOS" onPress={() => router.push('/sos-contacts' as any)} last />
        </View>

        {/* Espace gérant — visible si le user est venue_owner / staff / organizer / admin */}
        {profile?.role && ['venue_owner', 'staff', 'organizer', 'admin'].includes(profile.role) && (
          <>
            <View style={s.sectionTitleRow}>
              <View style={s.sectionAccent} />
              <Text style={s.sectionTitle}>Espace pro</Text>
            </View>
            <View style={s.menu}>
              <MenuItem
                c={c}
                icon="storefront-outline"
                label="Espace gérant"
                badge="Pro"
                badgeColor={c.primary[500]}
                onPress={() => router.push('/pro' as any)}
                last
              />
            </View>
          </>
        )}

        {/* Apparence */}
        <View style={s.sectionTitleRow}>
          <View style={s.sectionAccent} />
          <Text style={s.sectionTitle}>Apparence</Text>
        </View>
        <View style={s.menu}>
          <ThemeMenuItem c={c} onPress={() => setThemePickerOpen(true)} last />
        </View>

        {/* Programme */}
        <View style={s.sectionTitleRow}>
          <View style={s.sectionAccent} />
          <Text style={s.sectionTitle}>Programme</Text>
        </View>
        <View style={s.menu}>
          <MenuItem
            c={c}
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

        {/* Aide */}
        <View style={s.sectionTitleRow}>
          <View style={s.sectionAccent} />
          <Text style={s.sectionTitle}>Aide & légal</Text>
        </View>
        <View style={s.menu}>
          <MenuItem c={c} icon="sparkles-outline" label="Assistant Soutra" badge="IA" badgeColor={c.primary[500]} onPress={() => router.push('/assistant' as any)} />
          <MenuItem c={c} icon="help-circle-outline" label="Centre d'aide" onPress={() => Alert.alert('Centre d\'aide', 'Pose ta question à l\'Assistant Soutra (au-dessus), ou écris à support@soutra.ci.')} />
          <MenuItem c={c} icon="document-text-outline" label="Conditions & Confidentialité" onPress={() => Alert.alert('CGU & Confidentialité', 'Les CGU et la politique de confidentialité seront bientôt disponibles ici.')} last />
        </View>

        <Pressable
          onPress={handleSignOut}
          style={({ pressed }) => [s.signOut, pressed && { opacity: 0.8, transform: [{ scale: 0.97 }] }]}
        >
          <Ionicons name="log-out-outline" size={18} color={c.danger} />
          <Text style={s.signOutText}>Se déconnecter</Text>
        </Pressable>
        <Text style={s.version}>Soutra-Playce · Version 0.1.2 · Beta</Text>
      </ScrollView>

      <ThemePickerModal visible={themePickerOpen} onClose={() => setThemePickerOpen(false)} />
    </SafeAreaView>
  );
}

function StatCard({ c, label, value, icon }: { c: ColorPalette; label: string; value: number | undefined; icon: keyof typeof Ionicons.glyphMap }) {
  const ss = useMemo(() => makeStyles(c), [c]);
  return (
    <View style={ss.statCard}>
      <View style={ss.statIconWrap}>
        <Ionicons name={icon} size={16} color={c.primary[500]} />
      </View>
      {value === undefined ? (
        <Skeleton width={32} height={22} style={{ marginTop: 4 }} />
      ) : (
        <Text style={ss.statValue}>{value}</Text>
      )}
      <Text style={ss.statLabel}>{label}</Text>
    </View>
  );
}

function MenuItem({
  c, icon, label, onPress, value, badge, badgeColor, last,
}: {
  c: ColorPalette;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  value?: string;
  badge?: string;
  badgeColor?: string;
  last?: boolean;
}) {
  const ss = useMemo(() => makeStyles(c), [c]);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [ss.menuItem, !last && ss.menuItemBorder, pressed && { backgroundColor: c.neutral[100] }]}
    >
      <View style={ss.menuIconWrap}>
        <Ionicons name={icon} size={18} color={c.primary[600]} />
      </View>
      <Text style={ss.menuLabel}>{label}</Text>
      {value && <Text style={ss.menuValue} numberOfLines={1}>{value}</Text>}
      {badge && (
        <View style={[ss.menuBadge, { backgroundColor: (badgeColor || c.neutral[500]) + '1A', borderColor: (badgeColor || c.neutral[500]) + '40' }]}>
          <Text style={[ss.menuBadgeText, { color: badgeColor || c.neutral[500] }]}>{badge}</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={16} color={c.neutral[400]} />
    </Pressable>
  );
}

function ThemeMenuItem({ c, onPress, last }: { c: ColorPalette; onPress: () => void; last?: boolean }) {
  const { mode } = useTheme();
  const ss = useMemo(() => makeStyles(c), [c]);
  const label = mode === 'light' ? 'Clair' : mode === 'dark' ? 'Sombre' : 'Système';
  const icon: keyof typeof Ionicons.glyphMap = mode === 'light' ? 'sunny-outline' : mode === 'dark' ? 'moon-outline' : 'contrast-outline';
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [ss.menuItem, !last && ss.menuItemBorder, pressed && { backgroundColor: c.neutral[100] }]}
    >
      <View style={ss.menuIconWrap}>
        <Ionicons name={icon} size={18} color={c.primary[600]} />
      </View>
      <Text style={ss.menuLabel}>Thème</Text>
      <Text style={ss.menuValue}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={c.neutral[400]} />
    </Pressable>
  );
}

function ThemePickerModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const c = useColors();
  const { mode, setMode } = useTheme();
  const ss = useMemo(() => makeStyles(c), [c]);
  const choices: { v: ThemeMode; label: string; sub: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { v: 'light', label: 'Clair', sub: 'Fond crème, texte sombre', icon: 'sunny' },
    { v: 'dark', label: 'Sombre', sub: 'Fond noir, texte clair — économise la batterie OLED', icon: 'moon' },
    { v: 'system', label: 'Système', sub: 'Suit automatiquement la pref de ton téléphone', icon: 'contrast' },
  ];
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={ss.backdrop} onPress={onClose} />
      <View style={ss.sheet}>
        <View style={ss.handle} />
        <View style={ss.sheetHeader}>
          <Text style={ss.sheetTitle}>Apparence</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={22} color={c.dark} />
          </Pressable>
        </View>
        {choices.map((ch) => {
          const active = mode === ch.v;
          return (
            <Pressable
              key={ch.v}
              onPress={async () => { await setMode(ch.v); onClose(); }}
              style={({ pressed }) => [ss.choiceRow, pressed && { opacity: 0.7 }]}
            >
              <View style={[ss.choiceIcon, active && { backgroundColor: c.primary[50] }]}>
                <Ionicons name={ch.icon} size={20} color={active ? c.primary[600] : c.neutral[500]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[ss.choiceLabel, active && { color: c.primary[600] }]}>{ch.label}</Text>
                <Text style={ss.choiceSub}>{ch.sub}</Text>
              </View>
              {active && <Ionicons name="checkmark-circle" size={22} color={c.primary[500]} />}
            </Pressable>
          );
        })}
      </View>
    </Modal>
  );
}

function kycMeta(status: string | null | undefined, c: ColorPalette): { label: string; color: string; bg: string; icon: keyof typeof Ionicons.glyphMap } {
  switch (status) {
    case 'verified': return { label: 'Vérifié', color: c.success, bg: 'rgba(0,184,148,0.15)', icon: 'shield-checkmark' };
    case 'pending': return { label: 'En cours', color: c.warning, bg: 'rgba(255,193,7,0.18)', icon: 'time' };
    case 'rejected': return { label: 'Rejeté', color: c.danger, bg: 'rgba(230,57,70,0.18)', icon: 'close-circle' };
    default: return { label: 'Non vérifié', color: '#fff', bg: 'rgba(255,255,255,0.2)', icon: 'shield-outline' };
  }
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.light },
    hero: {
      position: 'relative', overflow: 'hidden',
      backgroundColor: c.primary[500],
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
    avatarFallback: { backgroundColor: c.neutral[800], alignItems: 'center', justifyContent: 'center' },
    avatarLetter: { color: '#fff', fontSize: 40, fontWeight: '700' },
    avatarEditBadge: {
      position: 'absolute', right: 0, bottom: 0,
      width: 28, height: 28, borderRadius: 14,
      backgroundColor: c.neutral[900], alignItems: 'center', justifyContent: 'center',
      borderWidth: 2, borderColor: '#fff',
    },
    heroName: { color: '#fff', fontSize: typography.fontSize.xl, fontWeight: '700', textAlign: 'center' },
    heroPhone: { color: 'rgba(255,255,255,0.85)', fontSize: typography.fontSize.sm, marginTop: 2 },
    kycPill: { marginTop: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.md, paddingVertical: 5, borderRadius: radius.full },
    kycText: { fontSize: typography.fontSize.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },

    statsRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: -spacing.lg },
    statCard: {
      flex: 1, backgroundColor: c.neutral[50], borderRadius: radius.lg,
      padding: spacing.md, alignItems: 'center',
      elevation: 3, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    },
    statIconWrap: { width: 32, height: 32, borderRadius: 16, backgroundColor: c.primary[50], alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
    statValue: { fontSize: typography.fontSize.xl, fontWeight: '700', color: c.dark },
    statLabel: { fontSize: typography.fontSize.xs, color: c.neutral[500], marginTop: 2, fontWeight: '600' },

    sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.md },
    sectionAccent: { width: 4, height: 18, borderRadius: 2, backgroundColor: c.primary[500] },
    sectionTitle: { flex: 1, fontSize: typography.fontSize.base, fontWeight: '700', color: c.dark },

    menu: { marginHorizontal: spacing.lg, backgroundColor: c.neutral[50], borderRadius: radius.lg, overflow: 'hidden', elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
    menuItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
    menuItemBorder: { borderBottomWidth: 1, borderBottomColor: c.neutral[100] },
    menuIconWrap: { width: 36, height: 36, borderRadius: 12, backgroundColor: c.primary[50], alignItems: 'center', justifyContent: 'center' },
    menuLabel: { flex: 1, fontSize: typography.fontSize.sm, fontWeight: '600', color: c.dark },
    menuValue: { fontSize: typography.fontSize.xs, color: c.neutral[500], maxWidth: 100, fontWeight: '600' },
    menuBadge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.full, borderWidth: 1 },
    menuBadgeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },

    signOut: {
      marginTop: spacing.xl, marginHorizontal: spacing.lg,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
      paddingVertical: spacing.md, borderRadius: radius.lg,
      borderWidth: 1, borderColor: c.danger,
      backgroundColor: 'rgba(230,57,70,0.05)',
    },
    signOutText: { color: c.danger, fontWeight: '700', fontSize: typography.fontSize.sm },
    version: { textAlign: 'center', marginTop: spacing.lg, color: c.neutral[400], fontSize: typography.fontSize.xs },

    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
    sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: c.light, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: spacing.xl },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: c.neutral[300], alignSelf: 'center', marginTop: spacing.sm, marginBottom: spacing.md },
    sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: c.neutral[100] },
    sheetTitle: { fontSize: typography.fontSize.base, fontWeight: '700', color: c.dark },
    choiceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: c.neutral[100] },
    choiceIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.neutral[100], alignItems: 'center', justifyContent: 'center' },
    choiceLabel: { fontSize: typography.fontSize.base, fontWeight: '700', color: c.dark },
    choiceSub: { fontSize: typography.fontSize.xs, color: c.neutral[500], marginTop: 2 },
  });
}
