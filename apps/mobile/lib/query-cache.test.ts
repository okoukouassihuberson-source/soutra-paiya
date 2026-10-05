import test from 'node:test';
import assert from 'node:assert/strict';

// AsyncStorage simulé en mémoire (le vrai module est natif).
const store = new Map<string, string>();
const Module = require('node:module');
const orig = Module._load;
Module._load = function (req: string, ...rest: any[]) {
  if (req === '@react-native-async-storage/async-storage') {
    return { __esModule: true, default: { setItem: async (k: string, v: string) => { store.set(k, v); }, getItem: async (k: string) => store.get(k) ?? null, removeItem: async (k: string) => { store.delete(k); }, getAllKeys: async () => [...store.keys()], multiRemove: async (ks: string[]) => ks.forEach((k) => store.delete(k)) } };
  }
  return orig.call(this, req, ...rest);
};
const { cachedQuery, invalidateQuery } = require('./query-cache');

test('requêtes identiques simultanées : un seul appel réseau', async () => {
  invalidateQuery(); let n = 0;
  const f = async () => { n++; await new Promise((r) => setTimeout(r, 10)); return [1, 2]; };
  const [a, b, c] = await Promise.all([cachedQuery('k1', f), cachedQuery('k1', f), cachedQuery('k1', f)]);
  assert.equal(n, 1); assert.deepEqual(a.data, b.data); assert.deepEqual(c.data, [1, 2]);
});
test('cache frais : pas de nouvel appel ; force : nouvel appel', async () => {
  invalidateQuery(); let n = 0; const f = async () => ++n;
  await cachedQuery('k2', f); const r = await cachedQuery('k2', f); assert.equal(n, 1); assert.equal(r.fromCache, true);
  await cachedQuery('k2', f, { force: true }); assert.equal(n, 2);
});
test('échec réseau : renvoie la dernière copie (stale), sinon lève', async () => {
  invalidateQuery(); await cachedQuery('k3', async () => 'ok', { ttlMs: 0 });
  const r = await cachedQuery('k3', async () => { throw new Error('offline'); }, { ttlMs: 0 });
  assert.equal(r.data, 'ok'); assert.equal(r.stale, true);
  await assert.rejects(() => cachedQuery('inconnu', async () => { throw new Error('offline'); }), /offline/);
});
test('copie persistante utilisée après un « redémarrage » (mémoire vidée)', async () => {
  invalidateQuery(); await cachedQuery('k4', async () => ({ a: 1 }), { ttlMs: 0 });
  // simule un redémarrage : on vide la mémoire mais pas le stockage
  const keep = new Map(store); invalidateQuery(); await new Promise((r) => setTimeout(r, 10)); keep.forEach((v, k) => store.set(k, v));
  const r = await cachedQuery('k4', async () => { throw new Error('offline'); }, { ttlMs: 0 });
  assert.deepEqual(r.data, { a: 1 }); assert.equal(r.stale, true);
});
