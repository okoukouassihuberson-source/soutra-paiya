/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@soutra/shared'],
  compress: true,
  // Désactive l'header `x-powered-by: Next.js` (gain mineur + sécu by obscurity).
  poweredByHeader: false,
  // Génère ETag pour permettre la revalidation côté CDN/proxy.
  generateEtags: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
    // Formats modernes : Next sert WebP/AVIF si le browser supporte.
    formats: ['image/avif', 'image/webp'],
    // Tailles de breakpoints alignées sur nos breakpoints Tailwind
    // (sm 640 / md 768 / lg 1024 / xl 1280 / 2xl 1536) + densité retina.
    deviceSizes: [360, 640, 768, 1024, 1280, 1536, 1920, 2560],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    // Cache aggressif : 1 an pour les images optimisées (immutable).
    minimumCacheTTL: 60 * 60 * 24 * 365,
  },
  async headers() {
    return [
      {
        // Assets immuables de Next : hash dans le nom, cache 1 an immutable.
        // Vercel applique déjà ce header par défaut, on le déclare explicitement
        // pour les autres déploiements (Nginx, Caddy, etc.).
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        // Icônes et manifest assets — cache 7 jours.
        source: '/icons/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' },
        ],
      },
      {
        source: '/apple-touch-icon.png',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=604800' },
        ],
      },
      {
        // Le SW lui-même ne doit JAMAIS être caché par le navigateur, sinon
        // une nouvelle version ne sera jamais déployée. Le SW gère son propre
        // cache d'assets en interne.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        ],
      },
      {
        // Manifest : cache court pour propager les changements rapidement.
        source: '/manifest.webmanifest',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=3600' },
          { key: 'Content-Type', value: 'application/manifest+json' },
        ],
      },
      {
        // Page offline : cache long (statique), invalidée par version SW.
        source: '/offline.html',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400' },
        ],
      },
    ];
  },
};
export default nextConfig;
