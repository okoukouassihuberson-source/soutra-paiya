import type { Metadata } from 'next';
import { TripListing } from '@/components/tourism/TripListing';

export const revalidate = 120;
export const metadata: Metadata = {
  title: "Voyages groupés en Côte d'Ivoire",
  description: "Voyages groupés nationaux : Assinie, Grand-Bassam, San Pedro, Korhogo, Man… Transport, hébergement et activités. Réservez sur Soutra-Playce.",
  alternates: { canonical: '/voyages/nationaux' },
};
export default function Page() { return <TripListing scope="national" />; }
