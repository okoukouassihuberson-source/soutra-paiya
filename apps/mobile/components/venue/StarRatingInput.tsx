import { View, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/lib/theme';

interface Props {
  value: number; // 0-5 (0 = aucune sélection)
  onChange?: (v: number) => void;
  size?: number;
  disabled?: boolean;
  readOnly?: boolean;
  color?: string;
}

export function StarRatingInput({ value, onChange, size = 32, disabled, readOnly, color }: Props) {
  const c = useColors();
  const starColor = color ?? c.warning;

  return (
    <View style={s.row}>
      {[1, 2, 3, 4, 5].map((i) => {
        const filled = i <= Math.round(value);
        const star = (
          <Ionicons
            name={filled ? 'star' : 'star-outline'}
            size={size}
            color={filled ? starColor : c.neutral[300]}
          />
        );
        if (readOnly) {
          return <View key={i}>{star}</View>;
        }
        return (
          <Pressable
            key={i}
            hitSlop={6}
            disabled={disabled}
            onPress={() => onChange?.(i)}
            accessibilityLabel={`${i} étoile${i > 1 ? 's' : ''}`}
          >
            {star}
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 4 },
});
