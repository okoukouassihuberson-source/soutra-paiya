import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { typography, radius, spacing, type ColorPalette } from '@soutra/shared';
import { useColors } from '@/lib/theme';
import { StarRatingInput } from './StarRatingInput';
import type { ReviewStats } from '@/lib/reviews';

interface Props {
  stats: ReviewStats;
}

export function RatingDistribution({ stats }: Props) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const { ratingAvg, ratingCount, distribution } = stats;

  return (
    <View style={s.wrap}>
      <View style={s.header}>
        <Text style={s.avg}>{ratingAvg.toFixed(1)}</Text>
        <View>
          <StarRatingInput value={ratingAvg} readOnly size={16} />
          <Text style={s.count}>{ratingCount} avis</Text>
        </View>
      </View>

      <View style={s.bars}>
        {([5, 4, 3, 2, 1] as const).map((star) => {
          const count = distribution[String(star) as keyof typeof distribution] ?? 0;
          const pct = ratingCount > 0 ? Math.round((count / ratingCount) * 100) : 0;
          return (
            <View key={star} style={s.barRow}>
              <Text style={s.barLabel}>{star}</Text>
              <View style={s.barTrack}>
                <View style={[s.barFill, { width: `${pct}%` }]} />
              </View>
              <Text style={s.barCount}>{count}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    wrap: { paddingVertical: spacing.md },
    header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
    avg: { fontSize: 40, fontWeight: '800', color: c.dark },
    count: { fontSize: typography.fontSize.xs, color: c.neutral[500], marginTop: 4 },
    bars: { gap: 6 },
    barRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    barLabel: { fontSize: typography.fontSize.xs, color: c.neutral[600], width: 10 },
    barTrack: { flex: 1, height: 6, borderRadius: radius.full, backgroundColor: c.neutral[100], overflow: 'hidden' },
    barFill: { height: '100%', backgroundColor: c.warning, borderRadius: radius.full },
    barCount: { fontSize: typography.fontSize.xs, color: c.neutral[500], width: 24, textAlign: 'right' },
  });
}
