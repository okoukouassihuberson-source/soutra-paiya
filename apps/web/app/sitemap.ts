import type { MetadataRoute } from 'next';
import { supabaseServer } from '@/lib/supabase-server';
import { ENABLED_LOCALES, localePath } from '@/lib/i18n/config';

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
  // Chaque URL traduite est déclarée dans sa langue, avec ses alternates hreflang.
  const alternates = (path: string) => ({ languages: Object.fromEntries(ENABLED_LOCALES.map((l) => [l, base + localePath(path, l)])) });
  const multi = (path: string, extra: { lastModified?: string; priority: number }): MetadataRoute.Sitemap =>
    ENABLED_LOCALES.map((l) => ({ url: base + localePath(path, l), alternates: alternates(path), ...extra }));
  const entries = (rows: any[] | null, prefix: string, priority: number): MetadataRoute.Sitemap =>
    (rows ?? []).flatMap((r) => multi(`${prefix}/${r.slug}`, { lastModified: r.updated_at, priority }));
  return [
    ...multi('/', { priority: 1 }),
    ...['/explorer', '/destinations', '/voyages/nationaux', '/voyages/internationaux', '/activites'].flatMap((p) => multi(p, { priority: 0.8 })),
    ...entries(dests.data, '/destinations', 0.8),
    ...entries(trips.data, '/voyages', 0.7),
    ...entries(acts.data, '/activites', 0.7),
    // Fiches établissements : non traduites (français uniquement).
    ...(venues.data ?? []).map((r: any) => ({ url: `${base}/v/${r.slug}`, lastModified: r.updated_at, priority: 0.6 })),
  ];
}
