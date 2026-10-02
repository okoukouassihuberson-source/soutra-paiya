import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { supabaseServer } from '@/lib/supabase-server';
import { listMyActivityBookings } from '@/lib/activities';
import { getI18n } from '@/lib/i18n/server';
import { TourismNav } from '@/components/tourism/TourismNav';

export function generateMetadata(): Metadata { return { title: getI18n().t('my.metaActivities'), robots: { index: false } }; }
export const dynamic = 'force-dynamic';

export default async function MyActivitiesPage() {
  const i = getI18n();
  const { t, tn, lp } = i;
  const { data: { user } } = await supabaseServer().auth.getUser();
  if (!user) redirect('/login');
  const bookings = await listMyActivityBookings(user.id);
  return (
    <>
      <TourismNav />
      <main className="mx-auto max-w-3xl px-4 pb-28 pt-8 sm:px-6">
        <h1 className="font-display text-3xl font-bold">{t('my.activitiesTitle')}</h1>
        <nav className="mt-2 flex gap-4 text-sm"><Link className="text-primary-600 underline" href={lp('/mes-voyages')}>{t('my.tripsTitle')}</Link></nav>
        {bookings.length === 0 ? (
          <p className="mt-6 rounded-2xl bg-neutral-50 p-8 text-center text-neutral-600">{t('my.emptyTrips')}<Link className="font-semibold text-primary-600 underline" href={lp('/activites')}>{t('my.discoverActivities')}</Link></p>
        ) : (
          <ul className="mt-6 space-y-3">
            {bookings.map((b) => (
              <li key={b.id}>
                <Link href={lp(`/mes-activites/${b.id}`)} className="block rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-dark">{(b.activities && i.field(b.activities as any, 'title')) ?? b.activities?.title ?? t('nav.activities')}</p>
                      <p className="text-sm text-neutral-600">{b.activity_slots ? new Date(b.activity_slots.starts_at).toLocaleString(i.intl, { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Abidjan' }) : ''}</p>
                      <p className="mt-1 text-xs text-neutral-500">{tn('my.participants', b.participants, { ref: b.reference })}</p>
                    </div>
                    <div className="text-right"><p className="font-bold text-primary-600">{i.fmtXOF(b.total_xof)}</p><p className="text-xs font-medium text-neutral-600">{i.tdyn('bookingStatus', b.status, b.status)}</p></div>
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
