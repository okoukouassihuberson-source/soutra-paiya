// ============================================================================
// ProactiveCards — affichage des suggestions IA proactives (Phase 7).
//
// Charge automatiquement les suggestions au mount via fetchProactiveSuggestions
// et les affiche en cards horizontalement scrollables.
//
// Au tap :
//   • action 'navigate' → router.push(route)
//   • action 'ask_sia'  → onAskSia?.(prompt) (le parent décide de l'effet :
//     pré-remplit l'input, ouvre le modal vocal avec le message déjà parlé,
//     etc.)
//
// Auto-hide si aucune suggestion (composant entièrement transparent).
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { typography, radius, spacing, type ColorPalette } from '@soutra/shared';
import { useColors } from '@/lib/theme';
import { fetchProactiveSuggestions, type ProactiveSuggestion } from '@/lib/proactive';

interface Props {
  /** Callback quand l'utilisateur tap une suggestion de type 'ask_sia'. */
  onAskSia?: (prompt: string) => void;
}

export function ProactiveCards({ onAskSia }: Props) {
  const router = useRouter();
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const [suggestions, setSuggestions] = useState<ProactiveSuggestion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      // Récupère la position si autorisée (best-effort)
      let lat: number | undefined;
      let lng: number | undefined;
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === 'granted') {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        }
      } catch { /* fallback Abidjan côté serveur */ }

      const list = await fetchProactiveSuggestions({ lat, lng });
      if (active) {
        setSuggestions(list);
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  // Loading : skeleton minimal pendant le 1er chargement
  if (loading) {
    return (
      <View style={s.loadingRow}>
        <ActivityIndicator size="small" color={c.primary[400]} />
        <Text style={s.loadingText}>Sia prépare des suggestions…</Text>
      </View>
    );
  }

  // Auto-hide si rien à proposer
  if (suggestions.length === 0) return null;

  const handleTap = (sug: ProactiveSuggestion) => {
    if (sug.action.type === 'navigate') {
      router.push(sug.action.route as any);
    } else if (sug.action.type === 'ask_sia') {
      onAskSia?.(sug.action.prompt);
    }
  };

  return (
    <View style={s.wrap}>
      <View style={s.headerRow}>
        <Text style={s.headerEmoji}>✨</Text>
        <Text style={s.headerText}>Pour toi maintenant</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.scroll}
      >
        {suggestions.map((sug) => (
          <Pressable
            key={sug.id}
            onPress={() => handleTap(sug)}
            style={({ pressed }) => [s.card, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
            accessibilityLabel={`${sug.title} : ${sug.body}`}
          >
            <Text style={s.cardEmoji}>{sug.icon}</Text>
            <Text style={s.cardTitle} numberOfLines={2}>{sug.title}</Text>
            <Text style={s.cardBody} numberOfLines={3}>{sug.body}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    wrap: { marginTop: spacing.md, marginBottom: spacing.md },
    headerRow: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
      marginBottom: spacing.sm, paddingHorizontal: spacing.lg,
    },
    headerEmoji: { fontSize: 16 },
    headerText: {
      fontSize: typography.fontSize.xs, fontWeight: '800',
      color: c.neutral[600], textTransform: 'uppercase', letterSpacing: 0.5,
    },
    scroll: { paddingHorizontal: spacing.lg, gap: spacing.sm },
    card: {
      width: 220,
      backgroundColor: c.primary[50],
      borderWidth: 1, borderColor: c.primary[200],
      borderRadius: radius.lg,
      padding: spacing.md,
      gap: 4,
    },
    cardEmoji: { fontSize: 24 },
    cardTitle: {
      fontSize: typography.fontSize.sm, fontWeight: '800',
      color: c.primary[700], marginTop: 2,
    },
    cardBody: {
      fontSize: typography.fontSize.xs, color: c.dark, lineHeight: 17,
    },
    loadingRow: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    },
    loadingText: { fontSize: typography.fontSize.xs, color: c.neutral[500] },
  });
}
