import Constants, { ExecutionEnvironment } from 'expo-constants';

/** Vrai dans l'app « Expo Go » : les modules natifs personnalisés (Mapbox, reconnaissance vocale…) n'y existent pas. */
export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/**
 * Charge un module natif optionnel sans jamais faire planter l'app :
 * renvoie null s'il est absent (Expo Go, build ancien) ou s'il échoue à s'initialiser.
 */
export function optionalModule<T = any>(load: () => T): T | null {
  try { return load() ?? null; } catch (e) {
    if (__DEV__) console.warn('[runtime] module natif indisponible :', (e as Error)?.message);
    return null;
  }
}
