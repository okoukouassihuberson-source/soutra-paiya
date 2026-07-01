import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, radius, spacing } from '@soutra/shared';
import { ScreenHeader } from '@/components/ScreenHeader';

/**
 * /split-bill — écran placeholder. L'implémentation complète (création de
 * split, ajout de participants, demande de paiement) arrive en PR D et
 * s'appuiera sur lib/splits.ts qui contient déjà la logique backend.
 *
 * Cette version affiche une carte "en construction" plutôt que crasher si
 * un utilisateur tape la quick action Split Note avant que PR D ne soit
 * livrée.
 */
export default function SplitBillPlaceholder() {
  const router = useRouter();

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader title="Split Note" subtitle="Découpe la note entre amis" />
      <View style={s.body}>
        <View style={s.card}>
          <View style={s.iconWrap}>
            <Ionicons name="people" size={44} color={colors.primary[500]} />
          </View>
          <Text style={s.title}>Bientôt disponible</Text>
          <Text style={s.text}>
            La découpe d&apos;addition entre amis arrive dans la prochaine
            mise à jour. En attendant, tu peux utiliser « Demander » pour
            réclamer ta part à chacun manuellement.
          </Text>
          <Pressable style={s.cta} onPress={() => router.replace('/requests')}>
            <Ionicons name="arrow-forward" size={16} color="#fff" />
            <Text style={s.ctaText}>Ouvrir Demander</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.light },
  body: { flex: 1, padding: spacing.lg, justifyContent: 'center' },
  card: {
    backgroundColor: '#fff',
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    shadowColor: colors.dark,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: typography.fontSize.xl,
    fontWeight: '700',
    color: colors.dark,
    marginBottom: spacing.sm,
  },
  text: {
    fontSize: typography.fontSize.sm,
    color: colors.neutral[600],
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary[500],
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.full,
  },
  ctaText: {
    color: '#fff',
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
  },
});
