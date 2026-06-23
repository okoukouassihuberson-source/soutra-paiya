import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { colors, typography, radius, spacing, formatXOF } from '@soutra/shared';

// Coordonnées par défaut : centre d'Abidjan (Cocody)
export const ABIDJAN: [number, number] = [-3.999, 5.359]; // [lng, lat]

export interface MapVenue {
  id: string;
  name: string;
  category?: string;
  price?: number;
  coordinate: [number, number]; // [lng, lat]
}

interface Props {
  venues: MapVenue[];
  center?: [number, number];
  zoom?: number;
  onMarkerPress?: (v: MapVenue) => void;
  style?: any;
  /** Position GPS de l'utilisateur (lng, lat). Affiche un marqueur bleu pulsé. */
  userLocation?: [number, number] | null;
  /** Rayon en km autour de userLocation. Si défini, dessine un cercle. */
  radiusKm?: number | null;
  /** Si vrai, recadre auto sur userLocation au chargement. */
  followUser?: boolean;
}

// Détection Expo Go (Mapbox natif indisponible)
const isExpoGo = Constants.appOwnership === 'expo';
// Lecture du token avec priorité env var > app.json :
//   1. process.env.EXPO_PUBLIC_MAPBOX_TOKEN (injecté au build par Expo dès
//      qu'il existe dans .env / EAS Secrets). Ne fuite jamais via git.
//   2. fallback Constants.expoConfig?.extra?.mapboxPublicToken (legacy).
const token =
  (process.env.EXPO_PUBLIC_MAPBOX_TOKEN as string | undefined) ||
  (Constants.expoConfig?.extra?.mapboxPublicToken as string | undefined);
const tokenMissing = !token || token.startsWith('REPLACE_WITH');

// Import dynamique pour éviter le crash en Expo Go
// eslint-disable-next-line @typescript-eslint/no-var-requires
let Mapbox: any = null;
try {
  if (!isExpoGo) {
    Mapbox = require('@rnmapbox/maps').default;
    if (token && !tokenMissing) Mapbox.setAccessToken(token);
  }
} catch (e) {
  Mapbox = null;
}

export function MapboxMap({
  venues, center = ABIDJAN, zoom = 12, onMarkerPress, style,
  userLocation, radiusKm, followUser,
}: Props) {
  const cameraRef = useRef<any>(null);
  const [ready, setReady] = useState(false);

  // Re-center quand userLocation change et followUser=true (PR5 audit UX).
  useEffect(() => {
    if (!followUser || !userLocation || !cameraRef.current) return;
    cameraRef.current.setCamera({
      centerCoordinate: userLocation,
      zoomLevel: radiusKm ? Math.max(11, 15 - Math.log2(radiusKm)) : 14,
      animationMode: 'flyTo',
      animationDuration: 1000,
    });
  }, [followUser, userLocation, radiusKm]);

  // Effective center : si followUser, on prend userLocation comme point initial
  const effectiveCenter = followUser && userLocation ? userLocation : center;

  // GeoJSON cercle de rayon autour de l'user (approximation 64 segments).
  const radiusGeojson = useMemo(() => {
    if (!userLocation || !radiusKm) return null;
    const [lng, lat] = userLocation;
    const points: [number, number][] = [];
    const km = radiusKm;
    // 1° latitude ≈ 111 km. Pour lng, on ajuste par cos(lat) à cette latitude.
    const latRad = (lat * Math.PI) / 180;
    for (let i = 0; i <= 64; i++) {
      const angle = (i / 64) * 2 * Math.PI;
      const dLat = (km * Math.sin(angle)) / 111;
      const dLng = (km * Math.cos(angle)) / (111 * Math.cos(latRad));
      points.push([lng + dLng, lat + dLat]);
    }
    return {
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'Polygon' as const, coordinates: [points] },
    };
  }, [userLocation, radiusKm]);

  // Fallback si on tourne dans Expo Go ou si le token est absent
  if (!Mapbox || isExpoGo || tokenMissing) {
    return <FallbackMap reason={isExpoGo ? 'expo-go' : 'token'} venues={venues} style={style} onMarkerPress={onMarkerPress} />;
  }

  return (
    <View style={[s.container, style]}>
      <Mapbox.MapView
        style={s.map}
        styleURL={Mapbox.StyleURL?.Street}
        logoEnabled={false}
        attributionEnabled={false}
        compassEnabled
        onDidFinishLoadingMap={() => setReady(true)}
      >
        <Mapbox.Camera
          ref={cameraRef}
          zoomLevel={zoom}
          centerCoordinate={effectiveCenter}
          animationMode="flyTo"
          animationDuration={1200}
        />

        {/* Cercle rayon de recherche autour de l'user (PR5) */}
        {radiusGeojson && Mapbox.ShapeSource && Mapbox.FillLayer && (
          <Mapbox.ShapeSource id="radius-source" shape={radiusGeojson}>
            <Mapbox.FillLayer
              id="radius-fill"
              style={{
                fillColor: '#3B82F6',
                fillOpacity: 0.12,
                fillOutlineColor: '#3B82F6',
              }}
            />
          </Mapbox.ShapeSource>
        )}

        {/* Marqueur position utilisateur (PR5) — point bleu pulsé */}
        {userLocation && Mapbox.PointAnnotation && (
          <Mapbox.PointAnnotation id="user-location" coordinate={userLocation}>
            <View style={s.userMarker}>
              <View style={s.userMarkerHalo} />
              <View style={s.userMarkerDot} />
            </View>
          </Mapbox.PointAnnotation>
        )}

        {venues.map((v) => (
          <Mapbox.PointAnnotation
            key={v.id}
            id={v.id}
            coordinate={v.coordinate}
            onSelected={() => onMarkerPress?.(v)}
          >
            <View style={s.marker}>
              <View style={s.markerDot}>
                <Text style={s.markerEmoji}>
                  {markerEmoji(v.category)}
                </Text>
              </View>
              {v.price ? (
                <View style={s.priceBubble}>
                  <Text style={s.priceText}>{Math.round(v.price / 1000)}K</Text>
                </View>
              ) : null}
            </View>
          </Mapbox.PointAnnotation>
        ))}
      </Mapbox.MapView>

      <Pressable
        style={s.recenter}
        onPress={() =>
          cameraRef.current?.setCamera({
            centerCoordinate: effectiveCenter,
            zoomLevel: zoom,
            animationDuration: 800,
          })
        }
      >
        <Ionicons name="locate" size={20} color={colors.primary[500]} />
      </Pressable>
    </View>
  );
}

/** Emoji marker selon la catégorie de venue (étendu vs version initiale). */
function markerEmoji(category?: string): string {
  switch (category) {
    case 'maquis':       return '🍻';
    case 'restaurant':   return '🍽️';
    case 'club':         return '🎉';
    case 'bar':          return '🍸';
    case 'lounge':       return '🛋️';
    case 'cafe':         return '☕';
    case 'fast_food':    return '🍔';
    case 'hotel':
    case 'villa':
    case 'resort':
    case 'auberge':
    case 'residence_meublee': return '🏨';
    case 'boutique':
    case 'mall':         return '🛍️';
    case 'supermarche':  return '🛒';
    case 'pharmacie':    return '💊';
    case 'cinema':       return '🎬';
    case 'casino':       return '🎰';
    case 'piscine':      return '🏊';
    case 'fitness':
    case 'salle_sport':  return '💪';
    case 'sport':
    case 'terrain_football': return '⚽';
    case 'event_space':  return '🎪';
    case 'parc':         return '🌳';
    case 'beach':        return '🏖️';
    case 'musee':        return '🖼️';
    case 'monument':     return '🗿';
    case 'maternelle':
    case 'primaire':
    case 'college':
    case 'lycee':
    case 'universite':
    case 'grande_ecole': return '🎓';
    case 'hopital':
    case 'clinique':     return '🏥';
    case 'vtc_transport':return '🚖';
    default:             return '📍';
  }
}

function FallbackMap({ reason, venues, onMarkerPress, style }: { reason: 'expo-go' | 'token'; venues: MapVenue[]; onMarkerPress?: (v: MapVenue) => void; style?: any }) {
  return (
    <View style={[s.fallback, style]}>
      <Ionicons name="map" size={48} color={colors.primary[300]} />
      <Text style={s.fallbackTitle}>
        {reason === 'expo-go' ? 'Carte indisponible dans Expo Go' : 'Token Mapbox manquant'}
      </Text>
      <Text style={s.fallbackHint}>
        {reason === 'expo-go'
          ? 'Lance un dev build (npx expo run:android) pour voir la carte.'
          : 'Ajoute ton token public dans app.json → extra.mapboxPublicToken'}
      </Text>
      <View style={s.fallbackChips}>
        {venues.slice(0, 3).map((v) => (
          <Pressable key={v.id} style={s.fallbackChip} onPress={() => onMarkerPress?.(v)}>
            <Text style={s.fallbackChipText}>📍 {v.name}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    height: 280,
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: colors.neutral[100],
  },
  map: { flex: 1 },
  // User location marker (PR5 audit UX)
  userMarker: {
    width: 28, height: 28,
    alignItems: 'center', justifyContent: 'center',
  },
  userMarkerHalo: {
    position: 'absolute',
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#3B82F6',
    opacity: 0.25,
  },
  userMarkerDot: {
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: '#3B82F6',
    borderWidth: 3, borderColor: '#fff',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 5 },
    }),
  },
  marker: { alignItems: 'center' },
  markerDot: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.primary[500],
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#fff',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 4 },
    }),
  },
  markerEmoji: { fontSize: 16 },
  priceBubble: {
    marginTop: 2,
    paddingHorizontal: 6, paddingVertical: 2,
    backgroundColor: colors.dark, borderRadius: 8,
  },
  priceText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  recenter: {
    position: 'absolute', right: spacing.md, bottom: spacing.md,
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 4 },
    }),
  },
  fallback: {
    height: 220,
    borderRadius: radius.lg,
    backgroundColor: colors.primary[50],
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    alignItems: 'center', justifyContent: 'center',
    padding: spacing.lg,
  },
  fallbackTitle: { marginTop: spacing.sm, fontSize: typography.fontSize.base, fontWeight: '700', color: colors.dark, textAlign: 'center' },
  fallbackHint: { marginTop: spacing.xs, fontSize: typography.fontSize.xs, color: colors.neutral[600], textAlign: 'center' },
  fallbackChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md, justifyContent: 'center' },
  fallbackChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, backgroundColor: '#fff', borderRadius: radius.full },
  fallbackChipText: { fontSize: typography.fontSize.xs, color: colors.dark, fontWeight: '600' },
});
