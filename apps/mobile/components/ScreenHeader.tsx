/**
 * ScreenHeader — en-tête de navigation pour les écrans secondaires.
 */

import { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { typography, spacing, type ColorPalette } from '@soutra/shared';
import { useColors } from '@/lib/theme';

type Props = {
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
  onBack?: () => void;
};

export function ScreenHeader({ title, subtitle, trailing, onBack }: Props) {
  const router = useRouter();
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <View style={s.header}>
      <Pressable
        onPress={() => (onBack ? onBack() : router.back())}
        hitSlop={10}
        style={s.backBtn}
      >
        <Ionicons name="chevron-back" size={22} color={c.dark} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={s.title} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={s.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {trailing}
    </View>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    header: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.md,
      paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md,
      borderBottomWidth: 1, borderBottomColor: c.neutral[100],
      backgroundColor: c.light,
    },
    backBtn: {
      width: 40, height: 40, borderRadius: 20,
      backgroundColor: c.neutral[50], alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: c.neutral[200],
    },
    title: { fontSize: typography.fontSize.lg, fontWeight: '700', color: c.dark },
    subtitle: { fontSize: typography.fontSize.xs, color: c.neutral[500], marginTop: 2 },
  });
}
