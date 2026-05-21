import { useEffect, useState } from 'react';
import { ScrollView, View, Text, TextInput, StyleSheet, Pressable, Image, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { colors, typography, radius, spacing, formatXOF } from '@soutra/shared';
import { supabase } from '@/lib/supabase';
import { MapboxMap, type MapVenue, ABIDJAN } from '@/components/MapboxMap';

// Aligné sur la vue `venues_public` (migration 0020). `lat`/`lng` proviennent
// du point PostGIS `venues.location` projeté en colonnes simples.
// `distance_km`/`is_open_now` sont remplis uniquement en mode « près de moi »
// (RPC `search_venues_nearby`, migration 0021).
interface Venue {
  id: string;
  name: string;
  slug: string;
  category: string;
  cover_url: string | null;
  avg_price_xof: number | null;
  rating_avg: number | null;
  rating_count: number | null;
  district: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  distance_km?: number;
  is_open_now?: boolean | null;
}

const RADII_KM: { label: string; v: number }[] = [
  { label: '2 km', v: 2 },
  { label: '5 km', v: 5 },
  { label: '10 km', v: 10 },
  { label: '25 km', v: 25 },
];

const CHIPS: { label: string; category: string | null }[] = [
  { label: 'Tout', category: null },
  { label: 'Maquis', category: 'maquis' },
  { label: 'Restaurants', category: 'restaurant' },
  { label: 'Soirée', category: 'club' },
  { label: 'Cafés', category: 'cafe' },
  { label: 'Hôtels', category: 'hotel' },
  { label: 'Sport', category: 'sport' },
];

export default function Explore() {
  const router = useRouter();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedChip, setSelectedChip] = useState<string>('Tout');
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Mode « près de moi » : on demande la position et on switch sur la RPC
  // search_venues_nearby qui ajoute distance + is_open_now et trie.
  const [nearMe, setNearMe] = useState(false);
  const [nearMeLoading, setNearMeLoading] = useState(false);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [radiusKm, setRadiusKm] = useState<number>(5);
  const [openNow, setOpenNow] = useState(false);

  useEffect(() => {
    loadVenues();
  }, []);

  // Si « près de moi » est actif ou si les filtres changent, on recharge.
  useEffect(() => {
    if (nearMe && userPos) {
      loadNearby(userPos.lat, userPos.lng, radiusKm, openNow);
    } else if (!nearMe) {
      loadVenues();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nearMe, radiusKm, openNow, userPos]);

  async function loadVenues() {
    try {
      // Vue `venues_public` : filtrée à status=active, lat/lng projetés
      // depuis le point PostGIS. Source de vérité unique pour la carte.
      const { data, error } = await supabase
        .from('venues_public')
        .select('id, name, slug, category, cover_url, avg_price_xof, rating_avg, rating_count, district, city, lat, lng')
        .order('rating_avg', { ascending: false });

      if (error) {
        console.error('[explore] load venues error:', error);
        Alert.alert('Erreur', 'Impossible de charger les lieux. Vérifiez votre connexion.');
        setVenues([]);
      } else {
        setVenues((data ?? []) as Venue[]);
      }
    } catch (err) {
      console.error('[explore] unexpected error:', err);
      setVenues([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  // Recherche géographique côté serveur (PostGIS ST_DWithin via RPC).
  async function loadNearby(lat: number, lng: number, radius: number, openOnly: boolean) {
    setNearMeLoading(true);
    const { data, error } = await (supabase as any).rpc('search_venues_nearby', {
      p_lat: lat,
      p_lng: lng,
      p_radius_km: radius,
      p_category: null,
      p_open_now: openOnly,
    });
    setNearMeLoading(false);
    if (error) {
      console.error('[explore] nearby RPC error:', error);
      Alert.alert('Erreur', error.message || 'Recherche par proximité indisponible.');
      return;
    }
    setVenues((data || []) as Venue[]);
  }

  async function toggleNearMe() {
    if (nearMe) {
      // On désactive : retour à la liste classique.
      setNearMe(false);
      return;
    }
    // On active : demande de permission, puis position GPS.
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Localisation refusée',
        'Active la localisation dans les réglages du téléphone pour utiliser « Près de moi ».'
      );
      return;
    }
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setNearMe(true);
    } catch (err) {
      console.error('[explore] getCurrentPosition error:', err);
      Alert.alert('Localisation', 'Impossible d\'obtenir ta position. Réessaie en extérieur.');
    }
  }

  const selectedCategory = CHIPS.find((c) => c.label === selectedChip)?.category;
  const filteredVenues = venues.filter((v) => {
    if (selectedCategory && v.category !== selectedCategory) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return v.name.toLowerCase().includes(q) || (v.district ?? '').toLowerCase().includes(q);
    }
    return true;
  });

  // Seuls les venues avec coordonnées valides apparaissent sur la carte.
  // Les autres restent dans la liste en bas (le pro doit aller poser son pin
  // depuis le dashboard PRO -> Paramètres -> Localisation GPS).
  const mapVenues: MapVenue[] = filteredVenues
    .filter((v) => typeof v.lat === 'number' && typeof v.lng === 'number')
    .map((v) => ({
      id: v.id,
      name: v.name,
      category: v.category,
      price: v.avg_price_xof ?? 0,
      coordinate: [v.lng as number, v.lat as number],
    }));

  function goToVenue(id: string) {
    setSelectedVenueId(id);
    router.push({ pathname: '/venue/[id]', params: { id } });
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing['2xl'] }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadVenues();
            }}
          />
        }
      >
        <View style={s.header}>
          <View>
            <Text style={s.locLabel}>Position actuelle</Text>
            <Text style={s.loc}>📍 Cocody, Abidjan</Text>
          </View>
          <Pressable
            hitSlop={10}
            onPress={() => Alert.alert('Notifications', 'Aucune nouvelle notification.')}
          >
            <Ionicons name="notifications-outline" size={24} color={colors.dark} />
          </Pressable>
        </View>

        <View style={s.searchBox}>
          <Ionicons name="search" size={18} color={colors.neutral[500]} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Rechercher un lieu, un quartier…"
            placeholderTextColor={colors.neutral[500]}
            style={s.searchInput}
            returnKeyType="search"
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipsRow}>
          {CHIPS.map((c) => (
            <Pressable
              key={c.label}
              onPress={() => setSelectedChip(c.label)}
              style={[s.chip, selectedChip === c.label && s.chipActive]}
            >
              <Text style={[s.chipText, selectedChip === c.label && s.chipTextActive]}>
                {c.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Filtres géographiques */}
        <View style={s.geoRow}>
          <Pressable onPress={toggleNearMe} style={[s.geoBtn, nearMe && s.geoBtnActive]}>
            <Ionicons name={nearMe ? 'navigate' : 'navigate-outline'} size={14} color={nearMe ? '#fff' : colors.primary[600]} />
            <Text style={[s.geoBtnText, nearMe && s.geoBtnTextActive]}>
              {nearMe ? `Près de moi (${radiusKm} km)` : 'Près de moi'}
            </Text>
          </Pressable>
          <Pressable onPress={() => setOpenNow((v) => !v)} style={[s.geoBtn, openNow && s.geoBtnActive]}>
            <Ionicons name="time-outline" size={14} color={openNow ? '#fff' : colors.primary[600]} />
            <Text style={[s.geoBtnText, openNow && s.geoBtnTextActive]}>Ouvert maintenant</Text>
          </Pressable>
        </View>

        {nearMe && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.radiiRow}>
            {RADII_KM.map((r) => (
              <Pressable
                key={r.v}
                onPress={() => setRadiusKm(r.v)}
                style={[s.radiusPill, radiusKm === r.v && s.radiusPillActive]}
              >
                <Text style={[s.radiusPillText, radiusKm === r.v && s.radiusPillTextActive]}>{r.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        <MapboxMap
          venues={mapVenues}
          center={ABIDJAN}
          zoom={11.5}
          onMarkerPress={(v) => goToVenue(v.id)}
        />

        {loading ? (
          <ActivityIndicator size="large" color={colors.primary[500]} style={{ marginTop: spacing['2xl'] }} />
        ) : (
          <>
            <Text style={s.sectionTitle}>
              {filteredVenues.length} {filteredVenues.length > 1 ? 'lieux' : 'lieu'}
              {selectedCategory ? ` · ${selectedChip}` : ''}
              {mapVenues.length < filteredVenues.length && (
                <Text style={s.sectionHint}> · {mapVenues.length} sur la carte</Text>
              )}
            </Text>

            {filteredVenues.length === 0 ? (
              <View style={s.empty}>
                <Ionicons name="search-outline" size={48} color={colors.neutral[300]} />
                <Text style={s.emptyText}>Aucun lieu trouvé pour ces critères</Text>
              </View>
            ) : (
              filteredVenues.map((v) => (
                <Pressable
                  key={v.id}
                  style={({ pressed }) => [
                    s.card,
                    pressed && { opacity: 0.85 },
                    selectedVenueId === v.id && s.cardSelected,
                  ]}
                  onPress={() => goToVenue(v.id)}
                >
                  {v.cover_url && (
                    <Image source={{ uri: v.cover_url }} style={s.cardImg} />
                  )}
                  <View style={{ flex: 1, padding: spacing.md }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={s.cardName}>{v.name}</Text>
                      <Text style={s.rating}>★ {v.rating_avg?.toFixed(1) ?? '–'}</Text>
                    </View>
                    <Text style={s.cardCat}>
                      {labelForCategory(v.category)} · {v.district ?? v.city ?? 'Abidjan'}
                    </Text>
                    <View style={s.cardMetaRow}>
                      <Text style={s.cardPrice}>~ {formatXOF(v.avg_price_xof ?? 0)}/pers</Text>
                      {typeof v.distance_km === 'number' && (
                        <Text style={s.cardDistance}>📍 {v.distance_km < 1 ? `${Math.round(v.distance_km * 1000)} m` : `${v.distance_km.toFixed(1)} km`}</Text>
                      )}
                      {v.is_open_now === true && (
                        <Text style={s.openNowBadge}>Ouvert</Text>
                      )}
                      {v.is_open_now === false && (
                        <Text style={s.closedBadge}>Fermé</Text>
                      )}
                    </View>
                  </View>
                </Pressable>
              ))
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function labelForCategory(c: string): string {
  switch (c) {
    case 'maquis': return 'Maquis';
    case 'restaurant': return 'Restaurant';
    case 'club': return 'Club';
    case 'cafe': return 'Café';
    case 'hotel': return 'Hôtel';
    case 'sport': return 'Sport';
    case 'event_space': return 'Espace événementiel';
    default: return c;
  }
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.light },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg },
  locLabel: { fontSize: typography.fontSize.xs, color: colors.neutral[500] },
  loc: { fontSize: typography.fontSize.base, fontWeight: '600', color: colors.dark },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginHorizontal: spacing.lg, paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    backgroundColor: '#fff', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.neutral[200],
  },
  searchInput: { flex: 1, fontSize: typography.fontSize.sm, color: colors.dark },
  chipsRow: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm },
  chip: { paddingHorizontal: spacing.base, paddingVertical: spacing.sm, backgroundColor: colors.neutral[100], borderRadius: radius.full, marginRight: spacing.sm },
  chipActive: { backgroundColor: colors.primary[500] },
  chipText: { fontSize: typography.fontSize.sm, color: colors.neutral[600], fontWeight: '500' },
  chipTextActive: { color: '#fff' },
  geoRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  geoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    paddingHorizontal: spacing.base, paddingVertical: spacing.sm,
    backgroundColor: colors.primary[50], borderRadius: radius.full,
  },
  geoBtnActive: { backgroundColor: colors.primary[500] },
  geoBtnText: { fontSize: typography.fontSize.xs, fontWeight: '600', color: colors.primary[600] },
  geoBtnTextActive: { color: '#fff' },
  radiiRow: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm },
  radiusPill: {
    paddingHorizontal: spacing.base, paddingVertical: spacing.xs,
    backgroundColor: '#fff', borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.neutral[200], marginRight: spacing.sm,
  },
  radiusPillActive: { backgroundColor: colors.dark, borderColor: colors.dark },
  radiusPillText: { fontSize: typography.fontSize.xs, color: colors.neutral[700], fontWeight: '600' },
  radiusPillTextActive: { color: '#fff' },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm, flexWrap: 'wrap' },
  cardDistance: { fontSize: typography.fontSize.xs, color: colors.neutral[600], fontWeight: '600' },
  openNowBadge: { fontSize: typography.fontSize.xs, fontWeight: '700', color: colors.success, backgroundColor: '#dcfce7', paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full },
  closedBadge: { fontSize: typography.fontSize.xs, fontWeight: '700', color: colors.danger, backgroundColor: '#fee2e2', paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full },
  sectionTitle: { marginHorizontal: spacing.lg, marginTop: spacing.sm, marginBottom: spacing.md, fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.dark },
  sectionHint: { fontSize: typography.fontSize.xs, fontWeight: '500', color: colors.neutral[500] },
  empty: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyText: { marginTop: spacing.base, fontSize: typography.fontSize.sm, color: colors.neutral[500] },
  card: {
    marginHorizontal: spacing.lg, marginBottom: spacing.md,
    backgroundColor: '#fff', borderRadius: radius.lg, overflow: 'hidden',
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  cardSelected: { borderWidth: 2, borderColor: colors.primary[500] },
  cardImg: { width: '100%', height: 160, backgroundColor: colors.neutral[200] },
  cardName: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.dark, flex: 1, marginRight: spacing.sm },
  rating: { color: colors.warning, fontWeight: '600' },
  cardCat: { marginTop: 2, fontSize: typography.fontSize.sm, color: colors.neutral[500] },
  cardPrice: { marginTop: spacing.sm, fontSize: typography.fontSize.sm, color: colors.secondary[500], fontWeight: '600' },
});
