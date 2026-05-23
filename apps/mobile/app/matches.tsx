import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Image, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, radius, spacing } from '@soutra/shared';
import { listMatches, type Match } from '@/lib/discover';

export default function Matches() {
  const router = useRouter();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listMatches();
      setMatches(data);
    } catch (err: any) {
      Alert.alert('Erreur', err?.message ?? 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={colors.dark} />
        </Pressable>
        <Text style={s.title}>Mes matchs</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={colors.primary[500]} /></View>
      ) : matches.length === 0 ? (
        <View style={s.center}>
          <Ionicons name="heart-outline" size={64} color={colors.neutral[300]} />
          <Text style={s.emptyTitle}>Pas encore de match</Text>
          <Text style={s.emptyText}>Quand toi et quelqu'un d'autre vous likez mutuellement, ça apparaît ici.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
          {matches.map((m) => (
            <View key={m.id} style={s.row}>
              <View style={s.avatar}>
                {m.avatar_url ? (
                  <Image source={{ uri: m.avatar_url }} style={s.avatarImg} />
                ) : (
                  <Text style={s.avatarTxt}>{(m.full_name || '?').charAt(0).toUpperCase()}</Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{m.full_name || 'Anonyme'}</Text>
                <Text style={s.meta}>📍 {m.district || m.city || 'Abidjan'} · ❤️ {relativeTime(m.matched_at)}</Text>
              </View>
            </View>
          ))}
          <Text style={s.footer}>Le chat 1-on-1 arrive dans une prochaine brique.</Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function relativeTime(iso: string): string {
  const d = new Date(iso);
  const diff = Math.max(0, Date.now() - d.getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'à l\'instant';
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `il y a ${days} j`;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.light },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.neutral[200],
  },
  title: { fontSize: typography.fontSize.base, fontWeight: '700', color: colors.dark },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyTitle: { marginTop: spacing.base, fontSize: typography.fontSize.base, fontWeight: '700', color: colors.dark },
  emptyText: { marginTop: spacing.xs, fontSize: typography.fontSize.sm, color: colors.neutral[500], textAlign: 'center', maxWidth: 300 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.neutral[100] },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary[500], alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg: { width: '100%', height: '100%' },
  avatarTxt: { color: '#fff', fontWeight: '700', fontSize: typography.fontSize.base },
  name: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.dark },
  meta: { fontSize: typography.fontSize.xs, color: colors.neutral[600], marginTop: 2 },
  footer: { marginTop: spacing.xl, textAlign: 'center', fontSize: typography.fontSize.xs, color: colors.neutral[400] },
});
