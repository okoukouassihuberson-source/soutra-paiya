import { supabaseServer } from './supabase-server';
import { VIBES } from './home-visuals';

const db = () => supabaseServer() as any;

/** Nombre de lieux actifs par « envie » (0 si indisponible : la carte n'affiche alors aucun compteur). */
export async function vibeCounts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  await Promise.all(VIBES.map(async (v) => {
    const { count, error } = await db().from('venues').select('id', { count: 'exact', head: true })
      .eq('status', 'active').in('category', v.venueCats as unknown as string[]);
    out[v.key] = error ? 0 : (count ?? 0);
  }));
  return out;
}

export interface HomeReview { id: string; rating: number; comment: string; author: string; title: string; slug: string }

/** Derniers avis publiés (4★ et plus, avec commentaire). Aucun avis factice : liste vide si rien en base. */
export async function latestReviews(limit = 3): Promise<HomeReview[]> {
  const { data, error } = await db().from('activity_reviews')
    .select('id, rating, comment, profiles(full_name), activities(title, slug)')
    .eq('status', 'published').gte('rating', 4).not('comment', 'is', null)
    .order('created_at', { ascending: false }).limit(limit * 3);
  if (error) { console.error('[home] reviews', error); return []; }
  return ((data ?? []) as any[])
    .filter((r) => (r.comment ?? '').trim().length >= 20 && r.activities)
    .slice(0, limit)
    .map((r) => {
      const parts = (r.profiles?.full_name ?? '').trim().split(/\s+/).filter(Boolean);
      const author = parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : (parts[0] ?? '');
      return { id: r.id, rating: r.rating, comment: r.comment.trim(), author, title: r.activities.title, slug: r.activities.slug };
    });
}
