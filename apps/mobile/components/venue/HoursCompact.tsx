import { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { typography, radius, spacing, type ColorPalette } from '@soutra/shared';
import { useColors } from '@/lib/theme';
import { HoursSheet } from './HoursSheet';
import {
  computeOpenStatus,
  formatTimeFR,
  DAY_LABELS,
  type DayKey,
} from './hoursHelpers';

interface Props {
  hours: Record<string, [string, string] | undefined>;
}

/**
 * Carte compacte des horaires (Airbnb-style).
 *
 * État par défaut :
 *   ┌──────────────────────────────────────┐
 *   │ 🟢 Ouvert maintenant                 │
 *   │ Ouvert aujourd'hui · 17h - 04h       │
 *   │ Voir tous les horaires        →      │
 *   └──────────────────────────────────────┘
 *
 * Tap → ouvre une bottom-sheet avec les 7 jours, jour courant surligné.
 */
export function HoursCompact({ hours }: Props) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const [open, setOpen] = useState(false);

  const status = useMemo(() => computeOpenStatus(hours), [hours]);

  const todayLabel = DAY_LABELS[status.todayKey];
  const todayLine = status.todayOpen && status.todayClose
    ? `Aujourd'hui · ${formatTimeFR(status.todayOpen)} – ${formatTimeFR(status.todayClose)}`
    : `${todayLabel} · fermé`;

  const statusBg = status.isOpen ? '#16A34A' : '#DC2626';
  const statusLabel = status.isOpen ? 'Ouvert' : 'Fermé';

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [s.card, pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] }]}
        accessibilityRole="button"
        accessibilityLabel={`Horaires : ${statusLabel}, ${status.hint}`}
      >
        <View style={s.header}>
          <View style={[s.statusDot, { backgroundColor: statusBg }]} />
          <Text style={[s.statusText, { color: statusBg }]}>{statusLabel}</Text>
          <Text style={s.statusHint} numberOfLines={1}>· {status.hint}</Text>
        </View>

        <Text style={s.todayLine} numberOfLines={1}>{todayLine}</Text>

        <View style={s.footer}>
          <Ionicons name="time-outline" size={16} color={c.neutral[500]} />
          <Text style={s.seeAll}>Voir tous les horaires</Text>
          <Ionicons name="chevron-forward" size={16} color={c.neutral[400]} style={{ marginLeft: 'auto' }} />
        </View>
      </Pressable>

      <HoursSheet
        visible={open}
        onClose={() => setOpen(false)}
        hours={hours}
        todayKey={status.todayKey as DayKey}
      />
    </>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    card: {
      borderRadius: radius.lg,
      backgroundColor: c.neutral[50],
      borderWidth: 1,
      borderColor: c.neutral[100],
      padding: spacing.md,
      gap: spacing.xs,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    statusDot: {
      width: 8, height: 8, borderRadius: 4,
      shadowColor: '#000',
      shadowOpacity: 0.18,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 1 },
    },
    statusText: {
      fontSize: typography.fontSize.sm,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    statusHint: {
      flex: 1,
      fontSize: typography.fontSize.xs,
      color: c.neutral[600],
      fontWeight: '600',
    },
    todayLine: {
      fontSize: typography.fontSize.base,
      fontWeight: '700',
      color: c.dark,
      marginTop: 2,
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: spacing.sm,
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: c.neutral[100],
    },
    seeAll: {
      fontSize: typography.fontSize.sm,
      color: c.primary[600],
      fontWeight: '700',
    },
  });
}
