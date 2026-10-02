import type { MetadataRoute } from 'next';
import { supabaseServer } from '@/lib/supabase-server';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || 'https://soutra-paiya.vercel.app').replace(/\/$/, '');
  const sb = supabaseServer() as any;
  const [venues, dests, trips, acts] = await Promise.all([
    sb.from('venues').select('slug, updated_at').eq('status', 'active').limit(5000),
    sb.from('destinations').select('slug, updated_at').eq('is_published', true).limit(1000),
    sb.from('trips').select('slug, updated_at').in('status', ['published', 'full']).limit(2000),
    sb.from('activities').select('slug, updated_at').eq('status', 'published').limit(5000),
  ]);
  const entries = (rows: any[] | null, prefix: string, priority: number): MetadataRoute.Sitemap =>
    (rows ?? []).map((r) => ({ url: `${base}${prefix}/${r.slug}`, lastModified: r.updated_at, priority }));
  return [
    { url: base, priority: 1 },
    ...['/explorer', '/destinations', '/voyages/nationaux', '/voyages/internationaux', '/activites'].map((p) => ({ url: `${base}${p}`, priority: 0.8 })),
    ...entries(dests.data, '/destinations', 0.8),
    ...entries(trips.data, '/voyages', 0.7),
    ...entries(acts.data, '/activites', 0.7),
    ...entries(venues.data, '/v', 0.6),
  ];
}
