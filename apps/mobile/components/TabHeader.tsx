/**
 * TabHeader — en-tête commun des onglets : greeting + avatar à droite.
 *
 * Tap sur l'avatar -> /(tabs)/profile. Tap sur le titre -> rien (purement
 * informatif). Le greeting personnalisé évite le « Bonjour, utilisateur »
 * générique : on prend le prénom du full_name ou le téléphone tronqué.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, Image, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { typography, spacing, type ColorPalette } from '@soutra/shared';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useColors } from '@/lib/theme';

type Props = {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  trailing?: React.ReactNode;
};

export function TabHeader({ eyebrow, title, subtitle, trailing }: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
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

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.md,
      paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md,
    },
    title: { fontSize: typography.fontSize.xl, fontWeight: '700', color: c.dark },
    subtitle: { marginTop: 2, fontSize: typography.fontSize.xs, color: c.neutral[500] },
    avatar: {
      width: 40, height: 40, borderRadius: 20, overflow: 'hidden',
      backgroundColor: c.primary[500], alignItems: 'center', justifyContent: 'center',
      borderWidth: 2, borderColor: c.light,
      shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2,
    },
    avatarImg: { width: '100%', height: '100%' },
    avatarTxt: { color: '#fff', fontWeight: '700', fontSize: typography.fontSize.base },
  });
}
