// ============================================================================
// subscriptions — écran des abonnements Soutra-Pay (Phase 14).
//
// Liste les 5 plans avec leur prix, features, et bouton "Choisir".
// Tap → subscribeTo() → ouvre CinetPay → webhook active l'abo.
// Affiche aussi l'abo courant en haut s'il existe.
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ScrollView, View, Text, Pressable, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  typography, radius, spacing, formatXOF, type ColorPalette,
} from '@soutra/shared';
import { useColors } from '@/lib/theme';
import { ScreenHeader } from '@/components/ScreenHeader';
import {
  PLANS, subscribeTo, getMyActiveSubscription, cancelSubscription,
  type Plan, type PlanCode, type ActiveSubscription,
} from '@/lib/subscriptions';

export default function SubscriptionsScreen() {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const [current, setCurrent] = useState<ActiveSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<PlanCode | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const sub = await getMyActiveSubscription();
      setCurrent(sub);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const handleSubscribe = async (plan: Plan) => {
    setSubmitting(plan.code);
    try {
      const res = await subscribeTo(plan.code);
      if (res.status === 'active') {
        Alert.alert(
          '🎉 Abonnement activé',
          `Tu es maintenant abonné au plan ${plan.name} (${formatXOF(plan.amount_xof)}/${plan.duration_days}j).`,
          [{ text: 'OK', onPress: () => refresh() }],
        );
      } else {
        Alert.alert(
          'Paiement en cours',
          `Ton paiement est en cours de validation. L'abonnement ${plan.name} sera activé dès confirmation.`,
          [{ text: 'OK', onPress: () => refresh() }],
        );
      }
    } catch (err: any) {
      Alert.alert(
        'Inscription impossible',
        err?.message ?? 'Une erreur est survenue.',
      );
    } finally {
      setSubmitting(null);
    }
  };

  const handleCancel = (sub: ActiveSubscription) => {
    Alert.alert(
      'Annuler l\'abonnement ?',
      `Ton abonnement ${sub.plan_code.toUpperCase()} restera actif jusqu'au ${sub.expires_at ? new Date(sub.expires_at).toLocaleDateString('fr-FR') : 'fin de période'}, puis ne sera pas renouvelé.`,
      [
        { text: 'Garder', style: 'cancel' },
        {
          text: 'Annuler', style: 'destructive',
          onPress: async () => {
            try {
              await cancelSubscription(sub.id, 'User-initiated');
              Alert.alert('Annulé', 'Ton abonnement ne sera pas renouvelé.');
              await refresh();
            } catch (err: any) {
              Alert.alert('Erreur', err?.message ?? 'Impossible d\'annuler.');
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader title="Abonnements" subtitle="Soutra-Pay Premium" />

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['2xl'] }}>
        {/* Banner abo courant */}
        {loading ? (
          <ActivityIndicator color={c.primary[500]} style={{ marginVertical: spacing.lg }} />
        ) : current && current.status === 'active' ? (
          <View style={s.currentBanner}>
            <Ionicons name="checkmark-circle" size={24} color="#fff" />
            <View style={{ flex: 1 }}>
              <Text style={s.currentTitle}>Plan actif : {current.plan_code.toUpperCase()}</Text>
              {current.expires_at && (
                <Text style={s.currentSub}>
                  Expire le {new Date(current.expires_at).toLocaleDateString('fr-FR')}
                  {current.auto_renew ? ' (renouvellement auto)' : ''}
                </Text>
              )}
            </View>
            {current.auto_renew && (
              <Pressable onPress={() => handleCancel(current)} style={s.cancelBtn}>
                <Text style={s.cancelText}>Annuler</Text>
              </Pressable>
            )}
          </View>
        ) : null}

        <Text style={s.intro}>
          Débloque cashback, concierge Sia premium, événements VVIP et plus.
          Tous les paiements via CinetPay (Orange, MTN, Moov, Wave, carte).
        </Text>

        {PLANS.map((plan) => {
          const isCurrent = current?.plan_code === plan.code && current?.status === 'active';
          const isSubmitting = submitting === plan.code;
          const cardStyle: any[] = [s.planCard];
          if (plan.tone === 'primary') cardStyle.push(s.planCardPrimary);
          if (plan.tone === 'gold') cardStyle.push(s.planCardGold);
          if (plan.tone === 'gradient') cardStyle.push(s.planCardGradient);

          return (
            <View key={plan.code} style={cardStyle}>
              {plan.highlight && (
                <View style={s.highlightBadge}>
                  <Text style={s.highlightText}>{plan.highlight}</Text>
                </View>
              )}
              <Text style={s.planName}>{plan.name}</Text>
              <View style={s.priceRow}>
                <Text style={s.priceValue}>
                  {plan.amount_xof === 0 ? 'Gratuit' : formatXOF(plan.amount_xof)}
                </Text>
                {plan.amount_xof > 0 && (
                  <Text style={s.priceUnit}>/ {plan.duration_days}j</Text>
                )}
              </View>

              <View style={s.featuresList}>
                {plan.features.map((f, i) => (
                  <View key={i} style={s.featureRow}>
                    <Ionicons name="checkmark" size={14} color={c.success} />
                    <Text style={s.featureText}>{f}</Text>
                  </View>
                ))}
              </View>

              <Pressable
                onPress={() => !isCurrent && !isSubmitting && handleSubscribe(plan)}
                disabled={isCurrent || isSubmitting}
                style={({ pressed }) => [
                  s.subscribeBtn,
                  (isCurrent || isSubmitting) && s.subscribeBtnDisabled,
                  pressed && !isCurrent && !isSubmitting && { opacity: 0.9 },
                ]}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={s.subscribeBtnText}>
                    {isCurrent ? '✓ Plan actuel' : 'Choisir'}
                  </Text>
                )}
              </Pressable>
            </View>
          );
        })}

        <Text style={s.footer}>
          Renouvellement automatique chaque {30}j. Annule à tout moment depuis
          ton abonnement actif. Les abonnements ne sont pas remboursables.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.light },
    currentBanner: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      backgroundColor: c.success,
      borderRadius: radius.lg, padding: spacing.md,
      marginBottom: spacing.lg,
    },
    currentTitle: { color: '#fff', fontSize: typography.fontSize.sm, fontWeight: '800' },
    currentSub: { color: 'rgba(255,255,255,0.9)', fontSize: typography.fontSize.xs, marginTop: 2 },
    cancelBtn: {
      paddingHorizontal: spacing.sm, paddingVertical: 4,
      borderRadius: radius.full,
      backgroundColor: 'rgba(0,0,0,0.2)',
    },
    cancelText: { color: '#fff', fontSize: typography.fontSize.xs, fontWeight: '700' },

    intro: {
      fontSize: typography.fontSize.sm, color: c.neutral[700], lineHeight: 20,
      marginBottom: spacing.lg,
    },

    planCard: {
      backgroundColor: c.light,
      borderRadius: radius.lg,
      borderWidth: 1, borderColor: c.neutral[200],
      padding: spacing.lg,
      marginBottom: spacing.md,
      position: 'relative',
    },
    planCardPrimary: { borderColor: c.primary[400], borderWidth: 2 },
    planCardGold: { borderColor: '#F59E0B', borderWidth: 2, backgroundColor: '#FFFBEB' },
    planCardGradient: { borderColor: '#8B5CF6', borderWidth: 2, backgroundColor: '#F5F3FF' },
    highlightBadge: {
      position: 'absolute', top: -10, right: spacing.lg,
      paddingHorizontal: spacing.sm, paddingVertical: 3,
      borderRadius: radius.full,
      backgroundColor: c.primary[500],
    },
    highlightText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },

    planName: { fontSize: typography.fontSize.xl, fontWeight: '800', color: c.dark },
    priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 4 },
    priceValue: { fontSize: typography.fontSize['2xl'], fontWeight: '900', color: c.primary[600] },
    priceUnit: { fontSize: typography.fontSize.sm, color: c.neutral[500], fontWeight: '600' },

    featuresList: { marginTop: spacing.md, gap: 6 },
    featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
    featureText: { flex: 1, fontSize: typography.fontSize.sm, color: c.dark, lineHeight: 18 },

    subscribeBtn: {
      marginTop: spacing.md,
      paddingVertical: spacing.md,
      borderRadius: radius.full,
      backgroundColor: c.primary[500],
      alignItems: 'center',
    },
    subscribeBtnDisabled: { backgroundColor: c.neutral[300] },
    subscribeBtnText: { color: '#fff', fontWeight: '800', fontSize: typography.fontSize.sm },

    footer: {
      marginTop: spacing.lg,
      fontSize: typography.fontSize.xs,
      color: c.neutral[500],
      textAlign: 'center',
      lineHeight: 16,
    },
  });
}
