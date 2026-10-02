import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import QRCode from 'qrcode';
import { supabaseServer } from '@/lib/supabase-server';
import { getMyActivityBooking } from '@/lib/activities';
import { TourismNav } from '@/components/tourism/TourismNav';
import { getI18n } from '@/lib/i18n/server';
import { ActivityActions } from './_components/ActivityActions';

export function generateMetadata(): Metadata { return { title: getI18n().t('my.metaActivityBooking'), robots: { index: false } }; }
export const dynamic = 'force-dynamic';
const QR_PREFIX = 'soutra:act:';

export default async function ActivityBookingPage({ params, searchParams }: { params: { id: string }; searchParams: { status?: string } }) {
  const i = getI18n();
  const { t, lp, field } = i;
  const { data: { user } } = await supabaseServer().auth.getUser();
  if (!user) redirect('/login');
  const r = await getMyActivityBooking(user.id, params.id);
  if (!r) notFound();
  const { booking: b, payments, review } = r;
  const a = b.activities;
  const starts = b.activity_slots?.starts_at;

  const ticketReady = b.status === 'paid' || b.status === 'confirmed' || b.status === 'used';
  // QR généré localement : le jeton de scan est un secret, jamais envoyé à un service tiers.
  const qr = ticketReady ? await QRCode.toDataURL(`${QR_PREFIX}${b.qr_token}`, { margin: 1, width: 280, errorCorrectionLevel: 'M' }) : null;
  const expired = b.status === 'pending' && b.paid_xof === 0 && !!b.expires_at && new Date(b.expires_at) < new Date();
  const canReview = !review && (b.status === 'used' || (b.status === 'paid' && !!starts && new Date(starts) < new Date()));

  const banner = searchParams.status === 'success' ? { ok: true, text: t('my.bannerSuccess') }
    : searchParams.status === 'pending' ? { ok: true, text: t('my.bannerPending') }
    : searchParams.status === 'failed' ? { ok: false, text: t('my.bannerFailed') } : null;
  const when = starts ? new Date(starts).toLocaleString(i.intl, { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Abidjan' }) : '';

  return (
    <>
      <TourismNav />
      <main className="mx-auto max-w-2xl space-y-6 px-4 pb-28 pt-8 sm:px-6">
        <Link href={lp('/mes-activites')} className="text-sm font-medium text-primary-600">{t('my.backActivities')}</Link>
        {banner && <p role="status" className={`rounded-xl p-3 text-sm ${banner.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{banner.text}</p>}

        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-primary-600">{i.tdyn('bookingStatus', b.status, b.status)}</p>
          <h1 className="mt-1 font-display text-2xl font-bold">{(a && field(a as any, 'title')) ?? a?.title ?? t('nav.activities')}</h1>
          {starts && <p className="text-neutral-600">{when}{a ? ` · ${i.fmtDuration(a.duration_minutes)}` : ''}</p>}
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-neutral-500">{t('my.reference')}</dt><dd className="font-mono font-semibold">{b.reference}</dd></div>
            <div><dt className="text-neutral-500">{t('my.participants')}</dt><dd className="font-semibold">{b.participants}</dd></div>
            {a?.address || a?.city ? <div className="col-span-2"><dt className="text-neutral-500">{t('my.place')}</dt><dd className="font-semibold">{[a?.address, a?.city].filter(Boolean).join(', ')}</dd></div> : null}
            {Number(b.discount_xof) > 0 && <div><dt className="text-neutral-500">{t('promo.discount')}</dt><dd className="font-semibold text-success">−{i.fmtXOF(Number(b.discount_xof))}{b.promo_code ? ` (${b.promo_code})` : ''}</dd></div>}
            <div><dt className="text-neutral-500">{t('my.amount')}</dt><dd className="font-semibold">{i.fmtXOF(b.paid_xof)} / {i.fmtXOF(b.total_xof)}</dd></div>
          </dl>
          {a && <Link className="mt-3 inline-block text-sm font-semibold text-primary-600 underline" href={lp(`/activites/${a.slug}`)}>{t('my.viewActivity')}</Link>}
        </section>

        {qr && (
          <section className="rounded-2xl border border-neutral-200 bg-white p-5 text-center shadow-sm">
            <h2 className="font-display text-lg font-bold">{t('my.ticket')}</h2>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt={t('my.ticketAlt')} width={240} height={240} className="mx-auto my-3" />
            <p className="text-sm text-neutral-600">{b.status === 'used' ? t('my.ticketUsed', { date: new Date(b.used_at!).toLocaleString(i.intl) }) : t('my.ticketHintActivity')}</p>
          </section>
        )}

        {b.status === 'pending' && !expired && b.paid_xof === 0 && <ActivityActions mode="pay" bookingId={b.id} total={b.total_xof} expiresAt={b.expires_at} />}
        {expired && <p className="rounded-xl bg-neutral-100 p-4 text-sm">{t('my.expiredActivity')}</p>}
        {canReview && <ActivityActions mode="review" bookingId={b.id} />}
        {review && <section className="rounded-2xl border border-neutral-200 bg-white p-5 text-sm shadow-sm"><b>{t('my.yourReview')}</b> : <span className="text-amber-600">{'★'.repeat(review.rating)}</span>{review.comment ? ` — ${review.comment}` : ''}</section>}

        {payments.length > 0 && (
          <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <h2 className="font-display text-lg font-bold">{t('my.payments')}</h2>
            <ul className="mt-3 divide-y text-sm">{payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2"><span>{t('my.payment')}<br /><span className="font-mono text-xs text-neutral-500">{p.receipt_number} · {new Date(p.created_at).toLocaleDateString(i.intl)}</span></span><b>{i.fmtXOF(p.amount_xof)}</b></li>
            ))}</ul>
          </section>
        )}
      </main>
    </>
  );
}
