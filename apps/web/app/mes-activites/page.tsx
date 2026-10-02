import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { formatSlot, formatXOF } from '@soutra/shared';
import { supabaseServer } from '@/lib/supabase-server';
import { listMyActivityBookings } from '@/lib/activities';
import { BOOKING_STATUS_LABEL } from '@/lib/trip-bookings';
import { TourismNav } from '@/components/tourism/TourismNav';

export const metadata: Metadata = { title: 'Mes activités', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function MyActivitiesPage() {
  const { data: { user } } = await supabaseServer().auth.getUser();
  if (!user) redirect('/login');
  const bookings = await listMyActivityBookings(user.id);
  return (
    <>
      <TourismNav />
      <main className="mx-auto max-w-3xl px-4 pb-28 pt-8 sm:px-6">
        <h1 className="font-display text-3xl font-bold">Mes activités</h1>
        <nav className="mt-2 flex gap-4 text-sm"><Link className="text-primary-600 underline" href="/mes-voyages">Mes voyages</Link></nav>
        {bookings.length === 0 ? (
          <p className="mt-6 rounded-2xl bg-neutral-50 p-8 text-center text-neutral-600">Aucune réservation. <Link className="font-semibold text-primary-600 underline" href="/activites">Découvrir les activités</Link></p>
        ) : (
          <ul className="mt-6 space-y-3">
            {bookings.map((b) => (
              <li key={b.id}>
                <Link href={`/mes-activites/${b.id}`} className="block rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-dark">{b.activities?.title ?? 'Activité'}</p>
                      <p className="text-sm text-neutral-600">{b.activity_slots ? formatSlot(b.activity_slots.starts_at) : ''}</p>
                      <p className="mt-1 text-xs text-neutral-500">{b.reference} · {b.participants} participant{b.participants > 1 ? 's' : ''}</p>
                    </div>
                    <div className="text-right"><p className="font-bold text-primary-600">{formatXOF(b.total_xof)}</p><p className="text-xs font-medium text-neutral-600">{BOOKING_STATUS_LABEL[b.status] ?? b.status}</p></div>
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
