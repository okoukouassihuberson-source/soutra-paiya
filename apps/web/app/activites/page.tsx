import type { Metadata } from 'next';
import Link from 'next/link';
import { ACTIVITY_CATEGORIES, CI_CITIES, activityCategoryEmoji } from '@soutra/shared';
import { getI18n } from '@/lib/i18n/server';
import { languageAlternates } from '@/lib/i18n/seo';
import { listActivities } from '@/lib/activities';
import { TourismNav } from '@/components/tourism/TourismNav';
import { ActivityCardView } from '@/components/tourism/Cards';
import { SplitResults } from '@/components/tourism/SplitResults';
import type { MapItem } from '@/components/tourism/ResultsMap';

export const dynamic = 'force-dynamic';

type SP = Record<string, string | string[] | undefined>;
const PAGE = 24;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const SORTS = ['popular', 'soon', 'price_asc', 'price_desc', 'new'] as const;

function parse(sp: SP) {
  const cat = ACTIVITY_CATEGORIES.some((c) => c.key === one(sp.cat)) ? one(sp.cat) : '';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(one(sp.date)) ? one(sp.date) : '';
  const max = Number(one(sp.max_price));
  const sort = (SORTS as readonly string[]).includes(one(sp.sort)) ? one(sp.sort) : 'popular';
  return {
    q: one(sp.q).slice(0, 80), city: one(sp.city).slice(0, 60), cat, date, sort,
    maxPrice: one(sp.max_price) !== '' && Number.isFinite(max) && max >= 0 ? Math.min(max, 100_000_000) : undefined,
    page: Math.max(1, Math.floor(Number(one(sp.page))) || 1),
    view: one(sp.view) === 'map' ? 'map' : one(sp.view) === 'list' ? 'list' : 'split',
  };
}

export function generateMetadata({ searchParams }: { searchParams: SP }): Metadata {
  const { t, tdyn, locale } = getI18n();
  const f = parse(searchParams);
  const cat = ACTIVITY_CATEGORIES.find((c) => c.key === f.cat);
  const where = f.city ? t('act.metaWhereCity', { city: f.city }) : t('act.metaWhereDefault');
  return {
    title: `${cat ? tdyn('actCat', cat.key, cat.label) : t('act.metaTitleDefault')}${where}`,
    description: t('act.metaDescription', { where }),
    robots: Object.keys(searchParams).some((k) => k !== 'cat') ? { index: false, follow: true } : undefined,
    alternates: languageAlternates(cat ? `/activites?cat=${cat.key}` : '/activites', locale),
  };
}

export default async function ActivitiesPage({ searchParams }: { searchParams: SP }) {
  const i = getI18n();
  const { t, tn, tdyn, lp, fmtNumber } = i;
  const f = parse(searchParams);
  const mapView = f.view === 'map';
  const { items, total, error } = await listActivities({
    q: f.q, city: f.city, category: f.cat, date: f.date, maxPrice: f.maxPrice, sort: f.sort, limit: mapView ? 100 : PAGE, offset: mapView ? 0 : (f.page - 1) * PAGE,
  });
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const qs = (extra: Record<string, string>) => {
    const q = new URLSearchParams();
    Object.entries({ q: f.q, city: f.city, cat: f.cat, date: f.date, sort: f.sort, view: f.view === 'split' ? '' : f.view, max_price: f.maxPrice != null ? String(f.maxPrice) : '' }).forEach(([k, v]) => v && q.set(k, v));
    Object.entries(extra).forEach(([k, v]) => (v === '' ? q.delete(k) : q.set(k, v)));
    return lp(`/activites?${q.toString()}`);
  };

  const mapItems: MapItem[] = items.filter((a) => a.latitude != null && a.longitude != null).map((a) => ({
    id: a.id, href: i.lp(`/activites/${a.slug}`), title: i.field(a, 'title') ?? a.title, image: a.cover_url, emoji: activityCategoryEmoji(a.category),
    sub: `${tdyn('actCat', a.category, a.category)}${a.city ? ` · ${a.city}` : ''}`,
    rating: a.rating_avg, ratingCount: a.rating_count, price: a.price_xof, lat: a.latitude as number, lng: a.longitude as number,
  }));
  const grid = (narrow: boolean) => (
    <div className={`grid gap-5 sm:grid-cols-2 ${narrow ? 'xl:grid-cols-2' : 'lg:grid-cols-3 xl:grid-cols-4'}`}>
      {items.map((a) => <div key={a.id} className="[&>a]:block [&>a]:h-full" data-map-id={a.id}><ActivityCardView activity={a} /></div>)}
    </div>
  );

  return (
    <>
      <TourismNav />
      <main className="mx-auto max-w-7xl px-4 pb-28 pt-8 sm:px-6 lg:px-8">
        <h1 className="font-display text-3xl font-bold text-dark">{t('act.title')}</h1>
        <p className="mt-2 max-w-2xl text-neutral-600">{t('act.intro')}</p>

        <form action={lp('/activites')} method="get" role="search" className="mt-5 space-y-3">
          {f.cat && <input type="hidden" name="cat" value={f.cat} />}
          {f.view !== 'split' && <input type="hidden" name="view" value={f.view} />}
          <div className="grid gap-2 rounded-2xl bg-white p-2 shadow-lg ring-1 ring-neutral-200 sm:grid-cols-[1.4fr_1fr_auto]">
            <input name="q" defaultValue={f.q} maxLength={80} aria-label={t('search.q')} placeholder={t('act.qPlaceholder')} className="rounded-xl border-0 bg-neutral-50 px-4 py-3 text-base" />
            <input name="city" defaultValue={f.city} list="act-cities" maxLength={60} aria-label={t('search.where')} placeholder={t('act.wherePlaceholder')} className="rounded-xl border-0 bg-neutral-50 px-4 py-3 text-base" />
            <button className="rounded-xl bg-primary-500 px-6 py-3 font-semibold text-night hover:bg-primary-400">{t('common.search')}</button>
            <datalist id="act-cities">{CI_CITIES.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <div className="flex flex-wrap items-end gap-3 text-xs font-semibold text-neutral-600">
            <label>{t('act.date')}<input type="date" name="date" defaultValue={f.date} className="mt-1 block rounded-xl border border-neutral-300 px-3 py-2 text-sm" /></label>
            <label>{t('act.maxPrice')}<input type="number" name="max_price" min={0} step={1000} defaultValue={f.maxPrice} className="mt-1 block w-36 rounded-xl border border-neutral-300 px-3 py-2 text-sm" /></label>
            <label>{t('act.sortBy')}
              <select name="sort" defaultValue={f.sort} className="mt-1 block rounded-xl border border-neutral-300 px-3 py-2 text-sm">{SORTS.map((k) => <option key={k} value={k}>{t(`sort.${k}`)}</option>)}</select>
            </label>
            <button className="rounded-xl bg-dark px-4 py-2 text-sm font-semibold text-white">{t('act.filter')}</button>
            <Link href={lp(f.cat ? `/activites?cat=${f.cat}` : '/activites')} className="py-2 text-sm font-medium underline">{t('common.reset')}</Link>
          </div>
        </form>

        <div className="mt-5 flex gap-2 overflow-x-auto pb-2" role="list" aria-label={t('act.categories')}>
          <Link role="listitem" href={qs({ cat: '', page: '1' })} className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium ${!f.cat ? 'border-primary-500 bg-primary-500 text-night' : 'border-neutral-200 bg-white'}`}>{t('act.all')}</Link>
          {ACTIVITY_CATEGORIES.map((c) => (
            <Link key={c.key} role="listitem" href={qs({ cat: c.key, page: '1' })}
              className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium ${f.cat === c.key ? 'border-primary-500 bg-primary-500 text-night' : 'border-neutral-200 bg-white hover:border-primary-300'}`}>{c.emoji} {tdyn('actCat', c.key, c.label)}</Link>
          ))}
        </div>

        <p className="mt-6 text-sm text-neutral-600" aria-live="polite">{error ? t('act.unavailable') : tn('act.available', total, { n: fmtNumber(total) })}</p>
        {items.length > 0 && (
          <div className="mt-3 flex justify-end">
            <div className="inline-flex overflow-hidden rounded-full border border-neutral-300 text-sm font-medium" role="group" aria-label={t('split.view')}>
              <Link href={qs({ view: 'list', page: '1' })} aria-current={f.view === 'list' ? 'true' : undefined} className={`px-4 py-1.5 ${f.view === 'list' ? 'bg-dark text-white' : 'bg-white'}`}>{t('split.list')}</Link>
              <Link href={qs({ view: 'split', page: '1' })} aria-current={f.view === 'split' ? 'true' : undefined} className={`hidden px-4 py-1.5 lg:block ${f.view === 'split' ? 'bg-dark text-white' : 'bg-white'}`}>{t('split.split')}</Link>
              <Link href={qs({ view: 'map', page: '1' })} aria-current={mapView ? 'true' : undefined} className={`px-4 py-1.5 ${mapView ? 'bg-dark text-white' : 'bg-white'}`}>{t('split.map')}</Link>
            </div>
          </div>
        )}
        {items.length === 0 ? (
          <p className="mt-4 rounded-2xl bg-neutral-50 p-8 text-center text-neutral-600">{t('act.empty')}</p>
        ) : mapView ? (
          <div className="mt-4"><SplitResults items={mapItems} mode="map" /></div>
        ) : f.view === 'split' ? (
          <div className="mt-4"><SplitResults items={mapItems} mode="split">{grid(true)}</SplitResults></div>
        ) : (
          <div className="mt-4">{grid(false)}</div>
        )}
        {!mapView && pages > 1 && (
          <nav className="mt-8 flex items-center justify-center gap-3" aria-label={t('common.pagination')}>
            {f.page > 1 && <Link className="rounded-full border px-5 py-2 text-sm font-medium" href={qs({ page: String(f.page - 1) })}>{t('common.previous')}</Link>}
            <span className="text-sm text-neutral-600">{t('common.page', { n: f.page, total: pages })}</span>
            {f.page < pages && <Link className="rounded-full border px-5 py-2 text-sm font-medium" href={qs({ page: String(f.page + 1) })}>{t('common.next')}</Link>}
          </nav>
        )}
      </main>
    </>
  );
}
