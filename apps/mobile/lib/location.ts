// ============================================================================
// location.ts — récupération centralisée de la position utilisateur.
//
// Avant cette lib, 14 callsites appelaient Location.getCurrentPositionAsync
// avec accuracy=Balanced (~50-100m) — précision insuffisante pour une app
// de recommandation de sorties / itinéraires. Le helper getUserLocation()
// utilise High par défaut (~10-20m) avec fallback Balanced si le High échoue
// (mode économie batterie, indoor, etc.).
//
// Gère aussi proprement le flow de permissions :
//   • Permission jamais demandée → la demande
//   • Permission refusée mais peut être redemandée → renvoie null silencieux
//   • Permission refusée définitivement → renvoie null silencieux
// ============================================================================

import * as Location from 'expo-location';

export interface UserCoords {
  lat: number;
  lng: number;
  accuracy_m?: number | null;
  /** Timestamp du fix GPS */
  ts?: number;
}

export interface GetLocationOptions {
  /** Force High même si Balanced suffirait à l'usage. Défaut true. */
  highAccuracy?: boolean;
  /**
   * Timeout maximum (ms) avant fallback. Sur certains devices, High peut
   * prendre 5-10s pour la 1re fix. Défaut 8000.
   */
  timeoutMs?: number;
  /**
   * Si true, ne déclenche PAS la demande de permission (vérifie juste).
   * Utile sur les écrans secondaires qui ne veulent pas créer un prompt.
   */
  noPrompt?: boolean;
}

/**
 * Récupère la position courante (best-effort, jamais throw).
 * Renvoie null si permission refusée ou GPS indispo.
 */
export async function getUserLocation(
  opts: GetLocationOptions = {},
): Promise<UserCoords | null> {
  const {
    highAccuracy = true,
    timeoutMs = 8000,
    noPrompt = false,
  } = opts;

  try {
    // ── 1. Vérification / demande de permission ──
    let { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') {
      if (noPrompt) return null;
      const req = await Location.requestForegroundPermissionsAsync();
      status = req.status;
      if (status !== 'granted') return null;
    }

    // ── 2. Récupération position avec timeout custom ──
    const accuracy = highAccuracy
      ? Location.Accuracy.High
      : Location.Accuracy.Balanced;

    const positionPromise = Location.getCurrentPositionAsync({ accuracy });
    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), timeoutMs),
    );
    const pos = await Promise.race([positionPromise, timeoutPromise]);

    if (!pos) {
      // Timeout sur High → on retente en Balanced (plus rapide, moins précis)
      if (highAccuracy) {
        const fallback = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
        ]);
        if (!fallback) return null;
        return {
          lat: fallback.coords.latitude,
          lng: fallback.coords.longitude,
          accuracy_m: fallback.coords.accuracy ?? null,
          ts: fallback.timestamp,
        };
      }
      return null;
    }

    return {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy_m: pos.coords.accuracy ?? null,
      ts: pos.timestamp,
    };
  } catch (err) {
    // GPS désactivé OS, erreur driver, etc.
    console.warn('[location] getUserLocation failed:', err);
    return null;
  }
}

/**
 * Watch continu de la position (utile pour les écrans avec carte live).
 * Renvoie une fonction unsubscribe pour stopper le watch.
 * Best-effort : si la permission est refusée, le callback n'est jamais appelé.
 */
export async function watchUserLocation(
  callback: (coords: UserCoords) => void,
  opts: { highAccuracy?: boolean; distanceIntervalM?: number } = {},
): Promise<() => void> {
  const { highAccuracy = true, distanceIntervalM = 10 } = opts;

  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') {
      const req = await Location.requestForegroundPermissionsAsync();
      if (req.status !== 'granted') return () => { /* no-op */ };
    }
    const sub = await Location.watchPositionAsync(
      {
        accuracy: highAccuracy ? Location.Accuracy.High : Location.Accuracy.Balanced,
        distanceInterval: distanceIntervalM,
        timeInterval: 5000,
      },
      (pos) => {
        callback({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy_m: pos.coords.accuracy ?? null,
          ts: pos.timestamp,
        });
      },
    );
    return () => { try { sub.remove(); } catch { /* noop */ } };
  } catch (err) {
    console.warn('[location] watchUserLocation failed:', err);
    return () => { /* no-op */ };
  }
}

/**
 * Distance haversine en mètres entre 2 coordonnées.
 * Utile pour recalculer la distance d'un venue après MAJ de la position user.
 */
export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371e3; // m
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const Δφ = ((b.lat - a.lat) * Math.PI) / 180;
  const Δλ = ((b.lng - a.lng) * Math.PI) / 180;
  const aa = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
  return R * c;
}
