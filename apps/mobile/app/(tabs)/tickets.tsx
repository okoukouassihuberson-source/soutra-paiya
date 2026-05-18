import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, radius, spacing } from '@soutra/shared';

export default function Tickets() {
  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}><Text style={s.title}>Mes Billets & Réservations</Text></View>
      <ScrollView contentContainerStyle={s.body}>
        <Ionicons name="ticket-outline" size={64} color={colors.neutral[300]} />
        <Text style={s.empty}>Tes prochains billets et réservations apparaîtront ici.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.light },
  header: { padding: spacing.lg },
  title: { fontSize: typography.fontSize.xl, fontWeight: '700', color: colors.dark },
  body: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  empty: { marginTop: spacing.base, color: colors.neutral[500], textAlign: 'center' },
});
