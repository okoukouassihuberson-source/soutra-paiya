import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import {
  typography,
  radius,
  spacing,
  formatXOF,
  categoryLabel,
  categoryEmoji,
  type ColorPalette,
} from '@soutra/shared';
import { useColors } from '@/lib/theme';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Skeleton } from '@/components/Skeleton';
import { searchNL, type NLIntent, type NLVenueResult } from '@/lib/search-nl';

const SUGGESTIONS = [
  'Restaurant romantique à Cocody ouvert ce soir',
  "Piscine ouverte maintenant à moins de 10 minutes",
  'Pharmacie de garde la plus proche',
  'Maquis pas cher avec musique live',
  'Hôtel avec piscine à Bassam',
  'Boîte de nuit à Marcory',
];

/**
 * Recherche IA en langage naturel : l'utilisateur tape une phrase, Claude
 * extrait l'intention (catégorie, prix, distance, commune, ambiance) et
 * on lance `search_venues_nearby` avec les bons paramètres.
 *
 * UX :
 *   • Au mount : si ?q=… est passé en query param, on lance la recherche
 *   • Avant recherche : 6 suggestions cliquables
 *   • Pendant recherche : skeleton
 *   • Après recherche :
 *       - Banner « Compris : … » avec puces (catégorie, prix, distance…)
 *       - Liste cards venues triées par distance
 *       - Empty state si 0 résultat
 */
export default function SearchAI() {
  const router = useRouter();
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const { q } = useLocalSearchParams<{ q?: string }>();

  const [query, setQuery] = useState(q ?? '');
  const [loading, setLoading] = useState(false);
  const [interpretation, setInterpretation] = useState<NLIntent | null>(null);
  const [results, setResults] = useState<NLVenueResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Récupère la position (best-effort, échec silencieux → fallback Abidjan côté serveur).
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (active) setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      } catch {
        // pas grave, le serveur tombera sur Abidjan centre
      }
    })();
    return () => { active = false; };
  }, []);

  // Auto-recherche si query param fourni au mount.
  useEffect(() => {
    if (q && q.trim()) {
      runSearch(q.trim());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runSearch(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await searchNL({ query: trimmed, lat: coords?.lat, lng: coords?.lng });
      setInterpretation(res.interpretation);
      setResults(res.results);
    } catch (err: any) {
      console.error('[search-ai] error:', err);
      const msg = err?.message ?? 'La recherche IA a échoué. Réessaie dans un instant.';
      Alert.alert('Erreur', msg);
      setInterpretation(null);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader title="Recherche IA" subtitle="Demande ce que tu cherches en français" />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={8}
      >
        <ScrollView contentContainerStyle={{ paddingBottom: spacing['2xl'] }} keyboardShouldPersistTaps="handled">
          {/* Input */}
          <View style={s.searchWrap}>
            <View style={s.searchBox}>
              <Ionicons name="sparkles" size={18} color={c.primary[500]} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Ex : restaurant romantique à Cocody"
                placeholderTextColor={c.neutral[400]}
                style={s.searchInput}
                returnKeyType="search"
                onSubmitEditing={() => runSearch(query)}
                editable={!loading}
                multiline={false}
              />
              {query.length > 0 && !loading && (
                <Pressable onPress={() => setQuery('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={c.neutral[400]} />
                </Pressable>
              )}
            </View>
            <Pressable
              disabled={loading || !query.trim()}
              onPress={() => runSearch(query)}
              style={({ pressed }) => [
                s.submitBtn,
                { backgroundColor: query.trim() && !loading ? c.primary[500] : c.neutral[300] },
                pressed && query.trim() && !loading && { opacity: 0.9 },
              ]}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={s.submitBtnText}>Demander</Text>
              )}
            </Pressable>
          </View>

          {/* État avant recherche : suggestions */}
          {!searched && (
            <View style={s.suggestionsWrap}>
              <Text style={s.sectionLabel}>Idées de recherches</Text>
              {SUGGESTIONS.map((sug) => (
                <Pressable
                  key={sug}
                  onPress={() => { setQuery(sug); runSearch(sug); }}
                  style={({ pressed }) => [s.suggestion, pressed && { opacity: 0.7 }]}
                >
                  <Ionicons name="bulb-outline" size={16} color={c.primary[600]} />
                  <Text style={s.suggestionText}>{sug}</Text>
                  <Ionicons name="chevron-forward" size={16} color={c.neutral[400]} />
                </Pressable>
              ))}
            </View>
          )}

          {/* Skeleton pendant recherche */}
          {loading && (
            <View style={{ marginTop: spacing.lg, marginHorizontal: spacing.lg, gap: spacing.md }}>
              <Skeleton width="100%" height={56} borderRadius={radius.lg} />
              <Skeleton width="100%" height={110} borderRadius={radius.lg} />
              <Skeleton width="100%" height={110} borderRadius={radius.lg} />
              <Skeleton width="100%" height={110} borderRadius={radius.lg} />
            </View>
          )}

          {/* Banner interprétation */}
          {!loading && interpretation && searched && (
            <View style={s.interpretationWrap}>
              <View style={s.interpretationHeader}>
                <Ionicons name="sparkles" size={14} color={c.primary[600]} />
                <Text style={s.interpretationTitle}>Compris</Text>
              </View>
              <Text style={s.interpretationSummary}>{interpretation.summary}</Text>
              <View style={s.chipsRow}>
                {interpretation.category && (
                  <View style={s.chip}><Text style={s.chipText}>{categoryEmoji(interpretation.category)} {categoryLabel(interpretation.category)}</Text></View>
                )}
                {interpretation.commune && (
                  <View style={s.chip}><Text style={s.chipText}>📍 {interpretation.commune}</Text></View>
                )}
                {interpretation.max_distance_km != null && (
                  <View style={s.chip}><Text style={s.chipText}>≤ {interpretation.max_distance_km} km</Text></View>
                )}
                {interpretation.max_price_xof != null && (
                  <View style={s.chip}><Text style={s.chipText}>≤ {formatXOF(interpretation.max_price_xof)}</Text></View>
                )}
                {interpretation.open_now && (
                  <View style={[s.chip, { backgroundColor: '#dcfce7' }]}>
                    <Text style={[s.chipText, { color: '#16a34a' }]}>🟢 Ouvert maintenant</Text>
                  </View>
                )}
                {interpretation.ambiance_keywords?.map((kw) => (
                  <View key={kw} style={s.chip}><Text style={s.chipText}>✨ {kw}</Text></View>
                ))}
              </View>
            </View>
          )}

          {/* Liste résultats */}
          {!loading && searched && interpretation && (
            <View style={{ marginTop: spacing.md }}>
              {results.length === 0 ? (
                <View style={s.empty}>
                  <View style={s.emptyIcon}>
                    <Ionicons name="search-outline" size={36} color={c.primary[400]} />
                  </View>
                  <Text style={s.emptyTitle}>Aucun résultat</Text>
                  <Text style={s.emptyText}>
                    Affine ta recherche ou élargis le rayon. Soutra-Explore
                    n'a pas encore tous les lieux référencés — tu peux en
                    ajouter via le bouton « Signaler ».
                  </Text>
                </View>
              ) : (
                <>
                  <Text style={[s.sectionLabel, { marginTop: spacing.sm }]}>
                    {results.length} lieu{results.length > 1 ? 'x' : ''} trouvé{results.length > 1 ? 's' : ''}
                  </Text>
                  {results.map((v) => <VenueCard key={v.id} venue={v} c={c} onPress={() => router.push({ pathname: '/venue/[id]', params: { id: v.id } })} />)}
                </>
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function VenueCard({ venue, c, onPress }: { venue: NLVenueResult; c: ColorPalette; onPress: () => void }) {
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.card, pressed && { opacity: 0.85 }]}>
      <View style={s.cardThumb}>
        {venue.cover_url ? (
          <Image source={{ uri: venue.cover_url }} style={{ width: '100%', height: '100%' }} />
        ) : (
          <Text style={s.cardThumbFallback}>{categoryEmoji(venue.category)}</Text>
        )}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={s.cardName} numberOfLines={1}>{venue.name}</Text>
          {venue.is_open_now === true && <View style={s.openDot} />}
        </View>
        <Text style={s.cardMeta} numberOfLines={1}>
          {categoryLabel(venue.category)}
          {venue.district ? ` · ${venue.district}` : venue.city ? ` · ${venue.city}` : ''}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2 }}>
          {venue.rating_avg != null && (
            <Text style={s.cardRating}>★ {Number(venue.rating_avg).toFixed(1)}</Text>
          )}
          {venue.distance_km != null && (
            <Text style={s.cardDist}>{venue.distance_km < 1 ? `${Math.round(venue.distance_km * 1000)} m` : `${venue.distance_km.toFixed(1)} km`}</Text>
          )}
          {venue.avg_price_xof != null && (
            <Text style={s.cardPrice}>{formatXOF(venue.avg_price_xof)}</Text>
          )}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={c.neutral[400]} />
    </Pressable>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.light },

    searchWrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm },
    searchBox: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      backgroundColor: c.neutral[50],
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.neutral[200],
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    searchInput: {
      flex: 1,
      fontSize: typography.fontSize.base,
      color: c.dark,
      paddingVertical: 4,
    },
    submitBtn: {
      borderRadius: radius.full,
      paddingVertical: spacing.md,
      alignItems: 'center',
    },
    submitBtnText: { color: '#fff', fontWeight: '700', fontSize: typography.fontSize.base },

    sectionLabel: {
      fontSize: typography.fontSize.xs,
      fontWeight: '700',
      color: c.neutral[500],
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginHorizontal: spacing.lg,
      marginBottom: spacing.sm,
    },

    suggestionsWrap: { marginTop: spacing.xl, paddingBottom: spacing.lg },
    suggestion: {
      marginHorizontal: spacing.lg,
      marginBottom: spacing.sm,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      backgroundColor: c.neutral[50],
      borderWidth: 1, borderColor: c.neutral[100],
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    },
    suggestionText: { flex: 1, fontSize: typography.fontSize.sm, color: c.dark, fontWeight: '600' },

    interpretationWrap: {
      marginHorizontal: spacing.lg,
      marginTop: spacing.lg,
      padding: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: c.primary[50],
      borderWidth: 1, borderColor: c.primary[100],
    },
    interpretationHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    interpretationTitle: {
      fontSize: typography.fontSize.xs,
      fontWeight: '700',
      color: c.primary[700],
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    interpretationSummary: {
      fontSize: typography.fontSize.sm,
      color: c.dark,
      fontWeight: '600',
      marginTop: 4,
      lineHeight: 19,
    },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm },
    chip: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      borderRadius: radius.full,
      backgroundColor: '#fff',
      borderWidth: 1, borderColor: c.primary[100],
    },
    chipText: { fontSize: 11, color: c.primary[700], fontWeight: '700' },

    card: {
      marginHorizontal: spacing.lg,
      marginBottom: spacing.sm,
      padding: spacing.sm,
      borderRadius: radius.lg,
      backgroundColor: '#fff',
      borderWidth: 1, borderColor: c.neutral[100],
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    cardThumb: {
      width: 64, height: 64,
      borderRadius: radius.md,
      backgroundColor: c.neutral[100],
      overflow: 'hidden',
      alignItems: 'center', justifyContent: 'center',
    },
    cardThumbFallback: { fontSize: 28 },
    cardName: { fontSize: typography.fontSize.sm, fontWeight: '700', color: c.dark, flex: 1 },
    cardMeta: { fontSize: typography.fontSize.xs, color: c.neutral[600] },
    cardRating: { fontSize: typography.fontSize.xs, color: c.warning, fontWeight: '700' },
    cardDist: { fontSize: typography.fontSize.xs, color: c.neutral[600], fontWeight: '600' },
    cardPrice: { fontSize: typography.fontSize.xs, color: c.dark, fontWeight: '700' },
    openDot: {
      width: 7, height: 7, borderRadius: 3.5,
      backgroundColor: '#16a34a',
    },

    empty: {
      marginHorizontal: spacing.lg,
      padding: spacing.xl,
      borderRadius: radius.lg,
      backgroundColor: c.neutral[50],
      alignItems: 'center',
    },
    emptyIcon: {
      width: 72, height: 72, borderRadius: 36,
      backgroundColor: c.primary[50],
      alignItems: 'center', justifyContent: 'center',
      marginBottom: spacing.sm,
    },
    emptyTitle: { fontSize: typography.fontSize.base, fontWeight: '700', color: c.dark, marginBottom: 4 },
    emptyText: { fontSize: typography.fontSize.sm, color: c.neutral[500], textAlign: 'center', lineHeight: 19, maxWidth: 320 },
  });
}
