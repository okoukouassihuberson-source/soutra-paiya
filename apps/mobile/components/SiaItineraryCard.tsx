// ============================================================================
// SiaItineraryCard — timeline visuelle d'un itinéraire généré par plan_outing.
//
// Header avec total + budget + marge.
// Timeline verticale d'étapes : heure, kind, activité, coût estimé.
// Look "concierge premium" inspiré des recap voyages Booking / Airbnb.
// ============================================================================
import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  typography, radius, spacing, formatXOF,
  type ColorPalette,
} from '@soutra/shared';
import { useColors } from '@/lib/theme';
import type { Itinerary } from '@/lib/assistant';

const OCCASION_META: Record<string, { label: string; emoji: string }> = {
  solo:    { label: 'Sortie solo', emoji: '🙋' },
  couple:  { label: 'Sortie romantique', emoji: '💑' },
  friends: { label: 'Sortie entre amis', emoji: '👥' },
  family:  { label: 'Sortie en famille', emoji: '👨‍👩‍👧' },
  weekend: { label: 'Week-end complet', emoji: '🗓️' },
  bored:   { label: 'Sortie improvisée', emoji: '🎲' },
};

const KIND_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  Dîner: 'restaurant',
  'Dîner romantique': 'restaurant',
  'Maquis / Resto': 'restaurant',
  'Repas en famille': 'restaurant',
  Bar: 'wine',
  'Bar / Lounge': 'wine',
  Cocktails: 'wine',
  'Club / Lounge': 'wine',
  Activité: 'happy',
  'Activité familiale': 'happy',
  'Café / dessert': 'cafe',
  Transport: 'car',
};

interface Props {
  itinerary: Itinerary;
}

export function SiaItineraryCard({ itinerary }: Props) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const meta = OCCASION_META[itinerary.occasion] ?? OCCASION_META.solo;

  const remainingTone = itinerary.remaining_xof > 0
    ? { bg: c.primary[50], fg: c.primary[700], label: `Marge ${formatXOF(itinerary.remaining_xof)}` }
    : { bg: '#FEE2E2', fg: '#B91C1C', label: 'Au budget pile' };

  return (
    <View style={s.card}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerEmoji}>{meta.emoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{meta.label}</Text>
          <Text style={s.subtitle}>
            {itinerary.party_size} pers. · Budget {formatXOF(itinerary.budget_xof)}
          </Text>
        </View>
        <View style={[s.remainingPill, { backgroundColor: remainingTone.bg }]}>
          <Text style={[s.remainingText, { color: remainingTone.fg }]}>
            {remainingTone.label}
          </Text>
        </View>
      </View>

      {/* Timeline */}
      <View style={s.timeline}>
        {itinerary.steps.map((step, idx) => {
          const iconName = KIND_ICON[step.kind] ?? 'sparkles';
          const isLast = idx === itinerary.steps.length - 1;
          return (
            <View key={step.order} style={s.stepRow}>
              {/* Rail vertical + icon circle */}
              <View style={s.railCol}>
                <View style={s.iconCircle}>
                  <Ionicons name={iconName} size={14} color="#fff" />
                </View>
                {!isLast && <View style={s.rail} />}
              </View>

              {/* Content */}
              <View style={s.stepBody}>
                <View style={s.stepHeaderRow}>
                  <Text style={s.stepTime}>{step.time ?? `Étape ${step.order}`}</Text>
                  <Text style={s.stepCost}>{formatXOF(step.est_cost_xof)}</Text>
                </View>
                <Text style={s.stepKind}>{step.kind}</Text>
                <Text style={s.stepLabel}>{step.activity_label}</Text>
                {step.notes && (
                  <Text style={s.stepNotes} numberOfLines={1}>{step.notes}</Text>
                )}
              </View>
            </View>
          );
        })}
      </View>

      {/* Footer total */}
      <View style={s.footer}>
        <Text style={s.footerLabel}>Total estimé</Text>
        <Text style={s.footerValue}>{formatXOF(itinerary.total_estimated_xof)}</Text>
      </View>
    </View>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    card: {
      backgroundColor: c.light,
      borderRadius: radius.lg,
      borderWidth: 1, borderColor: c.primary[200],
      marginBottom: spacing.md,
      overflow: 'hidden',
      shadowColor: c.primary[500], shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 3,
    },
    header: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.md,
      padding: spacing.md,
      backgroundColor: c.primary[50],
      borderBottomWidth: 1, borderBottomColor: c.primary[200],
    },
    headerEmoji: { fontSize: 28 },
    title: { fontSize: typography.fontSize.base, fontWeight: '800', color: c.primary[800] },
    subtitle: { fontSize: typography.fontSize.xs, color: c.primary[700], marginTop: 2 },
    remainingPill: {
      paddingHorizontal: spacing.sm, paddingVertical: 4,
      borderRadius: radius.full,
    },
    remainingText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.2 },

    timeline: { padding: spacing.md },
    stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    railCol: { alignItems: 'center', width: 28 },
    iconCircle: {
      width: 28, height: 28, borderRadius: 14,
      backgroundColor: c.primary[500],
      alignItems: 'center', justifyContent: 'center',
    },
    rail: {
      width: 2, flexGrow: 1, minHeight: 32,
      backgroundColor: c.primary[200],
      marginTop: 4,
    },
    stepBody: {
      flex: 1, paddingBottom: spacing.md,
    },
    stepHeaderRow: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline',
    },
    stepTime: { fontSize: typography.fontSize.xs, fontWeight: '800', color: c.neutral[600], textTransform: 'uppercase', letterSpacing: 0.3 },
    stepCost: { fontSize: typography.fontSize.sm, fontWeight: '800', color: c.primary[700] },
    stepKind: { fontSize: typography.fontSize.sm, fontWeight: '700', color: c.dark, marginTop: 3 },
    stepLabel: { fontSize: typography.fontSize.xs, color: c.neutral[700], marginTop: 1 },
    stepNotes: { fontSize: 10, color: c.neutral[500], fontStyle: 'italic', marginTop: 2 },

    footer: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      padding: spacing.md,
      borderTopWidth: 1, borderTopColor: c.neutral[100],
      backgroundColor: c.neutral[50],
    },
    footerLabel: { fontSize: typography.fontSize.xs, color: c.neutral[600], fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
    footerValue: { fontSize: typography.fontSize.lg, fontWeight: '900', color: c.primary[700] },
  });
}
