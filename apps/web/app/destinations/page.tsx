import type { Metadata } from 'next';
import { listDestinations } from '@/lib/tourism';
import { TourismNav } from '@/components/tourism/TourismNav';
import { DestinationCardView } from '@/components/tourism/Cards';
import { getI18n } from '@/lib/i18n/server';
import { languageAlternates } from '@/lib/i18n/seo';

export const revalidate = 300;
export function generateMetadata(): Metadata {
  const { t, locale } = getI18n();
  return { title: t('dest.metaTitle'), description: t('dest.metaDescription'), alternates: languageAlternates('/destinations', locale) };
}

export default async function DestinationsPage() {
  const { t } = getI18n();
  const list = await listDestinations();
  return (
    <>
      <TourismNav />
      <main className="mx-auto max-w-7xl px-4 pb-28 pt-8 sm:px-6 lg:px-8">
        <h1 className="font-display text-3xl font-bold">{t('dest.title')}</h1>
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {list.map((d) => <DestinationCardView key={d.id} destination={d} />)}
        </div>
        {list.length === 0 && <p className="mt-8 text-neutral-600">{t('dest.empty')}</p>}
      </main>
    </>
  );
}
