// Nouveau fichier : apps/mobile/app/(tabs)/index.tsx
//
// Écran Accueil — l'onglet d'entrée après login. Rôle : répondre à « où je vais
// maintenant ? » sans passer par la carte. La carte reste sur /explore.
//
// Données : uniquement des RPC et tables déjà présentes sur main.
//   - search_venues_nearby (migration 0021) : rayon, catégorie, ouvert maintenant,
//     distance et is_open_now calculés côté serveur.
//   - posts (migration 0022) : compteur du jour pour la section communauté.
//
// Après avoir créé ce fichier, basculer la redirection de app/_layout.tsx :
//   router.replace('/(tabs)/explore')  ->  router.replace('/(tabs)')

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ScrollView, View, Text, Pressable, StyleSheet,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import {
  typography, radius, spacing, touch,
  formatDistance, formatVenuePriceLabel, categoryLabel, categoryEmoji,
  type ColorPalette,
} from '@soutra/shared';
import { supabase } from '@/lib/supabase';
import { useColors } from '@/lib/theme';

// Abidjan — Plateau. Repli quand la localisation est refusée : l'écran doit
// rester utile sans permission, jamais vide.
const FALLBACK = { lat: 5.3599517, lng: -4.0082563 };
const RADIUS_KM = 10;

// Cinq entrées seulement. Le catalogue complet (60+ catégories) reste dans
// le sélecteur d'Explorer — ici on ne montre que les usages réels.
const QUICK_CATEGORIES = ['restaurant', 'maquis', 'bar', 'club', 'hotel'] as const;

interface NearbyVenue {
  id: string;
  name: string;
  category: string | null;
  cover_url: string | null;
  district: string | null;
  city: string | null;
  avg_price_xof: number | null;
  rating_avg: number | null;
  rating_count: number | null;
  distance_km: number | null;
  is_open_now: boolean | null;
}

export default function HomeScreen() {
  const router = useRouter();
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  const [coords, setCoords] = useState<{ lat: number; lng: number }>(FALLBACK);
  const [located, setLocated] = useState(false);
  const [placeName, setPlaceName] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [openNow, setOpenNow] = useState(true);
  const [venues, setVenues] = useState<NearbyVenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [postsToday, setPostsToday] = useState<number | null>(null);

  // Localisation — best effort, silencieuse en cas de refus.
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted' || !mounted) return;
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!mounted) return;
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocated(true);
        const rev = await Location.reverseGeocodeAsync(pos.coords);
        if (mounted && rev[0]) setPlaceName(rev[0].district || rev[0].city || null);
      } catch {
        /* on reste sur le repli Abidjan */
      }
    })();
    return () => { mounted = false; };
  }, []);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: rpcError } = await (supabase as any).rpc('search_venues_nearby', {
      p_lat: coords.lat,
      p_lng: coords.lng,
      p_radius_km: RADIUS_KM,
      p_category: category,
      p_open_now: openNow,
    });
    if (rpcError) {
      setError(rpcError.message);
      setVenues([]);
    } else {
      setVenues(((data as NearbyVenue[]) ?? []).slice(0, 8));
    }
    setLoading(false);
  }, [coords.lat, coords.lng, category, openNow]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  // Compteur communauté du jour — signal léger, pas un feed dupliqué.
  useEffect(() => {
    let mounted = true;
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    (supabase as any)
      .from('posts')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', since)
      .then(({ count }: { count: number | null }) => {
        if (mounted) setPostsToday(count ?? 0);
      })
      .catch(() => { /* section dégradée, pas bloquante */ });
    return () => { mounted = false; };
  }, []);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const hasFilter = category !== null || !openNow;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing['3xl'] }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary[500]} />}
      >
        {/* Position — dit toujours d'où viennent les distances affichées. */}
        <View style={s.locRow}>
          <Ionicons name="location-sharp" size={15} color={c.primary[500]} />
          <Text style={s.locText} numberOfLines={1}>
            {placeName ?? (located ? 'Autour de toi' : 'Abidjan, Plateau')}
          </Text>
          {!located && <Text style={s.locHint}>position approximative</Text>}
        </View>

        <Text style={s.hello}>Où on va ce soir ?</Text>

        {/* Recherche + micro SIA. Deux cibles distinctes de 44 px minimum. */}
        <View style={s.searchRow}>
          <Pressable style={s.searchBox} onPress={() => router.push('/search' as any)}>
            <Ionicons name="search" size={18} color={c.ink.faint} />
            <Text style={s.searchPlaceholder}>Un lieu, un plat, une envie…</Text>
          </Pressable>
          <Pressable
            style={s.micBtn}
            onPress={() => router.push('/search-ai' as any)}
            accessibilityLabel="Recherche vocale SIA"
          >
            <Ionicons name="mic" size={20} color={c.ink.onDark} />
          </Pressable>
        </View>

        {/* Catégories */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.catRow}
        >
          {QUICK_CATEGORIES.map((cat) => {
            const active = category === cat;
            return (
              <Pressable
                key={cat}
                onPress={() => setCategory(active ? null : cat)}
                style={[s.catChip, active && s.catChipActive]}
              >
                <Text style={s.catEmoji}>{categoryEmoji(cat)}</Text>
                <Text style={[s.catLabel, active && s.catLabelActive]}>{categoryLabel(cat)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Bandeau de filtres actifs — l'utilisateur doit pouvoir défaire ce
            qu'il a posé sans chercher où. */}
        {hasFilter && (
          <View style={s.filterBar}>
            <Text style={s.filterText}>
              {[category ? categoryLabel(category) : null, openNow ? 'ouvert maintenant' : null]
                .filter(Boolean)
                .join(' · ')}
              {!openNow && category === null ? 'tous les lieux, ouverts ou non' : ''}
            </Text>
            <Pressable
              onPress={() => { setCategory(null); setOpenNow(true); }}
              hitSlop={8}
            >
              <Text style={s.filterClear}>Réinitialiser</Text>
            </Pressable>
          </View>
        )}

        {/* Liste */}
        <View style={s.sectionHead}>
          <Text style={s.sectionTitle}>{openNow ? 'Ouvert maintenant' : 'Autour de toi'}</Text>
          <Pressable onPress={() => setOpenNow((v) => !v)} hitSlop={8}>
            <Text style={s.sectionAction}>{openNow ? 'Tout voir' : 'Ouverts seulement'}</Text>
          </Pressable>
        </View>

        {loading ? (
          // Squelette, pas un spinner centré : la page garde sa forme.
          <View style={{ gap: spacing.md, paddingHorizontal: spacing.gutter }}>
            {[0, 1, 2].map((i) => <View key={i} style={s.skeleton} />)}
          </View>
        ) : error ? (
          <View style={s.stateBox}>
            <Text style={s.stateTitle}>Chargement impossible</Text>
            <Text style={s.stateBody}>{error}</Text>
            <Pressable style={s.stateBtn} onPress={() => { setLoading(true); load(); }}>
              <Text style={s.stateBtnText}>Réessayer</Text>
            </Pressable>
          </View>
        ) : venues.length === 0 ? (
          <View style={s.stateBox}>
            <Text style={s.stateTitle}>Rien d'ouvert dans {RADIUS_KM} km</Text>
            <Text style={s.stateBody}>
              Élargis la recherche ou regarde les lieux fermés pour préparer ta soirée.
            </Text>
            <Pressable style={s.stateBtn} onPress={() => { setCategory(null); setOpenNow(false); }}>
              <Text style={s.stateBtnText}>Voir tous les lieux</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ gap: spacing.md, paddingHorizontal: spacing.gutter }}>
            {venues.map((v) => <VenueCard key={v.id} venue={v} />)}
          </View>
        )}

        {/* Communauté — remplace l'onglet Social sorti de la barre. */}
        <View style={s.sectionHead}>
          <Text style={s.sectionTitle}>La communauté</Text>
          <Pressable onPress={() => router.push('/feed' as any)} hitSlop={8}>
            <Text style={s.sectionAction}>Tout voir</Text>
          </Pressable>
        </View>
        <Pressable style={s.communityCard} onPress={() => router.push('/feed' as any)}>
          <View style={s.communityIcon}>
            <Ionicons name="chatbubbles" size={20} color={c.ink.onDark} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.communityTitle}>
              {postsToday === null
                ? 'Ce que les autres ont trouvé'
                : postsToday === 0
                  ? 'Sois le premier à publier aujourd’hui'
                  : `${postsToday} publication${postsToday > 1 ? 's' : ''} aujourd’hui`}
            </Text>
            <Text style={s.communitySub}>Stories, adresses et bons plans du jour</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={c.ink.faint} />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function VenueCard({ venue }: { venue: NearbyVenue }) {
  const router = useRouter();
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const price = formatVenuePriceLabel({
    avg_price_xof: venue.avg_price_xof,
    category: venue.category,
  }).label;

  return (
    <Pressable style={s.card} onPress={() => router.push(`/venue/${venue.id}` as any)}>
      {/* Placeholder tant que les photos réelles ne sont pas en base
          (table venue_photos, migration 0078). */}
      <View style={s.cardThumb}>
        <Text style={s.cardThumbEmoji}>{categoryEmoji(venue.category)}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text style={s.cardTitle} numberOfLines={1}>{venue.name}</Text>
        <Text style={s.cardMeta} numberOfLines={1}>
          {[categoryLabel(venue.category), venue.district || venue.city]
            .filter(Boolean).join(' · ')}
        </Text>
        <View style={s.cardBadges}>
          {/* Paire fond/texte, jamais une couleur seule : lisible en plein soleil. */}
          <View style={[s.badge, venue.is_open_now ? s.badgeOpen : s.badgeClosed]}>
            <Text style={venue.is_open_now ? s.badgeOpenText : s.badgeClosedText}>
              {venue.is_open_now === null ? 'Horaires inconnus' : venue.is_open_now ? 'Ouvert' : 'Fermé'}
            </Text>
          </View>
          {venue.distance_km !== null && (
            <Text style={s.cardDist}>{formatDistance(venue.distance_km * 1000)}</Text>
          )}
          {venue.rating_count ? (
            <Text style={s.cardDist}>★ {Number(venue.rating_avg ?? 0).toFixed(1)}</Text>
          ) : null}
        </View>
        {price && <Text style={s.cardPrice}>{price}</Text>}
      </View>
    </Pressable>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.surface.canvas },

    locRow: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: spacing.gutter, paddingTop: spacing.sm,
    },
    locText: {
      fontSize: typography.fontSize.sm,
      fontFamily: typography.fontFamily.semibold,
      color: c.ink.strong,
    },
    locHint: { fontSize: typography.fontSize.xs, color: c.ink.faint },

    hello: {
      paddingHorizontal: spacing.gutter,
      marginTop: spacing.xs,
      fontSize: typography.fontSize['2xl'],
      fontFamily: typography.fontFamily.display,
      letterSpacing: typography.letterSpacing.tight,
      color: c.ink.strong,
    },

    searchRow: {
      flexDirection: 'row', gap: spacing.sm, alignItems: 'stretch',
      paddingHorizontal: spacing.gutter, marginTop: spacing.base,
    },
    searchBox: {
      flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      minHeight: touch.minTarget,
      paddingHorizontal: spacing.md,
      backgroundColor: c.surface.card,
      borderRadius: radius.md,
      borderWidth: 1, borderColor: c.surface.hairline,
    },
    searchPlaceholder: {
      flex: 1,
      fontSize: typography.fontSize.base,
      color: c.ink.faint,
    },
    micBtn: {
      width: touch.minTarget, minHeight: touch.minTarget,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: c.primary[500],
      borderRadius: radius.md,
    },

    catRow: {
      gap: spacing.sm,
      paddingHorizontal: spacing.gutter,
      paddingTop: spacing.base,
      paddingBottom: spacing.xs,
    },
    catChip: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      minHeight: touch.minTarget,
      paddingHorizontal: spacing.md,
      borderRadius: radius.full,
      backgroundColor: c.surface.sunken,
    },
    catChipActive: { backgroundColor: c.primary[500] },
    catEmoji: { fontSize: 15 },
    catLabel: {
      fontSize: typography.fontSize.sm,
      fontFamily: typography.fontFamily.semibold,
      color: c.ink.strong,
    },
    catLabelActive: { color: c.ink.onDark },

    filterBar: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      gap: spacing.sm,
      marginHorizontal: spacing.gutter, marginTop: spacing.sm,
      paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      backgroundColor: c.state.liveBg,
    },
    filterText: {
      flex: 1,
      fontSize: typography.fontSize.sm,
      color: c.state.liveFg,
    },
    filterClear: {
      fontSize: typography.fontSize.sm,
      fontFamily: typography.fontFamily.semibold,
      color: c.state.liveFg,
      textDecorationLine: 'underline',
    },

    sectionHead: {
      flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
      paddingHorizontal: spacing.gutter,
      marginTop: spacing.lg, marginBottom: spacing.md,
    },
    sectionTitle: {
      fontSize: typography.fontSize.xl,
      fontFamily: typography.fontFamily.display,
      letterSpacing: typography.letterSpacing.snug,
      color: c.ink.strong,
    },
    sectionAction: {
      fontSize: typography.fontSize.sm,
      fontFamily: typography.fontFamily.semibold,
      color: c.primary[600],
    },

    skeleton: {
      height: 96,
      borderRadius: radius.lg,
      backgroundColor: c.surface.sunken,
    },

    card: {
      flexDirection: 'row', gap: spacing.md,
      padding: spacing.md,
      backgroundColor: c.surface.card,
      borderRadius: radius.lg,
      borderWidth: 1, borderColor: c.surface.hairline,
    },
    cardThumb: {
      width: 72, height: 72, borderRadius: radius.md,
      backgroundColor: c.surface.sunken,
      alignItems: 'center', justifyContent: 'center',
    },
    cardThumbEmoji: { fontSize: 26 },
    cardTitle: {
      fontSize: typography.fontSize.lg,
      fontFamily: typography.fontFamily.semibold,
      letterSpacing: typography.letterSpacing.snug,
      color: c.ink.strong,
    },
    cardMeta: { fontSize: typography.fontSize.sm, color: c.ink.muted },
    cardBadges: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2 },
    badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm },
    badgeOpen: { backgroundColor: c.state.openBg },
    badgeClosed: { backgroundColor: c.state.closedBg },
    badgeOpenText: {
      fontSize: typography.fontSize.xs,
      fontFamily: typography.fontFamily.semibold,
      color: c.state.openFg,
    },
    badgeClosedText: {
      fontSize: typography.fontSize.xs,
      fontFamily: typography.fontFamily.semibold,
      color: c.state.closedFg,
    },
    cardDist: { fontSize: typography.fontSize.xs, color: c.ink.muted },
    cardPrice: {
      fontSize: typography.fontSize.sm,
      fontFamily: typography.fontFamily.semibold,
      color: c.ink.strong,
      fontVariant: ['tabular-nums'],
    },

    stateBox: {
      marginHorizontal: spacing.gutter,
      padding: spacing.lg,
      alignItems: 'center', gap: spacing.sm,
      backgroundColor: c.surface.card,
      borderRadius: radius.lg,
      borderWidth: 1, borderColor: c.surface.hairline,
    },
    stateTitle: {
      fontSize: typography.fontSize.lg,
      fontFamily: typography.fontFamily.semibold,
      color: c.ink.strong,
      textAlign: 'center',
    },
    stateBody: {
      fontSize: typography.fontSize.sm,
      color: c.ink.muted,
      textAlign: 'center',
    },
    stateBtn: {
      marginTop: spacing.sm,
      minHeight: touch.minTarget,
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
      borderRadius: radius.md,
      backgroundColor: c.primary[500],
    },
    stateBtnText: {
      fontSize: typography.fontSize.base,
      fontFamily: typography.fontFamily.semibold,
      color: c.ink.onDark,
    },

    communityCard: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.md,
      marginHorizontal: spacing.gutter,
      padding: spacing.md,
      backgroundColor: c.surface.card,
      borderRadius: radius.lg,
      borderWidth: 1, borderColor: c.surface.hairline,
    },
    communityIcon: {
      width: 40, height: 40, borderRadius: radius.md,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: c.secondary[500],
    },
    communityTitle: {
      fontSize: typography.fontSize.md,
      fontFamily: typography.fontFamily.semibold,
      color: c.ink.strong,
    },
    communitySub: {
      marginTop: 2,
      fontSize: typography.fontSize.sm,
      color: c.ink.muted,
    },
  });
}
