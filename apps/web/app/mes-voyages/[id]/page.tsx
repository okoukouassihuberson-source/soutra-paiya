import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import QRCode from 'qrcode';
import { formatTripDates } from '@soutra/shared';
import { supabaseServer } from '@/lib/supabase-server';
import { getMyTripBooking, QR_PREFIX } from '@/lib/trip-bookings';
import { TourismNav } from '@/components/tourism/TourismNav';
import { getI18n } from '@/lib/i18n/server';
import { BookingActions } from './_components/BookingActions';

export function generateMetadata(): Metadata { return { title: getI18n().t('my.metaTripBooking'), robots: { index: false } }; }
export const dynamic = 'force-dynamic';

export default async function BookingPage({ params, searchParams }: { params: { id: string }; searchParams: { status?: string } }) {
  const i = getI18n();
  const { t, lp, field } = i;
  const { data: { user } } = await supabaseServer().auth.getUser();
  if (!user) redirect('/login');
  const r = await getMyTripBooking(user.id, params.id);
  if (!r) notFound();
  const { booking: b, payments } = r;
  const tr = b.trips;

  const ticketReady = b.status === 'paid' || b.status === 'confirmed' || b.status === 'used';
  // QR généré localement (le jeton de scan est un secret : jamais envoyé à un service tiers).
  const qr = ticketReady
    ? await QRCode.toDataURL(`${QR_PREFIX}${b.qr_token}`, { margin: 1, width: 280, errorCorrectionLevel: 'M' })
    : null;
  const due = b.total_xof - b.paid_xof;
  const depositPct = tr?.deposit_pct ?? 100;
  const depositAmount = Math.ceil((b.total_xof * depositPct) / 100);
  const expired = b.status === 'pending' && b.paid_xof === 0 && b.expires_at && new Date(b.expires_at) < new Date();

  const banner = searchParams.status === 'success' ? { ok: true, text: t('my.bannerSuccess') }
    : searchParams.status === 'pending' ? { ok: true, text: t('my.bannerPending') }
    : searchParams.status === 'failed' ? { ok: false, text: t('my.bannerFailed') } : null;

  return (
    <>
      <TourismNav />
      <main className="mx-auto max-w-2xl space-y-6 px-4 pb-28 pt-8 sm:px-6">
        <Link href={lp('/mes-voyages')} className="text-sm font-medium text-primary-600">{t('my.back')}</Link>
        {banner && <p role="status" className={`rounded-xl p-3 text-sm ${banner.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{banner.text}</p>}

        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-primary-600">{i.tdyn('bookingStatus', b.status, b.status)}</p>
          <h1 className="mt-1 font-display text-2xl font-bold">{(tr && field(tr as any, 'title')) ?? tr?.title ?? t('nav.trips')}</h1>
          {tr && <p className="text-neutral-600">{formatTripDates(tr.starts_on, tr.ends_on, i.intl)} · {[tr.city, tr.scope === 'national' ? t('common.country') : tr.country].filter(Boolean).join(', ')}</p>}
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-neutral-500">{t('my.reference')}</dt><dd className="font-mono font-semibold">{b.reference}</dd></div>
            <div><dt className="text-neutral-500">{t('my.participants')}</dt><dd className="font-semibold">{b.participants}</dd></div>
            {tr?.departure_point && <div><dt className="text-neutral-500">{t('my.departure')}</dt><dd className="font-semibold">{tr.departure_point}{tr.departure_time ? ` · ${tr.departure_time.slice(0, 5)}` : ''}</dd></div>}
            {Number(b.discount_xof) > 0 && <div><dt className="text-neutral-500">{t('promo.discount')}</dt><dd className="font-semibold text-success">−{i.fmtXOF(Number(b.discount_xof))}{b.promo_code ? ` (${b.promo_code})` : ''}</dd></div>}
            <div><dt className="text-neutral-500">{t('my.amountPaid')}</dt><dd className="font-semibold">{i.fmtXOF(b.paid_xof)} / {i.fmtXOF(b.total_xof)}</dd></div>
          </dl>
          {tr && <Link className="mt-3 inline-block text-sm font-semibold text-primary-600 underline" href={lp(`/voyages/${tr.slug}`)}>{t('my.viewTrip')}</Link>}
        </section>

        {qr && (
          <section className="rounded-2xl border border-neutral-200 bg-white p-5 text-center shadow-sm">
            <h2 className="font-display text-lg font-bold">{t('my.ticket')}</h2>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt={t('my.ticketAlt')} width={240} height={240} className="mx-auto my-3" />
            <p className="text-sm text-neutral-600">{b.status === 'used' ? t('my.ticketUsed', { date: new Date(b.used_at!).toLocaleString(i.intl) }) : t('my.ticketHintTrip')}</p>
            {due > 0 && <p className="mt-2 text-sm font-semibold text-amber-700">{t('my.balanceDue', { amount: i.fmtXOF(due) })}</p>}
          </section>
        )}

        {b.status !== 'cancelled' && b.status !== 'used' && !expired && due > 0 && (
          <BookingActions bookingId={b.id} due={due} paid={b.paid_xof} depositAmount={depositAmount} depositPct={depositPct} total={b.total_xof} />
        )}
        {expired && <p className="rounded-xl bg-neutral-100 p-4 text-sm">{t('my.expiredTrip')}</p>}

        {payments.length > 0 && (
          <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <h2 className="font-display text-lg font-bold">{t('my.payments')}</h2>
            <ul className="mt-3 divide-y text-sm">
              {payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2">
                  <span>{i.tdyn('my.kind', p.kind, p.kind)}<br /><span className="font-mono text-xs text-neutral-500">{p.receipt_number} · {new Date(p.created_at).toLocaleDateString(i.intl)}</span></span>
                  <b>{i.fmtXOF(p.amount_xof)}</b>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}
