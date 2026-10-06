import { NextResponse, type NextRequest } from 'next/server';
import { createI18n } from '@/lib/i18n/t';
import { isEnabledLocale, DEFAULT_LOCALE } from '@/lib/i18n/config';
import { supabaseServer } from '@/lib/supabase-server';
import { listActivities, type ActivityCard } from '@/lib/activities';
import { searchVenues } from '@/lib/tourism';

export const dynamic = 'force-dynamic';

export interface SearchHit { id: string; title: string; subtitle: string; href: string; image: string | null; price?: number | null }
export interface SearchResponse {
  destinations: SearchHit[]; trips: SearchHit[]; activities: SearchHit[]; venues: SearchHit[];
}

const clean = (s: string) => s.replace(/[%,()*\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);

/** Recherche unifiée (palette ⌘K) : destinations, voyages, activités, lieux. Lecture publique (RLS). */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const rawLocale = sp.get('locale');
  const i = createI18n(isEnabledLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE);
  const q = clean(sp.get('q') ?? '');
  const empty: SearchResponse = { destinations: [], trips: [], activities: [], venues: [] };
  if (q.length < 2) return NextResponse.json(empty);

  const sb = supabaseServer() as any;
  const today = new Date().toISOString().slice(0, 10);
  const like = `%${q}%`;

  const [dest, trips, acts, venues] = await Promise.all([
    sb.from('destinations').select('slug, name, tagline, cover_url, i18n').eq('is_published', true)
      .ilike('name', like).order('position', { ascending: true, nullsFirst: false }).limit(4),
    sb.from('trips').select('slug, title, city, country, scope, cover_url, base_price_xof, i18n')
      .in('status', ['published', 'full']).gte('starts_on', today)
      .or(`title.ilike.${like},city.ilike.${like},country.ilike.${like}`).order('starts_on').limit(5),
    listActivities({ q, limit: 5 }),
    searchVenues({ q, limit: 5 }),
  ]);

  const out: SearchResponse = {
    destinations: ((dest.data ?? []) as any[]).map((d) => ({
      id: d.slug, title: i.field(d, 'name') ?? d.name, subtitle: i.field(d, 'tagline') ?? '', href: i.lp(`/destinations/${d.slug}`), image: d.cover_url,
    })),
    trips: ((trips.data ?? []) as any[]).map((t) => ({
      id: t.slug, title: i.field(t, 'title') ?? t.title,
      subtitle: [t.city, t.scope === 'national' ? i.t('common.country') : t.country].filter(Boolean).join(' · '),
      href: i.lp(`/voyages/${t.slug}`), image: t.cover_url, price: t.base_price_xof,
    })),
    activities: (acts.items as ActivityCard[]).map((a) => ({
      id: a.slug, title: i.field(a, 'title') ?? a.title, subtitle: a.city ?? '', href: i.lp(`/activites/${a.slug}`), image: a.cover_url, price: a.price_xof,
    })),
    venues: venues.map((v) => ({
      id: v.slug, title: v.name, subtitle: [v.district, v.city].filter(Boolean).join(', '), href: `/v/${v.slug}`, image: v.cover_url, price: v.avg_price_xof,
    })),
  };
  return NextResponse.json(out, { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' } });
}
