import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || 'https://soutra-paiya.vercel.app').replace(/\/$/, '');
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/pro', '/account', '/login', '/api'] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
