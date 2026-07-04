import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { typography, radius, spacing, LOYALTY_LEVELS, type ColorPalette } from '@soutra/shared';
import { useColors } from '@/lib/theme';

/**
 * LoyaltyLevelCard — gamification Bronze → Diamant du programme de fidélité.
 *
 * Remplace CashbackLevelCard (déprécié avec le cashback). Même visuel, mais
 * les seuils sont en points (100 FCFA = 1 point, cf. LOYALTY_LEVELS) au lieu
 * d'un montant XOF, et la source de vérité est le cumul lifetime renvoyé par
 * get_my_loyalty_stats plutôt qu'un calcul purement client-side.
 */

function fmtPoints(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR')} pts`;
}

interface Props {
  pointsLifetime: number;
  loading?: boolean;
}

export function LoyaltyLevelCard({ pointsLifetime, loading = false }: Props) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  const { current, next } = useMemo(() => {
    let cur = LOYALTY_LEVELS[0];
    for (const lvl of LOYALTY_LEVELS) {
      if (pointsLifetime >= lvl.minPoints) cur = lvl;
    }
    const idx = LOYALTY_LEVELS.findIndex((l) => l.code === cur.code);
    const nxt = idx < LOYALTY_LEVELS.length - 1 ? LOYALTY_LEVELS[idx + 1] : null;
    return { current: cur, next: nxt };
  }, [pointsLifetime]);

  const progress = useMemo(() => {
    if (!next) return 1;
    const span = next.minPoints - current.minPoints;
    const done = Math.max(0, pointsLifetime - current.minPoints);
    return Math.min(1, span > 0 ? done / span : 1);
  }, [pointsLifetime, current, next]);

  const remaining = next ? Math.max(0, next.minPoints - pointsLifetime) : 0;

  if (loading) {
    return (
      <View style={s.card}>
        <View style={[s.badge, { backgroundColor: c.neutral[200] }]} />
        <View style={s.skelLine} />
      </View>
    );
  }

  return (
    <View style={s.card}>
      <View style={s.header}>
        <View style={[s.badge, { backgroundColor: current.color + '20', borderColor: current.color }]}>
          <Text style={s.badgeEmoji}>{current.emoji}</Text>
          <Text style={[s.badgeLabel, { color: current.color }]}>{current.label}</Text>
        </View>
        {next ? (
          <Text style={s.nextHint}>
            Prochain niveau : <Text style={[s.nextLabel, { color: next.color }]}>{next.emoji} {next.label}</Text>
          </Text>
        ) : (
          <Text style={s.maxedHint}>Niveau maximum atteint 🎉</Text>
        )}
      </View>

      <View style={s.barTrack}>
        <View
          style={[
            s.barFill,
            {
              width: `${Math.round(progress * 100)}%`,
              backgroundColor: next ? current.color : '#5BCFFA',
            },
          ]}
        />
      </View>

      <View style={s.barFooter}>
        <Text style={s.barFooterCurrent}>{fmtPoints(pointsLifetime)}</Text>
        {next && (
          <Text style={s.barFooterRemaining}>
            {fmtPoints(remaining)} pour passer {next.label}
          </Text>
        )}
        {!next && (
          <Text style={s.barFooterRemaining}>Tu es au sommet 👑</Text>
        )}
      </View>

      <View style={s.levels}>
        {LOYALTY_LEVELS.map((lvl) => {
          const reached = pointsLifetime >= lvl.minPoints;
          const isCurrent = lvl.code === current.code;
          return (
            <View key={lvl.code} style={s.lvlCell}>
              <View
                style={[
                  s.lvlDot,
                  {
                    backgroundColor: reached ? lvl.color : c.neutral[200],
                    borderColor: isCurrent ? lvl.color : 'transparent',
                  },
                ]}
              >
                <Text style={s.lvlEmoji}>{reached ? lvl.emoji : '🔒'}</Text>
              </View>
              <Text style={[s.lvlLabel, reached && { color: c.dark, fontWeight: '700' }]} numberOfLines={1}>
                {lvl.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    card: {
      backgroundColor: '#fff',
      marginHorizontal: spacing.lg,
      marginTop: spacing.md,
      padding: spacing.lg,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: c.neutral[200],
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
      borderRadius: radius.full,
      borderWidth: 1.5,
    },
    badgeEmoji: { fontSize: 16 },
    badgeLabel: {
      fontSize: typography.fontSize.sm,
      fontWeight: '800',
      letterSpacing: 0.4,
    },
    nextHint: {
      flexShrink: 1,
      textAlign: 'right',
      fontSize: 11,
      color: c.neutral[500],
    },
    nextLabel: { fontWeight: '700' },
    maxedHint: {
      flexShrink: 1,
      textAlign: 'right',
      fontSize: 11,
      color: c.primary[600],
      fontWeight: '700',
    },

    barTrack: {
      height: 10,
      borderRadius: 5,
      backgroundColor: c.neutral[100],
      overflow: 'hidden',
    },
    barFill: { height: '100%', borderRadius: 5 },
    barFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: spacing.xs,
    },
    barFooterCurrent: {
      fontSize: typography.fontSize.sm,
      fontWeight: '800',
      color: c.dark,
      fontVariant: ['tabular-nums'],
    },
    barFooterRemaining: {
      fontSize: 11,
      color: c.neutral[500],
      fontVariant: ['tabular-nums'],
    },

    levels: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: spacing.lg,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: c.neutral[100],
    },
    lvlCell: { alignItems: 'center', flex: 1, gap: 6 },
    lvlDot: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
    },
    lvlEmoji: { fontSize: 16 },
    lvlLabel: {
      fontSize: 10,
      color: c.neutral[500],
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },

    skelLine: {
      height: 16,
      borderRadius: 4,
      backgroundColor: c.neutral[100],
      marginTop: spacing.md,
    },
  });
}
