import Link from 'next/link';
import { TOURISM_CATEGORIES } from '@soutra/shared';
import { listDestinations, listTrips } from '@/lib/tourism';
import { listActivities } from '@/lib/activities';
import { SearchBar } from './SearchBar';
import { DestinationCardView, TripCardView, ActivityCardView } from './Cards';

const HERO_IMG = 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1920&q=70';

/** Hero + catégories + destinations/voyages à la une de la page d'accueil V2. */
export async function HomeTourism() {
  const [destinations, trips, acts] = await Promise.all([
    listDestinations({ featured: true, limit: 8 }),
    listTrips({ scope: 'national', limit: 3 }),
    listActivities({ limit: 4, sort: 'popular' }),
  ]);
  return (
    <>
      <section className="relative flex min-h-[80dvh] items-center bg-dark pb-16 pt-28">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={HERO_IMG} alt="" fetchPriority="high" className="absolute inset-0 h-full w-full object-cover opacity-50" />
        <div className="absolute inset-0 bg-gradient-to-b from-dark/60 via-dark/30 to-dark" />
        <div className="relative mx-auto w-full max-w-4xl px-4 text-center sm:px-6">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary-300">Soutra Playce</p>
          <h1 className="mt-3 font-display text-4xl font-bold leading-tight text-white sm:text-6xl">Découvrez la Côte d&apos;Ivoire autrement</h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-neutral-200">Découvrez, réservez et vivez vos meilleures expériences touristiques.</p>
          <div className="mx-auto mt-8 max-w-3xl text-left"><SearchBar dark /></div>
        </div>
      </section>

      <section aria-labelledby="cats" className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <h2 id="cats" className="font-display text-2xl font-bold text-dark sm:text-3xl">Que voulez-vous vivre ?</h2>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {TOURISM_CATEGORIES.map((c) => (
            <Link key={c.key} href={c.href} className="group relative aspect-[4/3] overflow-hidden rounded-2xl bg-neutral-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.image} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
              <span className="absolute bottom-3 left-3 right-3 text-base font-bold text-white sm:text-lg"><span aria-hidden>{c.emoji}</span> {c.label}</span>
            </Link>
          ))}
        </div>
      </section>

      {destinations.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pb-14 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between"><h2 className="font-display text-2xl font-bold text-dark sm:text-3xl">Destinations à explorer</h2><Link href="/destinations" className="text-sm font-semibold text-primary-600">Tout voir →</Link></div>
          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">{destinations.map((d) => <DestinationCardView key={d.id} destination={d} />)}</div>
        </section>
      )}

      {trips.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pb-14 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between"><h2 className="font-display text-2xl font-bold text-dark sm:text-3xl">🇨🇮 Prochains voyages groupés</h2><Link href="/voyages/nationaux" className="text-sm font-semibold text-primary-600">Tout voir →</Link></div>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{trips.map((t) => <TripCardView key={t.id} trip={t} />)}</div>
        </section>
      )}

      {acts.items.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pb-14 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between"><h2 className="font-display text-2xl font-bold text-dark sm:text-3xl">🎯 Activités à vivre</h2><Link href="/activites" className="text-sm font-semibold text-primary-600">Tout voir →</Link></div>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{acts.items.map((a) => <ActivityCardView key={a.id} activity={a} />)}</div>
        </section>
      )}
    </>
  );
}
