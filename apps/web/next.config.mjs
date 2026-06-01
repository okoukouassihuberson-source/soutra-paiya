/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@soutra/shared'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
  async headers() {
    return [
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
    ];
  },
};
export default nextConfig;
