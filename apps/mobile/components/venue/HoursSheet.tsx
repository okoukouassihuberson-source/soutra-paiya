import { useMemo } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { typography, radius, spacing, type ColorPalette } from '@soutra/shared';
import { useColors } from '@/lib/theme';
import { DAY_ORDER, DAY_LABELS, formatTimeFR, type DayKey } from './hoursHelpers';

interface Props {
  visible: boolean;
  onClose: () => void;
  hours: Record<string, [string, string] | undefined>;
  todayKey: DayKey;
}

/**
 * Bottom sheet plein largeur listant les 7 jours de la semaine.
 * Jour courant surligné en orange brand. Lignes vides → « Fermé ».
 *
 * Animation slide-up native (Modal animationType="slide").
 * Tap backdrop ou « ✕ » pour fermer.
 */
export function HoursSheet({ visible, onClose, hours, todayKey }: Props) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Fermer" />
        <View style={s.sheet}>
          <View style={s.handle} />

          <View style={s.headerRow}>
            <Ionicons name="time-outline" size={20} color={c.primary[500]} />
            <Text style={s.title}>Horaires d'ouverture</Text>
            <Pressable hitSlop={10} onPress={onClose} style={s.closeBtn}>
              <Ionicons name="close" size={20} color={c.neutral[600]} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: spacing.lg }}>
            {DAY_ORDER.map((day) => {
              const range = hours[day];
              const isToday = day === todayKey;
              const isOpenDay = range && range[0] && range[1];
              return (
                <View key={day} style={[s.row, isToday && s.rowToday]}>
                  <Text style={[s.day, isToday && s.dayToday]}>{DAY_LABELS[day]}</Text>
                  {isOpenDay ? (
                    <Text style={[s.time, isToday && s.timeToday]}>
                      {formatTimeFR(range![0])} – {formatTimeFR(range![1])}
                    </Text>
                  ) : (
                    <Text style={s.closed}>Fermé</Text>
                  )}
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: c.light,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing['2xl'],
      maxHeight: '85%',
    },
    handle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.neutral[200],
      marginTop: 6,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: c.neutral[100],
    },
    title: {
      flex: 1,
      fontSize: typography.fontSize.lg,
      fontWeight: '700',
      color: c.dark,
    },
    closeBtn: {
      width: 32, height: 32, borderRadius: 16,
      backgroundColor: c.neutral[100],
      alignItems: 'center',
      justifyContent: 'center',
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: c.neutral[100],
    },
    rowToday: {
      backgroundColor: c.primary[50],
      borderRadius: radius.md,
      marginVertical: 2,
      borderBottomWidth: 0,
    },
    day: { fontSize: typography.fontSize.base, color: c.dark, fontWeight: '600' },
    dayToday: { color: c.primary[700], fontWeight: '800' },
    time: { fontSize: typography.fontSize.base, color: c.dark, fontWeight: '600', fontVariant: ['tabular-nums'] },
    timeToday: { color: c.primary[700], fontWeight: '800' },
    closed: { fontSize: typography.fontSize.sm, color: c.neutral[500], fontStyle: 'italic' },
  });
}
