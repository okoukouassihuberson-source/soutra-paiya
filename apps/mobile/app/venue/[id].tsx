import { useState, useEffect } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, radius, spacing, formatXOF } from '@soutra/shared';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { openDirections, dialPhone, openWhatsApp } from '@/lib/maps';
import { Gallery } from '@/components/venue/Gallery';
import { HoursCompact } from '@/components/venue/HoursCompact';

interface Venue {
  id: string;
  name: string;
  description: string;
  cover_url: string;
  gallery_urls: string[];
  address: string;
  city: string;
  phone: string;
  whatsapp: string | null;
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
  const { user } = useAuth();
  const [venue, setVenue] = useState<Venue | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favBusy, setFavBusy] = useState(false);
  // Coordonnées GPS lues depuis la RPC get_venue_location (migration 0019)
  // — la colonne PostGIS `location` ne se lit pas proprement via supabase-js.
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    loadVenue();
  }, [id]);

  useEffect(() => {
    if (!id || !user?.id) {
      setIsFavorite(false);
      return;
    }
    let active = true;
    (async () => {
      const { data } = await (supabase as any)
        .from('favorites')
        .select('venue_id')
        .eq('user_id', user.id)
        .eq('venue_id', id)
        .maybeSingle();
      if (active) setIsFavorite(!!data);
    })();
    return () => {
      active = false;
    };
  }, [id, user?.id]);

  const loadVenue = async () => {
    if (!id) {
      console.warn('[venue] no id provided');
      setLoading(false);
      return;
    }
    try {
      const [venueRes, coordsRes] = await Promise.all([
        supabase.from('venues').select('*').eq('id', id).maybeSingle(),
        (supabase as any).rpc('get_venue_location', { p_venue_id: id }),
      ]);

      if (venueRes.error) {
        console.error('[venue] supabase error:', venueRes.error);
        setVenue(null);
      } else {
        setVenue(venueRes.data as Venue | null);
      }

      const c = coordsRes?.data;
      if (c && typeof c.lat === 'number' && typeof c.lng === 'number') {
        setCoords({ lat: c.lat, lng: c.lng });
      } else {
        setCoords(null);
      }
    } catch (error) {
      console.error('[venue] unexpected error:', error);
      setVenue(null);
      setCoords(null);
    } finally {
      setLoading(false);
    }
  };

  const toggleFavorite = async () => {
    if (!user?.id || !id) {
      Alert.alert('Connexion requise', 'Connecte-toi pour gérer tes favoris.');
      return;
    }
    const sb = supabase as any;
    const next = !isFavorite;
    setFavBusy(true);
    setIsFavorite(next);
    try {
      if (next) {
        const { error } = await sb.from('favorites').insert({ user_id: user.id, venue_id: id });
        if (error) throw error;
      } else {
        const { error } = await sb
          .from('favorites')
          .delete()
          .eq('user_id', user.id)
          .eq('venue_id', id);
        if (error) throw error;
      }
    } catch {
      setIsFavorite(!next);
      Alert.alert('Erreur', 'Action sur les favoris impossible. Réessaie.');
    } finally {
      setFavBusy(false);
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
          <Pressable hitSlop={10} onPress={toggleFavorite} disabled={favBusy}>
            <Ionicons
              name={isFavorite ? 'heart' : 'heart-outline'}
              size={24}
              color={isFavorite ? colors.danger : colors.dark}
            />
          </Pressable>
        </View>

        {/* ════════ GALERIE PREMIUM ════════ */}
        {/* Hero photo principale + thumbs + lightbox plein écran avec swipe/zoom */}
        <Gallery cover={venue.cover_url} gallery={venue.gallery_urls} />

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

          {/* Actions rapides — itinéraire, appel, WhatsApp */}
          <View style={s.actionRow}>
            <Pressable
              style={({ pressed }) => [s.actionBtn, !coords && s.actionBtnDisabled, pressed && coords && { opacity: 0.85 }]}
              onPress={() => coords && openDirections({ lat: coords.lat, lng: coords.lng, label: venue.name })}
              disabled={!coords}
            >
              <Ionicons name="navigate" size={22} color={coords ? colors.primary[500] : colors.neutral[400]} />
              <Text style={[s.actionLabel, !coords && s.actionLabelDisabled]}>Itinéraire</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [s.actionBtn, !venue.phone && s.actionBtnDisabled, pressed && venue.phone && { opacity: 0.85 }]}
              onPress={() => venue.phone && dialPhone(venue.phone)}
              disabled={!venue.phone}
            >
              <Ionicons name="call" size={22} color={venue.phone ? colors.primary[500] : colors.neutral[400]} />
              <Text style={[s.actionLabel, !venue.phone && s.actionLabelDisabled]}>Appeler</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [s.actionBtn, !venue.whatsapp && s.actionBtnDisabled, pressed && venue.whatsapp && { opacity: 0.85 }]}
              onPress={() => venue.whatsapp && openWhatsApp(venue.whatsapp, `Bonjour, je vous contacte au sujet de ${venue.name} via Soutra-Playce.`)}
              disabled={!venue.whatsapp}
            >
              <Ionicons name="logo-whatsapp" size={22} color={venue.whatsapp ? '#25D366' : colors.neutral[400]} />
              <Text style={[s.actionLabel, !venue.whatsapp && s.actionLabelDisabled]}>WhatsApp</Text>
            </Pressable>
          </View>

          {/* ════════ HORAIRES COMPACTES ════════ */}
          {/* Statut ouvert/fermé en temps réel + horaire du jour + bouton "Voir tous" */}
          {venue.opening_hours && Object.keys(venue.opening_hours).length > 0 && (
            <View style={{ marginBottom: spacing.lg }}>
              <HoursCompact hours={venue.opening_hours} />
            </View>
          )}

          {/* Info Cards — l'adresse est cliquable et lance l'itinéraire */}
          <View style={s.infoGrid}>
            {venue.address && (
              <Pressable
                style={({ pressed }) => [s.infoCard, pressed && coords && { opacity: 0.7 }]}
                onPress={() => coords && openDirections({ lat: coords.lat, lng: coords.lng, label: venue.name })}
                disabled={!coords}
              >
                <Ionicons name="location" size={20} color={colors.primary[500]} />
                <Text style={s.infoText}>{venue.address}</Text>
                {coords && <Ionicons name="chevron-forward" size={18} color={colors.neutral[400]} />}
              </Pressable>
            )}
            {venue.phone && (
              <Pressable style={({ pressed }) => [s.infoCard, pressed && { opacity: 0.7 }]} onPress={() => dialPhone(venue.phone)}>
                <Ionicons name="call" size={20} color={colors.primary[500]} />
                <Text style={s.infoText}>{venue.phone}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.neutral[400]} />
              </Pressable>
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
  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    backgroundColor: colors.primary[50],
    borderRadius: radius.lg,
    gap: spacing.xs,
  },
  actionBtnDisabled: { backgroundColor: colors.neutral[100] },
  actionLabel: { fontSize: typography.fontSize.xs, fontWeight: '600', color: colors.primary[600] },
  actionLabelDisabled: { color: colors.neutral[400] },
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
