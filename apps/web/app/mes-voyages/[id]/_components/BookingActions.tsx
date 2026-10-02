'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n/client';

export function BookingActions({ bookingId, due, paid, total, depositAmount, depositPct }: {
  bookingId: string; due: number; paid: number; total: number; depositAmount: number; depositPct: number;
}) {
  const router = useRouter();
  const { t, fmtXOF } = useI18n();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function pay(kind: 'deposit' | 'balance' | 'full') {
    setBusy(kind); setErr(null);
    const { data, error } = await (supabaseBrowser().functions as any).invoke('geniuspay-pay-trip', { body: { booking_id: bookingId, kind } });
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
    const { error } = await (supabaseBrowser() as any).rpc('cancel_trip_booking', { p_booking_id: bookingId });
    setBusy(null);
    if (error) { setErr(error.message?.includes('REFUND_REQUIRED') ? t('pay.errRefund') : t('pay.errCancel')); return; }
    router.refresh();
  }

  const btn = 'w-full rounded-xl py-3 font-semibold disabled:opacity-60';
  return (
    <section className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="font-display text-lg font-bold">{t('pay.title')}</h2>
      {paid === 0 ? (
        <>
          <button disabled={!!busy} onClick={() => pay('full')} className={`${btn} bg-primary-500 text-white hover:bg-primary-600`}>
            {busy === 'full' ? t('pay.redirecting') : t('pay.full', { amount: fmtXOF(total) })}
          </button>
          {depositPct < 100 && (
            <button disabled={!!busy} onClick={() => pay('deposit')} className={`${btn} border border-primary-500 text-primary-600`}>
              {busy === 'deposit' ? t('pay.redirecting') : t('pay.deposit', { pct: depositPct, amount: fmtXOF(depositAmount) })}
            </button>
          )}
        </>
      ) : (
        <button disabled={!!busy} onClick={() => pay('balance')} className={`${btn} bg-primary-500 text-white hover:bg-primary-600`}>
          {busy === 'balance' ? t('pay.redirecting') : t('pay.balance', { amount: fmtXOF(due) })}
        </button>
      )}
      <p className="text-xs text-neutral-500">{t('pay.secure')}</p>
      {paid === 0 && <button disabled={!!busy} onClick={cancel} className="w-full text-sm font-medium text-neutral-500 underline">{t('pay.cancel')}</button>}
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
    </section>
  );
}
