import type { Metadata } from 'next';
import { listDestinations } from '@/lib/tourism';
import { TourismNav } from '@/components/tourism/TourismNav';
import { DestinationCardView } from '@/components/tourism/Cards';

export const revalidate = 300;
export const metadata: Metadata = {
  title: "Destinations en Côte d'Ivoire",
  description: "Explorez Assinie, Grand-Bassam, San Pedro, Man, Korhogo… hôtels, restaurants, plages, activités et voyages par destination.",
  alternates: { canonical: '/destinations' },
};

export default async function DestinationsPage() {
  const list = await listDestinations();
  return (
    <>
      <TourismNav />
      <main className="mx-auto max-w-7xl px-4 pb-28 pt-8 sm:px-6 lg:px-8">
        <h1 className="font-display text-3xl font-bold">Destinations</h1>
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {list.map((d) => <DestinationCardView key={d.id} destination={d} />)}
        </div>
        {list.length === 0 && <p className="mt-8 text-neutral-600">Aucune destination publiée.</p>}
      </main>
    </>
  );
}
