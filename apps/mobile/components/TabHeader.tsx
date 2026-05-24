/**
 * TabHeader — en-tête commun des onglets : greeting + avatar à droite.
 *
 * Tap sur l'avatar -> /(tabs)/profile. Tap sur le titre -> rien (purement
 * informatif). Le greeting personnalisé évite le « Bonjour, utilisateur »
 * générique : on prend le prénom du full_name ou le téléphone tronqué.
 */

import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, Image, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing } from '@soutra/shared';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

type Props = {
  /** Petit label affiché au-dessus du titre. Ex. « Bonjour ». */
  eyebrow?: string;
  /** Titre principal. Si null, on affiche « <Bonjour>, <prénom> » par défaut. */
  title?: string;
  /** Sous-titre optionnel, sous le titre. Ex. ville, date. */
  subtitle?: string;
  /** Icône supplémentaire à gauche de l'avatar (ex. cloche notifs). */
  trailing?: React.ReactNode;
};

export function TabHeader({ eyebrow, title, subtitle, trailing }: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const [profile, setProfile] = useState<{ full_name: string | null; avatar_url: string | null } | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await (supabase as any)
      .from('profiles')
      .select('full_name, avatar_url')
      .eq('id', user.id)
      .maybeSingle();
    if (data) setProfile(data);
  }, [user?.id]);

  // Recharge à chaque focus pour refléter un changement d'avatar / nom.
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { load(); }, [load]);

  const firstName = (profile?.full_name?.trim().split(/\s+/)[0])
    || (user?.phone ? user.phone.slice(-4) : 'toi');
  const initial = firstName.charAt(0).toUpperCase();
  const resolvedTitle = title ?? `${eyebrow || 'Bonjour'}, ${firstName} 👋`;

  return (
    <View style={s.row}>
      <View style={{ flex: 1 }}>
        {eyebrow && !title && null}
        <Text style={s.title} numberOfLines={1}>{resolvedTitle}</Text>
        {subtitle ? <Text style={s.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {trailing}
      <Pressable onPress={() => router.push('/(tabs)/profile')} hitSlop={6}>
        <View style={s.avatar}>
          {profile?.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={s.avatarImg} />
          ) : (
            <Text style={s.avatarTxt}>{initial}</Text>
          )}
        </View>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md,
  },
  title: { fontSize: typography.fontSize.xl, fontWeight: '700', color: colors.dark },
  subtitle: { marginTop: 2, fontSize: typography.fontSize.xs, color: colors.neutral[500] },
  avatar: {
    width: 40, height: 40, borderRadius: 20, overflow: 'hidden',
    backgroundColor: colors.primary[500], alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarTxt: { color: '#fff', fontWeight: '700', fontSize: typography.fontSize.base },
});
