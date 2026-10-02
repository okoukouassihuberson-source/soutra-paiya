import type { Metadata } from 'next';
import { TourismNav } from '@/components/tourism/TourismNav';
import { OfferCard } from '@/components/tourism/Offers';
import { getI18n } from '@/lib/i18n/server';
import { languageAlternates } from '@/lib/i18n/seo';
import { listPublicOffers } from '@/lib/offers';

export const revalidate = 120;
export function generateMetadata(): Metadata {
  const { t, locale } = getI18n();
  return { title: t('offers.metaTitle'), description: t('offers.metaDesc'), alternates: languageAlternates('/promotions', locale) };
}

export default async function PromotionsPage() {
  const { t } = getI18n();
  const offers = await listPublicOffers(60);
  return (
    <>
      <TourismNav />
      <main className="mx-auto max-w-7xl px-4 pb-28 pt-8 sm:px-6 lg:px-8">
        <h1 className="font-display text-3xl font-bold">🏷️ {t('offers.title')}</h1>
        <p className="mt-2 max-w-2xl text-neutral-600">{t('offers.intro')}</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {offers.map((o) => <OfferCard key={o.id} offer={o} withTarget />)}
        </div>
        {offers.length === 0 && <p className="mt-8 text-neutral-600">{t('offers.empty')}</p>}
      </main>
    </>
  );
}
