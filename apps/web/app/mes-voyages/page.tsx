import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { formatTripDates } from '@soutra/shared';
import { supabaseServer } from '@/lib/supabase-server';
import { listMyTripBookings } from '@/lib/trip-bookings';
import { getI18n } from '@/lib/i18n/server';
import { TourismNav } from '@/components/tourism/TourismNav';

export function generateMetadata(): Metadata { return { title: getI18n().t('my.metaTrips'), robots: { index: false } }; }
export const dynamic = 'force-dynamic';

export default async function MyTripsPage() {
  const i = getI18n();
  const { t, tn, lp } = i;
  const { data: { user } } = await supabaseServer().auth.getUser();
  if (!user) redirect('/login');
  const bookings = await listMyTripBookings(user.id);

  return (
    <>
      <TourismNav />
      <main className="mx-auto max-w-3xl px-4 pb-28 pt-8 sm:px-6">
        <h1 className="font-display text-3xl font-bold">{t('my.tripsTitle')}</h1>
        <nav className="mt-2 flex gap-4 text-sm"><Link className="text-primary-600 underline" href={lp('/mes-activites')}>{t('my.activitiesTitle')}</Link></nav>
        {bookings.length === 0 ? (
          <p className="mt-6 rounded-2xl bg-neutral-50 p-8 text-center text-neutral-600">
            {t('my.emptyTrips')}<Link className="font-semibold text-primary-600 underline" href={lp('/voyages/nationaux')}>{t('my.discoverTrips')}</Link>
          </p>
        ) : (
          <ul className="mt-6 space-y-3">
            {bookings.map((b) => (
              <li key={b.id}>
                <Link href={lp(`/mes-voyages/${b.id}`)} className="block rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-dark">{(b.trips && i.field(b.trips as any, 'title')) ?? b.trips?.title ?? t('nav.trips')}</p>
                      <p className="text-sm text-neutral-600">{b.trips ? formatTripDates(b.trips.starts_on, b.trips.ends_on, i.intl) : ''}</p>
                      <p className="mt-1 text-xs text-neutral-500">{tn('my.participants', b.participants, { ref: b.reference })}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-primary-600">{i.fmtXOF(b.total_xof)}</p>
                      <p className="text-xs font-medium text-neutral-600">{i.tdyn('bookingStatus', b.status, b.status)}</p>
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
