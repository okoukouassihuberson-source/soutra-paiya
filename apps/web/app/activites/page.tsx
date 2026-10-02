import type { Metadata } from 'next';
import Link from 'next/link';
import { ACTIVITY_CATEGORIES, CI_CITIES } from '@soutra/shared';
import { listActivities } from '@/lib/activities';
import { TourismNav } from '@/components/tourism/TourismNav';
import { ActivityCardView } from '@/components/tourism/Cards';

export const dynamic = 'force-dynamic';

type SP = Record<string, string | string[] | undefined>;
const PAGE = 24;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const SORTS = [
  { key: 'popular', label: 'Populaires' }, { key: 'soon', label: 'Prochain départ' },
  { key: 'price_asc', label: 'Prix croissant' }, { key: 'price_desc', label: 'Prix décroissant' }, { key: 'new', label: 'Nouveautés' },
];

function parse(sp: SP) {
  const cat = ACTIVITY_CATEGORIES.some((c) => c.key === one(sp.cat)) ? one(sp.cat) : '';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(one(sp.date)) ? one(sp.date) : '';
  const max = Number(one(sp.max_price));
  const sort = SORTS.some((s) => s.key === one(sp.sort)) ? one(sp.sort) : 'popular';
  return {
    q: one(sp.q).slice(0, 80), city: one(sp.city).slice(0, 60), cat, date, sort,
    maxPrice: one(sp.max_price) !== '' && Number.isFinite(max) && max >= 0 ? Math.min(max, 100_000_000) : undefined,
    page: Math.max(1, Math.floor(Number(one(sp.page))) || 1),
  };
}

export function generateMetadata({ searchParams }: { searchParams: SP }): Metadata {
  const f = parse(searchParams);
  const cat = ACTIVITY_CATEGORIES.find((c) => c.key === f.cat);
  const where = f.city ? ` à ${f.city}` : " en Côte d'Ivoire";
  return {
    title: `${cat?.label ?? 'Activités touristiques'}${where}`,
    description: `Réservez des activités touristiques${where} : balades en bateau, randonnées, visites guidées, excursions… sur Soutra-Playce.`,
    robots: Object.keys(searchParams).some((k) => k !== 'cat') ? { index: false, follow: true } : undefined,
    alternates: { canonical: cat ? `/activites?cat=${cat.key}` : '/activites' },
  };
}

export default async function ActivitiesPage({ searchParams }: { searchParams: SP }) {
  const f = parse(searchParams);
  const { items, total, error } = await listActivities({
    q: f.q, city: f.city, category: f.cat, date: f.date, maxPrice: f.maxPrice, sort: f.sort, limit: PAGE, offset: (f.page - 1) * PAGE,
  });
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const qs = (extra: Record<string, string>) => {
    const q = new URLSearchParams();
    Object.entries({ q: f.q, city: f.city, cat: f.cat, date: f.date, sort: f.sort, max_price: f.maxPrice != null ? String(f.maxPrice) : '' }).forEach(([k, v]) => v && q.set(k, v));
    Object.entries(extra).forEach(([k, v]) => (v === '' ? q.delete(k) : q.set(k, v)));
    return `/activites?${q.toString()}`;
  };

  return (
    <>
      <TourismNav />
      <main className="mx-auto max-w-7xl px-4 pb-28 pt-8 sm:px-6 lg:px-8">
        <h1 className="font-display text-3xl font-bold text-dark">🎯 Activités touristiques</h1>
        <p className="mt-2 max-w-2xl text-neutral-600">Balades en bateau, randonnées, visites guidées, ateliers… réservez votre créneau en quelques clics.</p>

        <form action="/activites" method="get" role="search" className="mt-5 space-y-3">
          {f.cat && <input type="hidden" name="cat" value={f.cat} />}
          <div className="grid gap-2 rounded-2xl bg-white p-2 shadow-lg ring-1 ring-neutral-200 sm:grid-cols-[1.4fr_1fr_auto]">
            <input name="q" defaultValue={f.q} maxLength={80} aria-label="Que recherchez-vous ?" placeholder="Que recherchez-vous ? Bateau, randonnée…" className="rounded-xl border-0 bg-neutral-50 px-4 py-3 text-base" />
            <input name="city" defaultValue={f.city} list="act-cities" maxLength={60} aria-label="Où ?" placeholder="Où ? Assinie, Man…" className="rounded-xl border-0 bg-neutral-50 px-4 py-3 text-base" />
            <button className="rounded-xl bg-primary-500 px-6 py-3 font-semibold text-white hover:bg-primary-600">Rechercher</button>
            <datalist id="act-cities">{CI_CITIES.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <div className="flex flex-wrap items-end gap-3 text-xs font-semibold text-neutral-600">
            <label>Date<input type="date" name="date" defaultValue={f.date} className="mt-1 block rounded-xl border border-neutral-300 px-3 py-2 text-sm" /></label>
            <label>Prix max (XOF)<input type="number" name="max_price" min={0} step={1000} defaultValue={f.maxPrice} className="mt-1 block w-36 rounded-xl border border-neutral-300 px-3 py-2 text-sm" /></label>
            <label>Trier par
              <select name="sort" defaultValue={f.sort} className="mt-1 block rounded-xl border border-neutral-300 px-3 py-2 text-sm">{SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
            </label>
            <button className="rounded-xl bg-dark px-4 py-2 text-sm font-semibold text-white">Filtrer</button>
            <Link href={f.cat ? `/activites?cat=${f.cat}` : '/activites'} className="py-2 text-sm font-medium underline">Réinitialiser</Link>
          </div>
        </form>

        <div className="mt-5 flex gap-2 overflow-x-auto pb-2" role="list" aria-label="Catégories d’activités">
          <Link role="listitem" href={qs({ cat: '', page: '1' })} className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium ${!f.cat ? 'border-primary-500 bg-primary-500 text-white' : 'border-neutral-200 bg-white'}`}>Toutes</Link>
          {ACTIVITY_CATEGORIES.map((c) => (
            <Link key={c.key} role="listitem" href={qs({ cat: c.key, page: '1' })}
              className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium ${f.cat === c.key ? 'border-primary-500 bg-primary-500 text-white' : 'border-neutral-200 bg-white hover:border-primary-300'}`}>{c.emoji} {c.label}</Link>
          ))}
        </div>

        <p className="mt-6 text-sm text-neutral-600" aria-live="polite">{error ? 'Recherche indisponible pour le moment.' : `${total} activité${total > 1 ? 's' : ''} disponible${total > 1 ? 's' : ''}`}</p>
        {items.length === 0 ? (
          <p className="mt-4 rounded-2xl bg-neutral-50 p-8 text-center text-neutral-600">Aucune activité avec ces critères. Essayez une autre date, ville ou catégorie.</p>
        ) : (
          <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{items.map((a) => <ActivityCardView key={a.id} activity={a} />)}</div>
        )}
        {pages > 1 && (
          <nav className="mt-8 flex items-center justify-center gap-3" aria-label="Pagination">
            {f.page > 1 && <Link className="rounded-full border px-5 py-2 text-sm font-medium" href={qs({ page: String(f.page - 1) })}>← Précédent</Link>}
            <span className="text-sm text-neutral-600">Page {f.page} / {pages}</span>
            {f.page < pages && <Link className="rounded-full border px-5 py-2 text-sm font-medium" href={qs({ page: String(f.page + 1) })}>Suivant →</Link>}
          </nav>
        )}
      </main>
    </>
  );
}
