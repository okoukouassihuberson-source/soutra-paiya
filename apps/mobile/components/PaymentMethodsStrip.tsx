import { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { typography, radius, spacing, type ColorPalette } from '@soutra/shared';
import { useColors } from '@/lib/theme';
import { PaymentLogo, type PaymentMethodName } from './PaymentLogo';

/**
 * Strip horizontal des moyens de paiement acceptés par un venue.
 *
 * Source : venue.payment_methods (migration 0063). Le Pro choisit la liste
 * et l'ordre depuis /pro Web. Le mobile reflète ce choix.
 *
 * Variants :
 *   - 'pre-pay' : panneau "Moyens disponibles" avant le bouton "Payer
 *     maintenant" GeniusPay (effet confiance sur /orders et /hotel-bookings)
 *   - 'venue-card' : badge compact "Moyens acceptés" sur la fiche venue
 */

interface Props {
  methods: string[] | null | undefined;
  variant?: 'pre-pay' | 'venue-card';
  title?: string;
}

const KNOWN_METHODS: PaymentMethodName[] = [
  'paiya-pay', 'orange-money', 'mtn-money', 'moov-money',
  'wave', 'visa', 'mastercard',
];

export function PaymentMethodsStrip({ methods, variant = 'pre-pay', title }: Props) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  // Filtre + dédoublonne pour ne garder que les slugs connus.
  const clean = useMemo(() => {
    const seen = new Set<string>();
    return (methods ?? [])
      .map((m) => m.toLowerCase().trim())
      .filter((m): m is PaymentMethodName => {
        if (!(KNOWN_METHODS as readonly string[]).includes(m)) return false;
        if (seen.has(m)) return false;
        seen.add(m);
        return true;
      });
  }, [methods]);

  if (clean.length === 0) return null;

  if (variant === 'venue-card') {
    return (
      <View style={s.venueCardWrap}>
        <View style={s.venueCardHeader}>
          <Ionicons name="shield-checkmark" size={14} color={c.success[700]} />
          <Text style={s.venueCardTitle}>
            {title ?? 'Moyens de paiement acceptés'}
          </Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.venueCardScroll}
        >
          {clean.map((m) => (
            <View key={m} style={s.venueCardLogo}>
              <PaymentLogo name={m} height={24} />
            </View>
          ))}
        </ScrollView>
      </View>
    );
  }

  // variant='pre-pay'
  return (
    <View style={s.prePayWrap}>
      <View style={s.prePayHeader}>
        <Ionicons name="lock-closed" size={14} color={c.success[700]} />
        <Text style={s.prePayTitle}>
          {title ?? 'Moyens disponibles via Paystack'}
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.prePayScroll}
      >
        {clean.map((m) => (
          <View key={m} style={s.prePayLogo}>
            <PaymentLogo name={m} height={28} />
          </View>
        ))}
      </ScrollView>
      <Text style={s.prePayHint}>
        Cryptage de bout en bout · paiement instantané
      </Text>
    </View>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    // Variant pre-pay (sur orders/hotel-bookings, avant le bouton Payer)
    prePayWrap: {
      marginTop: spacing.lg,
      padding: spacing.md,
      backgroundColor: c.success[50] ?? '#ecfdf5',
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.success[200] ?? '#a7f3d0',
    },
    prePayHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      marginBottom: spacing.sm,
    },
    prePayTitle: {
      fontSize: 11,
      fontWeight: '800',
      color: c.success[800] ?? '#065f46',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    prePayScroll: {
      gap: spacing.xs,
      paddingRight: spacing.md,
    },
    prePayLogo: {
      backgroundColor: '#fff',
      padding: 6,
      borderRadius: radius.md,
    },
    prePayHint: {
      marginTop: spacing.sm,
      fontSize: 11,
      color: c.success[700] ?? '#047857',
      fontWeight: '600',
    },

    // Variant venue-card (sur la fiche venue mobile)
    venueCardWrap: {
      marginTop: spacing.md,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      backgroundColor: '#fff',
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.neutral[200],
    },
    venueCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      marginBottom: spacing.sm,
    },
    venueCardTitle: {
      fontSize: 11,
      fontWeight: '800',
      color: c.dark,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    venueCardScroll: {
      gap: spacing.xs,
      paddingRight: spacing.md,
    },
    venueCardLogo: {
      // Sans fond — logos officiels ont leurs propres backgrounds
    },
  });
}
