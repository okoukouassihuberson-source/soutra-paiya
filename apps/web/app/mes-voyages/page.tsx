import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { formatTripDates, formatXOF } from '@soutra/shared';
import { supabaseServer } from '@/lib/supabase-server';
import { listMyTripBookings, BOOKING_STATUS_LABEL } from '@/lib/trip-bookings';
import { TourismNav } from '@/components/tourism/TourismNav';

export const metadata: Metadata = { title: 'Mes voyages', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function MyTripsPage() {
  const { data: { user } } = await supabaseServer().auth.getUser();
  if (!user) redirect('/login');
  const bookings = await listMyTripBookings(user.id);

  return (
    <>
      <TourismNav />
      <main className="mx-auto max-w-3xl px-4 pb-28 pt-8 sm:px-6">
        <h1 className="font-display text-3xl font-bold">Mes voyages</h1>
        {bookings.length === 0 ? (
          <p className="mt-6 rounded-2xl bg-neutral-50 p-8 text-center text-neutral-600">
            Aucune réservation. <Link className="font-semibold text-primary-600 underline" href="/voyages/nationaux">Découvrir les voyages</Link>
          </p>
        ) : (
          <ul className="mt-6 space-y-3">
            {bookings.map((b) => (
              <li key={b.id}>
                <Link href={`/mes-voyages/${b.id}`} className="block rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-dark">{b.trips?.title ?? 'Voyage'}</p>
                      <p className="text-sm text-neutral-600">{b.trips ? formatTripDates(b.trips.starts_on, b.trips.ends_on) : ''}</p>
                      <p className="mt-1 text-xs text-neutral-500">{b.reference} · {b.participants} participant{b.participants > 1 ? 's' : ''}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-primary-600">{formatXOF(b.total_xof)}</p>
                      <p className="text-xs font-medium text-neutral-600">{BOOKING_STATUS_LABEL[b.status] ?? b.status}</p>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
