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

export function MapboxMap({ venues, center = ABIDJAN, zoom = 12, onMarkerPress, style }: Props) {
  const cameraRef = useRef<any>(null);
  const [ready, setReady] = useState(false);

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
          centerCoordinate={center}
          animationMode="flyTo"
          animationDuration={1200}
        />
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
                  {v.category === 'maquis' ? '🍻' : v.category === 'restaurant' ? '🍽️' : v.category === 'club' ? '🎉' : '📍'}
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

      <Pressable style={s.recenter} onPress={() => cameraRef.current?.setCamera({ centerCoordinate: center, zoomLevel: zoom, animationDuration: 800 })}>
        <Ionicons name="locate" size={20} color={colors.primary[500]} />
      </Pressable>
    </View>
  );
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
