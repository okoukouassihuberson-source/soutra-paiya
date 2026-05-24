/**
 * ScreenHeader — en-tête de navigation pour les écrans secondaires.
 * Pattern utilisé sur recharge, withdraw, send, requests, etc.
 */

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing } from '@soutra/shared';

type Props = {
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
  /** Override de l'action retour. Par défaut : router.back(). */
  onBack?: () => void;
};

export function ScreenHeader({ title, subtitle, trailing, onBack }: Props) {
  const router = useRouter();
  return (
    <View style={s.header}>
      <Pressable
        onPress={() => (onBack ? onBack() : router.back())}
        hitSlop={10}
        style={s.backBtn}
      >
        <Ionicons name="chevron-back" size={22} color={colors.dark} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={s.title} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={s.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {trailing}
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.neutral[100],
    backgroundColor: colors.light,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.neutral[200],
  },
  title: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.dark },
  subtitle: { fontSize: typography.fontSize.xs, color: colors.neutral[500], marginTop: 2 },
});
