import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Cache de lecture léger : dédoublonnage des requêtes identiques simultanées, mémoire avec durée de vie,
 * et copie persistante (AsyncStorage) pour afficher les dernières données quand le réseau est coupé.
 * Pas de bibliothèque supplémentaire : ~60 lignes, aucune dépendance native.
 */
const PREFIX = 'q:v1:';
const MAX_PERSIST_BYTES = 200_000;   // au-delà on ne persiste pas (évite de remplir le stockage)
const mem = new Map<string, { at: number; data: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

export interface CachedResult<T> { data: T; fromCache: boolean; stale: boolean }

/**
 * `fetcher` doit lever une exception en cas d'échec. Comportement :
 *  1. cache mémoire frais (< ttl) → renvoyé sans réseau ;
 *  2. requête identique déjà en cours → on réutilise sa promesse ;
 *  3. sinon réseau ; en cas d'échec, dernière copie connue (mémoire ou stockage) marquée `stale`, sinon l'erreur remonte.
 */
export async function cachedQuery<T>(key: string, fetcher: () => Promise<T>, opts: { ttlMs?: number; force?: boolean; persist?: boolean } = {}): Promise<CachedResult<T>> {
  const ttl = opts.ttlMs ?? 5 * 60_000;
  const hit = mem.get(key);
  if (!opts.force && hit && Date.now() - hit.at < ttl) return { data: hit.data as T, fromCache: true, stale: false };

  let p = inflight.get(key) as Promise<T> | undefined;
  if (!p) {
    p = fetcher().then(async (data) => {
      mem.set(key, { at: Date.now(), data });
      if (opts.persist !== false) {
        try { const raw = JSON.stringify({ at: Date.now(), data }); if (raw.length <= MAX_PERSIST_BYTES) await AsyncStorage.setItem(PREFIX + key, raw); } catch { /* stockage plein ou indisponible : sans conséquence */ }
      }
      return data;
    }).finally(() => { inflight.delete(key); });
    inflight.set(key, p);
  }
  try {
    return { data: await p, fromCache: false, stale: false };
  } catch (err) {
    if (hit) return { data: hit.data as T, fromCache: true, stale: true };
    try {
      const raw = await AsyncStorage.getItem(PREFIX + key);
      if (raw) { const { at, data } = JSON.parse(raw); mem.set(key, { at, data }); return { data: data as T, fromCache: true, stale: true }; }
    } catch { /* copie illisible : on ignore */ }
    throw err;
  }
}

/** Invalide une entrée (ex. après une écriture) ou tout le cache de lecture. */
export function invalidateQuery(key?: string) {
  if (key) { mem.delete(key); AsyncStorage.removeItem(PREFIX + key).catch(() => {}); return; }
  mem.clear();
  AsyncStorage.getAllKeys().then((ks) => AsyncStorage.multiRemove(ks.filter((k) => k.startsWith(PREFIX)))).catch(() => {});
}
