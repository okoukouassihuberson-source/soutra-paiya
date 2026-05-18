import { useState } from 'react';
import { ScrollView, View, Text, TextInput, StyleSheet, Pressable, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, radius, spacing, formatXOF } from '@soutra/shared';
import { MapboxMap, type MapVenue, ABIDJAN } from '@/components/MapboxMap';

// Mock data — venues avec coordonnées réelles d'Abidjan
const MOCK: Array<MapVenue & { rating: number; dist: string; img: string }> = [
  { id: '1', name: 'Le Mékaféba',       category: 'maquis',     price: 8000,  rating: 4.7, dist: '800 m', coordinate: [-3.999, 5.359], img: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600' },
  { id: '2', name: 'Saka Saka',         category: 'restaurant', price: 12000, rating: 4.5, dist: '1.2 km', coordinate: [-3.991, 5.371], img: 'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=600' },
  { id: '3', name: 'VIP Lounge',        category: 'club',       price: 25000, rating: 4.9, dist: '2 km',  coordinate: [-3.999, 5.298], img: 'https://images.unsplash.com/photo-1566737236500-c8ac43014a67?w=600' },
  { id: '4', name: 'Chez Tantie Adjoua',category: 'maquis',     price: 3500,  rating: 4.4, dist: '5 km',  coordinate: [-4.090, 5.337], img: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600' },
  { id: '5', name: 'Le Plateau Café',   category: 'cafe',       price: 6000,  rating: 4.3, dist: '3.5 km',coordinate: [-4.024, 5.323], img: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=600' },
];

const CHIPS = ['Tout', 'Maquis', 'Restaurants', 'Soirée', 'Hôtels', 'Sport'];

export default function Explore() {
  const [selectedChip, setSelectedChip] = useState('Tout');
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);

  const filteredVenues = selectedChip === 'Tout'
    ? MOCK
    : MOCK.filter((v) => {
        if (selectedChip === 'Maquis') return v.category === 'maquis';
        if (selectedChip === 'Restaurants') return v.category === 'restaurant';
        if (selectedChip === 'Soirée') return v.category === 'club';
        return true;
      });

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing['2xl'] }}>
        <View style={s.header}>
          <View>
            <Text style={s.locLabel}>Position actuelle</Text>
            <Text style={s.loc}>📍 Cocody, Abidjan</Text>
          </View>
          <Pressable hitSlop={10}><Ionicons name="notifications-outline" size={24} color={colors.dark} /></Pressable>
        </View>

        <View style={s.searchBox}>
          <Ionicons name="search" size={18} color={colors.neutral[500]} />
          <TextInput
            placeholder="« Sortie avec 15 000 FCFA ce soir »"
            placeholderTextColor={colors.neutral[500]}
            style={s.searchInput}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipsRow}>
          {CHIPS.map((c) => (
            <Pressable key={c} onPress={() => setSelectedChip(c)} style={[s.chip, selectedChip === c && s.chipActive]}>
              <Text style={[s.chipText, selectedChip === c && s.chipTextActive]}>{c}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <MapboxMap
          venues={filteredVenues}
          center={ABIDJAN}
          zoom={11.5}
          onMarkerPress={(v) => setSelectedVenueId(v.id)}
        />

        <Text style={s.sectionTitle}>
          {filteredVenues.length} {filteredVenues.length > 1 ? 'lieux' : 'lieu'} près de toi
        </Text>

        {filteredVenues.map((v) => (
          <Pressable
            key={v.id}
            style={({ pressed }) => [s.card, pressed && { opacity: 0.9 }, selectedVenueId === v.id && s.cardSelected]}
            onPress={() => setSelectedVenueId(v.id)}
          >
            <Image source={{ uri: v.img }} style={s.cardImg} />
            <View style={{ flex: 1, padding: spacing.md }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={s.cardName}>{v.name}</Text>
                <Text style={s.rating}>★ {v.rating}</Text>
              </View>
              <Text style={s.cardCat}>
                {v.category === 'maquis' ? 'Maquis' : v.category === 'restaurant' ? 'Restaurant' : v.category === 'club' ? 'Club' : v.category === 'cafe' ? 'Café' : 'Lieu'} · {v.dist}
              </Text>
              <Text style={s.cardPrice}>~ {formatXOF(v.price ?? 0)}/pers</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
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
  sectionTitle: { marginHorizontal: spacing.lg, marginTop: spacing.sm, marginBottom: spacing.md, fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.dark },
  card: {
    marginHorizontal: spacing.lg, marginBottom: spacing.md,
    backgroundColor: '#fff', borderRadius: radius.lg, overflow: 'hidden',
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  cardSelected: { borderWidth: 2, borderColor: colors.primary[500] },
  cardImg: { width: '100%', height: 160 },
  cardName: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.dark },
  rating: { color: colors.warning, fontWeight: '600' },
  cardCat: { marginTop: 2, fontSize: typography.fontSize.sm, color: colors.neutral[500] },
  cardPrice: { marginTop: spacing.sm, fontSize: typography.fontSize.sm, color: colors.secondary[500], fontWeight: '600' },
});
