/* eslint-disable no-restricted-globals */
// ============================================================================
// Soutra-Explore — Service Worker (vanilla, no build tooling)
// ============================================================================
// Stratégies par type de requête :
//   • static (JS/CSS/fonts/images) → cache-first, mis à jour en arrière-plan
//   • HTML navigations              → network-first, fallback /offline.html
//   • API (Supabase, /api/*)        → bypass (toujours réseau, jamais en cache)
//
// Bump la version pour invalider tous les caches d'un coup. Le SW
// remplace immédiatement l'ancien (skipWaiting + clients.claim).
// ============================================================================

const VERSION = 'v1';
const STATIC_CACHE = `soutra-static-${VERSION}`;
const RUNTIME_CACHE = `soutra-runtime-${VERSION}`;

// Pages/assets pré-cachés au install pour garantir un offline minimal.
const PRECACHE_URLS = [
  '/offline.html',
  '/icons/icon.svg',
  '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

// Helpers --------------------------------------------------------------------

const isHTMLRequest = (req) =>
  req.mode === 'navigate'
  || (req.method === 'GET' && req.headers.get('accept')?.includes('text/html'));

const isStaticAsset = (url) =>
  url.pathname.startsWith('/_next/static/')
  || url.pathname.startsWith('/icons/')
  || /\.(?:js|css|woff2?|ttf|otf|png|jpe?g|gif|svg|webp|avif|ico)$/i.test(url.pathname);

// On laisse Supabase, /api, et toutes les requêtes non-GET passer tel quel.
const shouldBypass = (req, url) => {
  if (req.method !== 'GET') return true;
  if (url.pathname.startsWith('/api/')) return true;
  if (url.hostname.endsWith('.supabase.co')) return true;
  if (url.hostname.endsWith('.supabase.in')) return true;
  if (url.pathname.startsWith('/auth/')) return true;
  return false;
};

// Fetch handler --------------------------------------------------------------

self.addEventListener('fetch', (event) => {
  const req = event.request;
  let url;
  try { url = new URL(req.url); } catch { return; }

  if (shouldBypass(req, url)) return;

  // HTML navigations : network-first, fallback offline.
  if (isHTMLRequest(req)) {
    event.respondWith(networkFirstHTML(req));
    return;
  }

  // Static : cache-first + revalidate.
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Reste : network avec runtime cache de secours.
  event.respondWith(staleWhileRevalidate(req));
});

async function networkFirstHTML(req) {
  try {
    const fresh = await fetch(req);
    // On peut cacher la home et quelques routes statiques, mais on évite de
    // remplir le cache avec des pages utilisateur authentifiées (pro/admin)
    // qui contiennent des données privées.
    if (fresh.ok) {
      const url = new URL(req.url);
      if (url.pathname === '/' || url.pathname === '/login') {
        const clone = fresh.clone();
        caches.open(RUNTIME_CACHE).then((c) => c.put(req, clone));
      }
    }
    return fresh;
  } catch {
    const cached = await caches.match(req);
    if (cached) return cached;
    const offline = await caches.match('/offline.html');
    if (offline) return offline;
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(req);
  if (cached) {
    // Refresh en arrière-plan (best-effort).
    fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); }).catch(() => {});
    return cached;
  }
  try {
    const fresh = await fetch(req);
    if (fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch (err) {
    return new Response('', { status: 504, statusText: 'Gateway Timeout' });
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(req);
  const networkPromise = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);
  // Si cached existe, on le sert immédiatement (revalidate en background).
  // Sinon on attend le réseau ; si même le réseau a échoué et qu'on n'a rien
  // en cache, on DOIT renvoyer une Response valide — respondWith(undefined)
  // plante avec "Failed to convert value to 'Response'".
  if (cached) return cached;
  const fresh = await networkPromise;
  if (fresh) return fresh;
  return new Response('', { status: 504, statusText: 'Gateway Timeout' });
}

// Messaging : permet à la page d'envoyer { type: 'SKIP_WAITING' } pour
// activer immédiatement un nouveau SW disponible (utilisé par le banner
// de mise à jour côté client).
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
