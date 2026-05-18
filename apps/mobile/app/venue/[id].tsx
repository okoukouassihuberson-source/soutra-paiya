import { useState, useEffect } from 'react';
import { ScrollView, View, Text, Pressable, Image, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, radius, spacing, formatXOF } from '@soutra/shared';
import { supabase } from '@/lib/supabase';

interface Venue {
  id: string;
  name: string;
  description: string;
  cover_url: string;
  gallery_urls: string[];
  address: string;
  city: string;
  phone: string;
  email: string;
  opening_hours: Record<string, [string, string]>;
  avg_price_xof: number;
  amenities: string[];
  rating_avg: number;
  rating_count: number;
}

export default function VenueDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [venue, setVenue] = useState<Venue | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadVenue();
  }, [id]);

  const loadVenue = async () => {
    if (!id) {
      console.warn('[venue] no id provided');
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('venues')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) {
        console.error('[venue] supabase error:', error);
        setVenue(null);
      } else {
        setVenue(data as Venue | null);
      }
    } catch (error) {
      console.error('[venue] unexpected error:', error);
      setVenue(null);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <ActivityIndicator size="large" color={colors.primary[500]} style={s.center} />
      </SafeAreaView>
    );
  }

  if (!venue) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}>
          <Text style={s.errorText}>Lieu non trouvé</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing['2xl'] }}>
        {/* Header with back button */}
        <View style={s.headerBar}>
          <Pressable hitSlop={10} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={28} color={colors.dark} />
          </Pressable>
          <Pressable
            hitSlop={10}
            onPress={() => Alert.alert('Favoris', 'Bientôt disponible : ajoute ce lieu à tes favoris.')}
          >
            <Ionicons name="heart-outline" size={24} color={colors.dark} />
          </Pressable>
        </View>

        {/* Hero Image */}
        {venue.cover_url && (
          <Image source={{ uri: venue.cover_url }} style={s.heroImg} />
        )}

        {/* Content */}
        <View style={s.content}>
          {/* Name and Rating */}
          <View style={s.titleBar}>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>{venue.name}</Text>
              <View style={s.ratingRow}>
                <Text style={s.rating}>★ {venue.rating_avg}</Text>
                <Text style={s.ratingCount}>({venue.rating_count} avis)</Text>
              </View>
            </View>
            <Text style={s.price}>{formatXOF(venue.avg_price_xof ?? 0)}/pers</Text>
          </View>

          {/* Description */}
          {venue.description && (
            <Text style={s.description}>{venue.description}</Text>
          )}

          {/* Info Cards */}
          <View style={s.infoGrid}>
            {venue.address && (
              <View style={s.infoCard}>
                <Ionicons name="location" size={20} color={colors.primary[500]} />
                <Text style={s.infoText}>{venue.address}</Text>
              </View>
            )}
            {venue.phone && (
              <View style={s.infoCard}>
                <Ionicons name="call" size={20} color={colors.primary[500]} />
                <Text style={s.infoText}>{venue.phone}</Text>
              </View>
            )}
            {venue.email && (
              <View style={s.infoCard}>
                <Ionicons name="mail" size={20} color={colors.primary[500]} />
                <Text style={s.infoText}>{venue.email}</Text>
              </View>
            )}
          </View>

          {/* Amenities */}
          {venue.amenities && venue.amenities.length > 0 && (
            <>
              <Text style={s.sectionTitle}>Équipements</Text>
              <View style={s.amenitiesGrid}>
                {venue.amenities.map((amenity, idx) => (
                  <View key={idx} style={s.amenityTag}>
                    <Text style={s.amenityText}>{amenity}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* Opening Hours */}
          {venue.opening_hours && Object.keys(venue.opening_hours).length > 0 && (
            <>
              <Text style={s.sectionTitle}>Horaires</Text>
              <View>
                {Object.entries(venue.opening_hours).map(([day, [open, close]]) => (
                  <View key={day} style={s.hourRow}>
                    <Text style={s.dayText}>{day.charAt(0).toUpperCase() + day.slice(1)}</Text>
                    <Text style={s.timeText}>{open} - {close}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* Gallery */}
          {venue.gallery_urls && venue.gallery_urls.length > 0 && (
            <>
              <Text style={s.sectionTitle}>Galerie</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.galleryRow}
              >
                {venue.gallery_urls.map((url, idx) => (
                  <Image key={idx} source={{ uri: url }} style={s.galleryImg} />
                ))}
              </ScrollView>
            </>
          )}
        </View>
      </ScrollView>

      {/* Floating CTA */}
      <View style={s.cta}>
        <Pressable
          style={({ pressed }) => [s.ctaButton, pressed && { opacity: 0.85 }]}
          onPress={() =>
            router.push({
              pathname: '/reservation/[venueId]',
              params: { venueId: venue.id },
            })
          }
        >
          <Text style={s.ctaText}>Réserver une table</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.light },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.base,
  },
  heroImg: { width: '100%', height: 280 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  titleBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  title: { fontSize: typography.fontSize['2xl'], fontWeight: '700', color: colors.dark },
  ratingRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm, gap: spacing.sm },
  rating: { fontSize: typography.fontSize.lg, color: colors.warning, fontWeight: '600' },
  ratingCount: { fontSize: typography.fontSize.sm, color: colors.neutral[500] },
  price: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.primary[500] },
  description: { fontSize: typography.fontSize.sm, color: colors.neutral[600], lineHeight: 20, marginBottom: spacing.lg },
  infoGrid: { marginBottom: spacing.lg, gap: spacing.md },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  infoText: { flex: 1, fontSize: typography.fontSize.sm, color: colors.neutral[700] },
  sectionTitle: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.dark, marginBottom: spacing.md, marginTop: spacing.lg },
  amenitiesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  amenityTag: { backgroundColor: colors.neutral[100], borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  amenityText: { fontSize: typography.fontSize.sm, color: colors.neutral[700] },
  hourRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.neutral[200] },
  dayText: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.dark, flex: 1 },
  timeText: { fontSize: typography.fontSize.sm, color: colors.neutral[600] },
  galleryRow: { gap: spacing.md, paddingBottom: spacing.lg },
  galleryImg: { width: 160, height: 160, borderRadius: radius.lg },
  cta: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: spacing.lg, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: colors.neutral[200] },
  ctaButton: { backgroundColor: colors.primary[500], borderRadius: radius.lg, paddingVertical: spacing.lg, alignItems: 'center' },
  ctaText: { fontSize: typography.fontSize.base, fontWeight: '700', color: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: typography.fontSize.base, color: colors.neutral[600] },
});
