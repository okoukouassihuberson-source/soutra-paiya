/**
 * Skeleton — placeholder animé pendant un chargement.
 * Compatible thème : utilise useColors() pour la couleur de base.
 */

import { useEffect, useMemo, useRef } from 'react';
import { Animated, View, StyleSheet, type ViewStyle } from 'react-native';
import { radius, type ColorPalette } from '@soutra/shared';
import { useColors } from '@/lib/theme';

type Props = {
  width?: number | `${number}%`;
  height?: number;
  style?: ViewStyle;
  borderRadius?: number;
};

export function Skeleton({ width = '100%', height = 16, style, borderRadius: br }: Props) {
  const c = useColors();
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.8, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        { width, height, opacity, backgroundColor: c.neutral[200], borderRadius: br ?? radius.md },
        style,
      ]}
    />
  );
}

export function VenueCardSkeleton() {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <View style={s.card}>
      <Skeleton width="100%" height={160} borderRadius={0} />
      <View style={s.body}>
        <Skeleton width="60%" height={18} />
        <Skeleton width="40%" height={12} style={{ marginTop: 8 }} />
        <Skeleton width="30%" height={14} style={{ marginTop: 12 }} />
      </View>
    </View>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    card: {
      marginHorizontal: 24, marginBottom: 16,
      backgroundColor: c.neutral[50], borderRadius: 16, overflow: 'hidden',
      elevation: 2, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    },
    body: { padding: 12 },
  });
}
