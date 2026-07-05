import { useMemo } from 'react';
import { View, Text, Pressable, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { typography, radius, spacing, formatVenuePriceLabel, type ColorPalette } from '@soutra/shared';
import { useColors } from '@/lib/theme';
import { openDirections } from '@/lib/maps';

/**
 * Fiche rapide flottante (style Google Maps) au tap sur un marqueur carte.
 *
 * Spec PO PR5 audit UX :
 *   "Au clic sur un établissement, afficher photo, nom, distance, note,
 *    horaires, bouton itinéraire SANS QUITTER LA CARTE."
 *
 * Le composant se place en absolute bottom-0 par-dessus la carte. Le bouton
 * "Voir la fiche" reste pour aller à l'écran venue complet, mais la fiche
 * rapide donne déjà toutes les infos critiques.
 */

export interface QuickVenue {
  id: string;
  name: string;
  category?: string | null;
  cover_url?: string | null;
  rating_avg?: number | null;
  rating_count?: number | null;
  distance_km?: number | null;
  avg_price_xof?: number | null;
  is_open_now?: boolean | null;
  lat?: number | null;
  lng?: number | null;
}

interface Props {
  venue: QuickVenue | null;
  onClose: () => void;
  onOpen: () => void;
}

export function QuickVenueSheet({ venue, onClose, onOpen }: Props) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  if (!venue) return null;

  const distanceLabel = formatDistance(venue.distance_km);
  const hasRating = venue.rating_avg != null && venue.rating_count != null && venue.rating_count > 0;

  return (
    <View style={s.wrap} pointerEvents="box-none">
      <View style={s.card}>
        {/* Handle + close */}
        <View style={s.headerRow}>
          <View style={s.handle} />
          <Pressable onPress={onClose} hitSlop={8} style={s.closeBtn}>
            <Ionicons name="close" size={18} color={c.neutral[600]} />
          </Pressable>
        </View>

        <View style={s.body}>
          {/* Photo */}
          <View style={s.photoBox}>
            {venue.cover_url ? (
              <Image source={{ uri: venue.cover_url }} style={s.photo} />
            ) : (
              <View style={[s.photo, s.photoPlaceholder]}>
                <Ionicons name="image-outline" size={28} color={c.neutral[400]} />
              </View>
            )}
            {venue.is_open_now != null && (
              <View
                style={[
                  s.statusPill,
                  { backgroundColor: venue.is_open_now ? '#dcfce7' : '#fee2e2' },
                ]}
              >
                <View
                  style={[
                    s.statusDot,
                    { backgroundColor: venue.is_open_now ? '#16a34a' : '#dc2626' },
                  ]}
                />
                <Text
                  style={[
                    s.statusText,
                    { color: venue.is_open_now ? '#15803d' : '#991b1b' },
                  ]}
                >
                  {venue.is_open_now ? 'Ouvert' : 'Fermé'}
                </Text>
              </View>
            )}
          </View>

          {/* Infos */}
          <View style={s.info}>
            <Text style={s.name} numberOfLines={1}>{venue.name}</Text>
            <View style={s.metaRow}>
              {hasRating && (
                <View style={s.metaCell}>
                  <Ionicons name="star" size={12} color="#f59e0b" />
                  <Text style={s.metaText}>
                    {venue.rating_avg!.toFixed(1)}{' '}
                    <Text style={s.metaTextLight}>({venue.rating_count})</Text>
                  </Text>
                </View>
              )}
              {distanceLabel && (
                <View style={s.metaCell}>
                  <Ionicons name="walk" size={12} color={c.primary[500]} />
                  <Text style={s.metaText}>{distanceLabel}</Text>
                </View>
              )}
              {(() => {
                const priceLabel = formatVenuePriceLabel({ avg_price_xof: venue.avg_price_xof, category: venue.category }).label;
                return priceLabel ? (
                  <View style={s.metaCell}>
                    <Ionicons name="cash-outline" size={12} color={c.neutral[500]} />
                    <Text style={s.metaText}>{priceLabel}</Text>
                  </View>
                ) : null;
              })()}
            </View>
            {venue.category && (
              <Text style={s.category}>{venue.category.replace(/_/g, ' ')}</Text>
            )}
          </View>
        </View>

        {/* Actions */}
        <View style={s.actions}>
          <Pressable
            onPress={() => {
              if (venue.lat != null && venue.lng != null) {
                openDirections({ lat: venue.lat, lng: venue.lng, label: venue.name });
              }
            }}
            disabled={venue.lat == null || venue.lng == null}
            style={({ pressed }) => [
              s.actionBtnSecondary,
              (venue.lat == null || venue.lng == null) && { opacity: 0.4 },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Ionicons name="navigate" size={16} color={c.primary[600]} />
            <Text style={s.actionBtnSecondaryText}>Itinéraire</Text>
          </Pressable>
          <Pressable
            onPress={onOpen}
            style={({ pressed }) => [s.actionBtnPrimary, pressed && { opacity: 0.9 }]}
          >
            <Text style={s.actionBtnPrimaryText}>Voir la fiche</Text>
            <Ionicons name="arrow-forward" size={16} color="#fff" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function formatDistance(km?: number | null): string | null {
  if (km == null) return null;
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    wrap: {
      position: 'absolute',
      left: 0, right: 0, bottom: 0,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.lg,
    },
    card: {
      backgroundColor: '#fff',
      borderRadius: radius.xl,
      padding: spacing.md,
      ...{
        shadowColor: '#000',
        shadowOpacity: 0.18,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: -6 },
        elevation: 12,
      },
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs },
    handle: {
      flex: 1,
      height: 4,
      backgroundColor: c.neutral[300],
      borderRadius: 2,
      maxWidth: 44,
      alignSelf: 'center',
      marginLeft: 'auto',
      marginRight: 'auto',
    },
    closeBtn: {
      position: 'absolute',
      right: 0,
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: c.neutral[100],
      alignItems: 'center',
      justifyContent: 'center',
    },

    body: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
    photoBox: { position: 'relative' },
    photo: { width: 84, height: 84, borderRadius: radius.md, backgroundColor: c.neutral[100] },
    photoPlaceholder: { alignItems: 'center', justifyContent: 'center' },
    statusPill: {
      position: 'absolute',
      bottom: 4,
      left: 4,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: radius.full,
    },
    statusDot: { width: 5, height: 5, borderRadius: 2.5 },
    statusText: { fontSize: 9, fontWeight: '800' },

    info: { flex: 1, justifyContent: 'center', gap: 4 },
    name: { fontSize: typography.fontSize.base, fontWeight: '800', color: c.dark },
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 2 },
    metaCell: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    metaText: { fontSize: 11, color: c.dark, fontWeight: '700' },
    metaTextLight: { color: c.neutral[500], fontWeight: '500' },
    category: {
      fontSize: 10,
      color: c.primary[600],
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginTop: 2,
    },

    actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
    actionBtnSecondary: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: spacing.sm,
      borderRadius: radius.lg,
      borderWidth: 1.5,
      borderColor: c.primary[200],
      backgroundColor: c.primary[50],
    },
    actionBtnSecondaryText: { fontSize: typography.fontSize.sm, fontWeight: '700', color: c.primary[700] },
    actionBtnPrimary: {
      flex: 1.4,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: spacing.sm,
      borderRadius: radius.lg,
      backgroundColor: c.primary[500],
    },
    actionBtnPrimaryText: { fontSize: typography.fontSize.sm, fontWeight: '800', color: '#fff' },
  });
}
