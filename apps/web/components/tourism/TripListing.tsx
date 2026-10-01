import Link from 'next/link';
import { CONTINENTS, type TripScope } from '@soutra/shared';
import { listTrips } from '@/lib/tourism';
import { TourismNav } from './TourismNav';
import { TripCardView } from './Cards';

export async function TripListing({ scope, continent }: { scope: TripScope; continent?: string }) {
  const national = scope === 'national';
  const trips = await listTrips({ scope, continent });
  return (
    <>
      <TourismNav />
      <main className="mx-auto max-w-7xl px-4 pb-28 pt-8 sm:px-6 lg:px-8">
        <h1 className="font-display text-3xl font-bold text-dark">
          {national ? '🇨🇮 Voyages groupés nationaux' : '🌍 Voyages groupés internationaux'}
        </h1>
        <p className="mt-2 max-w-2xl text-neutral-600">
          {national
            ? "Découvrez les régions de Côte d'Ivoire en groupe : transport, hébergement et activités organisés."
            : 'Partez en groupe vers l’Afrique, l’Europe, l’Asie ou l’Amérique avec vol, hôtel et visites inclus.'}
        </p>
        {!national && (
          <div className="mt-5 flex gap-2 overflow-x-auto pb-2">
            <Link href="/voyages/internationaux" className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm ${!continent ? 'border-primary-500 bg-primary-500 text-white' : 'border-neutral-200'}`}>Tous</Link>
            {CONTINENTS.map((c) => (
              <Link key={c.value} href={`/voyages/internationaux?continent=${c.value}`} className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm ${continent === c.value ? 'border-primary-500 bg-primary-500 text-white' : 'border-neutral-200'}`}>{c.label}</Link>
            ))}
          </div>
        )}
        {trips.length === 0 ? (
          <p className="mt-8 rounded-2xl bg-neutral-50 p-8 text-center text-neutral-600">Aucun voyage programmé pour le moment. Revenez bientôt !</p>
        ) : (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{trips.map((t) => <TripCardView key={t.id} trip={t} />)}</div>
        )}
      </main>
    </>
  );
}
