'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n/client';

type Props = { mode: 'pay'; bookingId: string; total: number; expiresAt: string | null } | { mode: 'review'; bookingId: string };

export function ActivityActions(props: Props) {
  const router = useRouter();
  const { t, fmtXOF, intl } = useI18n();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');

  async function pay() {
    setBusy('pay'); setErr(null);
    const { data, error } = await (supabaseBrowser().functions as any).invoke('geniuspay-pay-activity', { body: { booking_id: props.bookingId } });
    if (error || !data?.checkout_url) {
      setErr(data?.reason === 'EXPIRED' ? t('pay.errExpired') : t('pay.errStart'));
      setBusy(null);
      return;
    }
    window.location.href = data.checkout_url;
  }

  async function cancel() {
    if (!window.confirm(t('pay.confirmCancel'))) return;
    setBusy('cancel'); setErr(null);
    const { error } = await (supabaseBrowser() as any).rpc('cancel_activity_booking', { p_booking_id: props.bookingId });
    setBusy(null);
    if (error) { setErr(error.message?.includes('REFUND_REQUIRED') ? t('pay.errRefund') : t('pay.errCancel')); return; }
    router.refresh();
  }

  async function review(e: React.FormEvent) {
    e.preventDefault();
    setBusy('review'); setErr(null);
    const { error } = await (supabaseBrowser() as any).rpc('submit_activity_review', { p_booking_id: props.bookingId, p_rating: rating, p_comment: comment || null });
    setBusy(null);
    if (error) { setErr(error.message?.includes('ALREADY_REVIEWED') ? t('review.already') : t('review.error')); return; }
    router.refresh();
  }

  if (props.mode === 'pay') {
    const before = props.expiresAt ? new Date(props.expiresAt).toLocaleTimeString(intl, { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Abidjan' }) : null;
    return (
      <section className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="font-display text-lg font-bold">{t('pay.title')}</h2>
        <button disabled={!!busy} onClick={pay} className="w-full rounded-xl bg-primary-500 py-3 font-semibold text-white hover:bg-primary-600 disabled:opacity-60">
          {busy === 'pay' ? t('pay.redirecting') : t('pay.amount', { amount: fmtXOF(props.total) })}
        </button>
        <p className="text-xs text-neutral-500">{t('pay.secure')}{before ? t('pay.before', { time: before }) : ''}</p>
        <button disabled={!!busy} onClick={cancel} className="w-full text-sm font-medium text-neutral-500 underline">{t('pay.cancel')}</button>
        {err && <p role="alert" className="text-sm text-danger">{err}</p>}
      </section>
    );
  }
  return (
    <form onSubmit={review} className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="font-display text-lg font-bold">{t('review.title')}</h2>
      <div role="radiogroup" aria-label={t('review.rating')} className="flex gap-1 text-3xl">
        {[1, 2, 3, 4, 5].map((n) => (
          <button type="button" key={n} role="radio" aria-checked={rating === n} aria-label={t('act.ratingAria', { n })} onClick={() => setRating(n)} className={n <= rating ? 'text-amber-500' : 'text-neutral-300'}>★</button>
        ))}
      </div>
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} rows={3} placeholder={t('review.placeholder')} className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm" />
      <button disabled={!!busy} className="rounded-xl bg-dark px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">{busy === 'review' ? t('review.sending') : t('review.submit')}</button>
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
    </form>
  );
}
