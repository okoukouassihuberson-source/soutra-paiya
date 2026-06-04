// ============================================================================
// SiaVenueCard — card premium d'un venue rendu inline dans la conversation Sia.
//
// Affiche :
//   • Image cover (fallback emoji catégorie)
//   • Nom + catégorie + district/city
//   • Badges (Ouvert, Top noté, Étape N, etc.)
//   • Meta : distance, prix, rating
//   • 3 boutons d'action : Voir, Itinéraire, Favori (toggle)
//
// Rendu pensé "concierge premium" : ombres douces, coins arrondis, hiérarchie
// claire — inspirations Airbnb / Booking / Apple Maps.
// ============================================================================
import { useMemo, useState, useCallback, useEffect } from 'react';
import { View, Text, Pressable, Image, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  typography, radius, spacing, formatXOF, categoryEmoji,
  type ColorPalette,
} from '@soutra/shared';
import { useColors } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { openDirections } from '@/lib/maps';
import type { VenueCard } from '@/lib/assistant';

interface Props {
  card: VenueCard;
}

const TONE_MAP: Record<NonNullable<VenueCard['badges']>[number]['tone'], { bg: string; fg: string }> = {
  primary: { bg: '#FFEDD5', fg: '#9A3412' },
  success: { bg: '#D1FAE5', fg: '#065F46' },
  amber:   { bg: '#FEF3C7', fg: '#92400E' },
  danger:  { bg: '#FEE2E2', fg: '#B91C1C' },
};

export function SiaVenueCard({ card }: Props) {
  const router = useRouter();
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const { user } = useAuth();
  const [isFav, setIsFav] = useState(false);
  const [favBusy, setFavBusy] = useState(false);

  // Lecture initiale de l'état favori
  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    (async () => {
      const { data } = await supabase
        .from('favorites')
        .select('venue_id')
        .eq('user_id', user.id)
        .eq('venue_id', card.venue_id)
        .maybeSingle();
      if (active && data) setIsFav(true);
    })();
    return () => { active = false; };
  }, [card.venue_id, user?.id]);

  const handleOpen = useCallback(() => {
    router.push(`/venue/${card.venue_id}` as any);
  }, [card.venue_id, router]);

  const handleDirections = useCallback(async () => {
    try {
      // Récupère la position du venue
      const { data } = await (supabase.rpc as any)('get_venue_location', { p_venue_id: card.venue_id });
      const loc = Array.isArray(data) ? data[0] : data;
      if (loc?.lat && loc?.lng) {
        await openDirections({ lat: loc.lat, lng: loc.lng, label: card.name });
      } else {
        Alert.alert('Itinéraire indisponible', 'Position GPS du lieu manquante.');
      }
    } catch {
      Alert.alert('Itinéraire indisponible', "Impossible de récupérer la position du lieu.");
    }
  }, [card.venue_id, card.name]);

  const handleFavorite = useCallback(async () => {
    if (!user?.id || favBusy) return;
    setFavBusy(true);
    try {
      if (isFav) {
        await (supabase.from('favorites') as any)
          .delete()
          .eq('user_id', user.id)
          .eq('venue_id', card.venue_id);
        setIsFav(false);
      } else {
        await (supabase.from('favorites') as any)
          .insert({ user_id: user.id, venue_id: card.venue_id });
        setIsFav(true);
      }
    } catch (err) {
      console.warn('[sia-card] favorite toggle:', err);
    } finally {
      setFavBusy(false);
    }
  }, [card.venue_id, isFav, favBusy, user?.id]);

  const emoji = useMemo(() => categoryEmoji(card.category ?? null), [card.category]);

  return (
    <View style={s.card}>
      {/* Image cover ou emoji fallback */}
      <Pressable onPress={handleOpen} style={s.coverWrap}>
        {card.cover_url ? (
          <Image source={{ uri: card.cover_url }} style={s.cover} />
        ) : (
          <View style={[s.cover, s.coverFallback]}>
            <Text style={s.coverEmoji}>{emoji}</Text>
          </View>
        )}
        {/* Badges flottants top-left */}
        {(card.badges?.length ?? 0) > 0 && (
          <View style={s.badgeRow}>
            {card.badges!.map((b, i) => {
              const tone = TONE_MAP[b.tone];
              return (
                <View key={i} style={[s.badge, { backgroundColor: tone.bg }]}>
                  <Text style={[s.badgeText, { color: tone.fg }]}>{b.label}</Text>
                </View>
              );
            })}
          </View>
        )}
        {/* Bouton favori flottant top-right */}
        <Pressable onPress={handleFavorite} hitSlop={8} style={s.favBtn}>
          <Ionicons
            name={isFav ? 'heart' : 'heart-outline'}
            size={18}
            color={isFav ? c.danger : '#fff'}
          />
        </Pressable>
      </Pressable>

      {/* Body */}
      <View style={s.body}>
        <Text style={s.name} numberOfLines={1}>{card.name}</Text>
        <Text style={s.location} numberOfLines={1}>
          {emoji} {card.category ?? '—'}
          {card.district ? ` · ${card.district}` : card.city ? ` · ${card.city}` : ''}
        </Text>

        <View style={s.metaRow}>
          {card.distance_km != null && (
            <View style={s.metaItem}>
              <Ionicons name="navigate-outline" size={12} color={c.neutral[500]} />
              <Text style={s.metaText}>
                {card.distance_km < 1
                  ? `${Math.round(card.distance_km * 1000)} m`
                  : `${card.distance_km.toFixed(1)} km`}
              </Text>
            </View>
          )}
          {card.avg_price_xof != null && (
            <View style={s.metaItem}>
              <Ionicons name="cash-outline" size={12} color={c.neutral[500]} />
              <Text style={s.metaText}>{formatXOF(card.avg_price_xof)}</Text>
            </View>
          )}
          {card.rating_avg != null && card.rating_avg > 0 && (
            <View style={s.metaItem}>
              <Ionicons name="star" size={12} color="#F59E0B" />
              <Text style={s.metaText}>
                {card.rating_avg.toFixed(1)}
                {card.rating_count ? ` (${card.rating_count})` : ''}
              </Text>
            </View>
          )}
        </View>

        {/* Boutons d'action */}
        <View style={s.actions}>
          <Pressable
            onPress={handleOpen}
            style={({ pressed }) => [s.btnPrimary, pressed && { opacity: 0.85 }]}
          >
            <Ionicons name="eye-outline" size={14} color="#fff" />
            <Text style={s.btnPrimaryText}>Voir</Text>
          </Pressable>
          <Pressable
            onPress={handleDirections}
            style={({ pressed }) => [s.btnGhost, pressed && { opacity: 0.85 }]}
          >
            <Ionicons name="navigate-outline" size={14} color={c.primary[700]} />
            <Text style={s.btnGhostText}>Itinéraire</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    card: {
      backgroundColor: c.light,
      borderRadius: radius.lg,
      borderWidth: 1, borderColor: c.neutral[200],
      marginBottom: spacing.sm,
      overflow: 'hidden',
      shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
    },
    coverWrap: { position: 'relative' },
    cover: { width: '100%', height: 140 },
    coverFallback: {
      backgroundColor: c.primary[50],
      alignItems: 'center', justifyContent: 'center',
    },
    coverEmoji: { fontSize: 48 },
    badgeRow: {
      position: 'absolute', top: spacing.sm, left: spacing.sm,
      flexDirection: 'row', gap: 4, flexWrap: 'wrap', maxWidth: '70%',
    },
    badge: {
      paddingHorizontal: spacing.sm, paddingVertical: 3,
      borderRadius: radius.full,
    },
    badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.2 },
    favBtn: {
      position: 'absolute', top: spacing.sm, right: spacing.sm,
      width: 32, height: 32, borderRadius: 16,
      backgroundColor: 'rgba(0,0,0,0.4)',
      alignItems: 'center', justifyContent: 'center',
    },
    body: { padding: spacing.md, gap: 4 },
    name: { fontSize: typography.fontSize.base, fontWeight: '800', color: c.dark },
    location: { fontSize: typography.fontSize.xs, color: c.neutral[600] },
    metaRow: {
      flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm,
      marginTop: 4,
    },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    metaText: { fontSize: 11, color: c.neutral[700], fontWeight: '600' },
    actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
    btnPrimary: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 4, paddingVertical: 9, borderRadius: radius.full,
      backgroundColor: c.primary[500],
    },
    btnPrimaryText: { color: '#fff', fontSize: 12, fontWeight: '800' },
    btnGhost: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 4, paddingVertical: 9, borderRadius: radius.full,
      backgroundColor: c.primary[50],
      borderWidth: 1, borderColor: c.primary[200],
    },
    btnGhostText: { color: c.primary[700], fontSize: 12, fontWeight: '800' },
  });
}
