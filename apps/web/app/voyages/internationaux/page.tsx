import type { Metadata } from 'next';
import { TripListing } from '@/components/tourism/TripListing';
import { getI18n } from '@/lib/i18n/server';
import { languageAlternates } from '@/lib/i18n/seo';

export const revalidate = 120;

export function generateMetadata(): Metadata {
  const { t, locale } = getI18n();
  return { title: t('trips.internationalMetaTitle'), description: t('trips.internationalMetaDescription'), alternates: languageAlternates('/voyages/internationaux', locale) };
}

export default function Page({ searchParams }: { searchParams: { continent?: string } }) {
  return <TripListing scope="international" continent={searchParams.continent} />;
}
