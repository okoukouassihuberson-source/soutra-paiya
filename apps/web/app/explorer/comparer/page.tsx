import type { Metadata } from 'next';
import Link from 'next/link';
import { categoryEmoji } from '@soutra/shared';
import { listVenuesBySlugs } from '@/lib/tourism';
import { EXPLORER_AMENITIES } from '@/lib/explorer-options';
import { getI18n } from '@/lib/i18n/server';
import { TourismNav } from '@/components/tourism/TourismNav';
import { CompareSync, CopyLink } from '@/components/tourism/CompareUi';

export const dynamic = 'force-dynamic';

type SP = Record<string, string | string[] | undefined>;
const parse = (sp: SP) => {
  const raw = Array.isArray(sp.s) ? sp.s[0] : sp.s;
  return [...new Set((raw ?? '').split(',').map((x) => x.trim()).filter((x) => /^[a-z0-9-]{1,120}$/i.test(x)))].slice(0, 3);
};
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export function generateMetadata(): Metadata {
  const { t } = getI18n();
  return { title: t('cmpv.metaTitle'), description: t('cmpv.metaDescription'), robots: { index: false, follow: true } };
}

export default async function CompareVenuesPage({ searchParams }: { searchParams: SP }) {
  const i = getI18n();
  const { t, lp, tdyn, fmtXOF } = i;
  const slugs = parse(searchParams);
  const venues = await listVenuesBySlugs(slugs);
  const multi = venues.length >= 2;
  const today = DAYS[new Date().getUTCDay()];   // fuseau Abidjan = UTC
  const equipped = venues.map((v) => (v.amenities ?? []).filter((a) => EXPLORER_AMENITIES.some((x) => x.key === a)).length);
  const maxEq = Math.max(...equipped);
  const rated = venues.map((v) => ((v.rating_count ?? 0) > 0 ? Number(v.rating_avg) : -1));
  const maxRating = Math.max(...rated);
  const prices = venues.map((v) => v.avg_price_xof ?? Infinity);
  const minPrice = Math.min(...prices);
  const without = (slug: string) => lp(`/explorer/comparer?s=${venues.filter((x) => x.slug !== slug).map((x) => x.slug).join(',')}`);

  const rows: { label: string; cell: (k: number) => React.ReactNode }[] = [
    { label: t('cmpv.rowCategory'), cell: (k) => `${categoryEmoji(venues[k].category as any)} ${tdyn('venueCat', venues[k].category, venues[k].category)}` },
    { label: t('cmpv.rowArea'), cell: (k) => [venues[k].district, venues[k].city].filter(Boolean).join(', ') || null },
    { label: t('cmpv.rowRating'), cell: (k) => rated[k] < 0 ? <span className="text-neutral-600">{t('cmpv.noReviews')}</span> : (
      <><b className="text-amber-700">★ {rated[k].toFixed(1)}</b> <span className="text-neutral-600">({venues[k].rating_count})</span>
        {multi && rated[k] === maxRating && rated.some((r) => r !== maxRating) && <Badge>{t('cmpv.bestRated')}</Badge>}</>) },
    { label: t('cmpv.rowPrice'), cell: (k) => venues[k].avg_price_xof ? (
      <><b>~ {fmtXOF(venues[k].avg_price_xof as number)}</b>
        {multi && prices[k] === minPrice && prices.some((p) => p !== minPrice) && <Badge>{t('cmpv.cheapest')}</Badge>}</>) : null },
    { label: t('cmpv.rowToday'), cell: (k) => {
      const h = venues[k].opening_hours;
      if (!h || Object.keys(h).length === 0) return null;
      const d = h[today];
      return d && d[0] ? `${d[0]} – ${d[1]}` : t('cmpv.closedToday');
    } },
    { label: t('cmpv.rowAmenities'), cell: (k) => {
      const have = new Set(venues[k].amenities ?? []);
      return (
        <ul className="space-y-1">
          {EXPLORER_AMENITIES.map((a) => (
            <li key={a.key} className={have.has(a.key) ? 'text-dark' : 'text-neutral-600'}>
              <span aria-hidden>{have.has(a.key) ? '✅' : '➖'}</span>{' '}
              {t(`amenity.${a.key}` as 'amenity.wifi')}
              <span className="sr-only"> : {have.has(a.key) ? t('cmpv.has') : t('cmpv.hasNot')}</span>
            </li>
          ))}
          {multi && equipped[k] === maxEq && maxEq > 0 && equipped.some((e) => e !== maxEq) && <li><Badge>{t('cmpv.mostEquipped')}</Badge></li>}
        </ul>
      );
    } },
    { label: t('cmpv.rowContact'), cell: (k) => {
      const v = venues[k];
      if (!v.phone && !v.whatsapp && !v.website) return null;
      return (
        <span className="flex flex-col gap-1">
          {v.phone && <a className="underline" href={`tel:${v.phone}`}>{v.phone}</a>}
          {v.whatsapp && <a className="underline" href={`https://wa.me/${v.whatsapp.replace(/\D/g, '')}`}>{t('common.whatsapp')}</a>}
        </span>
      );
    } },
  ];

  return (
    <>
      <TourismNav />
      <CompareSync slugs={slugs} kind="venue" />
      <main className="mx-auto max-w-7xl px-4 pb-28 pt-8 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-bold text-dark">{t('cmpv.title')}</h1>
            <p className="mt-2 max-w-2xl text-neutral-600">{t('cmpv.intro')}</p>
          </div>
          {venues.length > 0 && <CopyLink />}
        </div>

        {venues.length === 0 ? (
          <div className="mt-8 rounded-2xl bg-neutral-50 p-8 text-center">
            <p className="text-neutral-700">{t('cmpv.empty')}</p>
            <Link href={lp('/explorer')} className="mt-4 inline-block rounded-full bg-primary-500 px-5 py-2.5 font-bold text-night hover:bg-primary-400">{t('cmpv.browse')}</Link>
          </div>
        ) : (
          <>
            {!multi && <p role="status" className="mt-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{t('cmpv.needMore')} <Link className="font-semibold underline" href={lp('/explorer')}>{t('cmpv.browse')}</Link></p>}
            <div className="relative mt-6 overflow-x-auto rounded-2xl border border-neutral-200 bg-white" tabIndex={0}>
              <table className="w-full min-w-[640px] border-collapse text-left text-sm" aria-label={t('cmpv.tableLabel')}>
                <thead>
                  <tr>
                    <td className="sticky left-0 z-10 w-32 bg-white p-3 sm:w-44" />
                    {venues.map((v) => (
                      <th key={v.id} scope="col" className="min-w-[200px] border-l border-neutral-200 p-3 align-top font-normal">
                        <Link href={`/v/${v.slug}`} className="group block">
                          <span className="block aspect-[4/3] overflow-hidden rounded-xl bg-neutral-100">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            {v.cover_url ? <img src={v.cover_url} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /> : <span aria-hidden className="flex h-full items-center justify-center text-4xl">{categoryEmoji(v.category as any)}</span>}
                          </span>
                          <span className="mt-2 block font-display text-base font-bold leading-snug text-dark group-hover:text-primary-700">{v.name}</span>
                        </Link>
                        <span className="mt-2 flex items-center gap-3 text-xs">
                          <Link href={`/v/${v.slug}`} className="font-semibold text-primary-700 underline">{t('cmpv.view')}</Link>
                          <Link href={without(v.slug)} className="text-neutral-700 underline">{t('cmp.remove')}</Link>
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.label} className="border-t border-neutral-200">
                      <th scope="row" className="sticky left-0 z-10 bg-white p-3 align-top text-xs font-semibold uppercase tracking-wide text-neutral-600">{r.label}</th>
                      {venues.map((v, k) => <td key={v.id} className="border-l border-neutral-200 p-3 align-top text-dark">{r.cell(k) ?? <span className="text-neutral-600">{t('cmp.unknown')}</span>}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </>
  );
}

const Badge = ({ children }: { children: React.ReactNode }) => (
  <span className="ml-2 inline-block whitespace-nowrap rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">{children}</span>
);
