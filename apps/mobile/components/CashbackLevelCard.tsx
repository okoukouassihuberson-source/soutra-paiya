import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { typography, radius, spacing, formatXOF, type ColorPalette } from '@soutra/shared';
import { useColors } from '@/lib/theme';

/**
 * CashbackLevelCard — gamification Bronze → Diamond.
 *
 * Spec PO :
 *   "Refondre complètement l'expérience Cashback avec gamification :
 *    Bronze, Silver, Gold, Platinum, Diamond. Barre progression animée
 *    avec niveau suivant + montant restant pour débloquer le prochain
 *    palier."
 *
 * Niveau calculé client-side depuis le total cashback all-time. Pas de
 * migration DB : on a déjà la donnée. Les seuils peuvent être ajustés
 * dans LEVELS sans toucher au backend.
 *
 * Les couleurs des badges respectent l'imaginaire collectif :
 *   Bronze   #B87333 (cuivre)
 *   Silver   #C0C0C0 (argent)
 *   Gold     #D4AF37 (or)
 *   Platinum #6E8898 (gris-bleu acier)
 *   Diamond  #5BCFFA (cyan brillant)
 */

export type CashbackLevel = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';

interface LevelDef {
  key: CashbackLevel;
  label: string;
  emoji: string;
  /** Seuil minimum cumulé pour atteindre ce niveau (XOF). */
  threshold: number;
  /** Couleur du badge + barre. */
  color: string;
}

const LEVELS: LevelDef[] = [
  { key: 'bronze',   label: 'Bronze',   emoji: '🥉', threshold: 0,       color: '#B87333' },
  { key: 'silver',   label: 'Silver',   emoji: '🥈', threshold: 5_000,   color: '#9CA3AF' },
  { key: 'gold',     label: 'Gold',     emoji: '🥇', threshold: 25_000,  color: '#D4AF37' },
  { key: 'platinum', label: 'Platinum', emoji: '💎', threshold: 100_000, color: '#6E8898' },
  { key: 'diamond',  label: 'Diamond',  emoji: '✨', threshold: 500_000, color: '#5BCFFA' },
];

function getLevel(totalXof: number): { current: LevelDef; next: LevelDef | null } {
  let current = LEVELS[0];
  for (const lvl of LEVELS) {
    if (totalXof >= lvl.threshold) current = lvl;
  }
  const idx = LEVELS.findIndex((l) => l.key === current.key);
  const next = idx < LEVELS.length - 1 ? LEVELS[idx + 1] : null;
  return { current, next };
}

interface Props {
  totalXof: number;
  loading?: boolean;
}

export function CashbackLevelCard({ totalXof, loading = false }: Props) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  const { current, next } = useMemo(() => getLevel(totalXof), [totalXof]);

  // Barre de progression : fraction entre seuil courant et seuil suivant.
  const progress = useMemo(() => {
    if (!next) return 1; // niveau max atteint
    const span = next.threshold - current.threshold;
    const done = Math.max(0, totalXof - current.threshold);
    return Math.min(1, span > 0 ? done / span : 1);
  }, [totalXof, current, next]);

  const remaining = next ? Math.max(0, next.threshold - totalXof) : 0;

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

      {/* Barre de progression */}
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
        <Text style={s.barFooterCurrent}>{formatXOF(totalXof)}</Text>
        {next && (
          <Text style={s.barFooterRemaining}>
            {formatXOF(remaining)} pour passer {next.label}
          </Text>
        )}
        {!next && (
          <Text style={s.barFooterRemaining}>Tu es au sommet 👑</Text>
        )}
      </View>

      {/* Tous les niveaux avec checkmarks */}
      <View style={s.levels}>
        {LEVELS.map((lvl) => {
          const reached = totalXof >= lvl.threshold;
          const isCurrent = lvl.key === current.key;
          return (
            <View key={lvl.key} style={s.lvlCell}>
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
