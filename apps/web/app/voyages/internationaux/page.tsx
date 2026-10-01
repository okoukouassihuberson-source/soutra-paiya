import type { Metadata } from 'next';
import { TripListing } from '@/components/tourism/TripListing';

export const revalidate = 120;
export const metadata: Metadata = {
  title: 'Voyages groupés internationaux',
  description: "Voyages groupés depuis la Côte d'Ivoire vers l'Afrique, l'Europe, l'Asie et l'Amérique. Vol, hôtel, visites. Réservez sur Soutra-Playce.",
  alternates: { canonical: '/voyages/internationaux' },
};
export default function Page({ searchParams }: { searchParams: { continent?: string } }) {
  return <TripListing scope="international" continent={searchParams.continent} />;
}
