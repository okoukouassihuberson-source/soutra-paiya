'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { TripPackage } from '@soutra/shared';
import { useI18n } from '@/lib/i18n/client';
import { supabaseBrowser } from '@/lib/supabase';

export function BookingForm({ tripId, basePrice, packages, seatsLeft, cta }: {
  tripId: string; basePrice: number; packages: TripPackage[]; seatsLeft: number; cta: string;
}) {
  const { t, lp, fmtXOF, field } = useI18n();
  const [pkg, setPkg] = useState<string>(packages[0]?.id ?? '');
  const [n, setN] = useState(1);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);

  const unit = packages.find((p) => p.id === pkg)?.price_xof ?? basePrice;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const sb = supabaseBrowser() as any;
    const { data: s } = await sb.auth.getSession();
    if (!s.session) { setMsg({ ok: false, text: 'login' }); setBusy(false); return; }
    const { data, error } = await sb.rpc('create_trip_booking', {
      p_trip_id: tripId, p_participants: n, p_package_id: pkg || null, p_phone: phone || null, p_notes: null,
    });
    setBusy(false);
    if (error) {
      const code = ['NOT_AUTHENTICATED', 'NOT_ENOUGH_SEATS', 'TRIP_NOT_AVAILABLE', 'TRIP_ALREADY_STARTED', 'PACKAGE_NOT_FOUND', 'INVALID_PARTICIPANTS'].find((k) => error.message?.includes(k));
      setMsg({ ok: false, text: code ? t(`booking.err.${code}` as 'booking.err.NOT_ENOUGH_SEATS') : t('booking.err.generic') });
      return;
    }
    setMsg({ ok: true, text: t('booking.created', { ref: data.reference, total: fmtXOF(data.total_xof) }) });
    setBookingId(data.id);
  }

  if (seatsLeft === 0) return <p className="rounded-xl bg-neutral-100 p-4 text-center font-semibold">{t('booking.full')}</p>;

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      {packages.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-semibold">{t('booking.formula')}</legend>
          {packages.map((p) => (
            <label key={p.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${pkg === p.id ? 'border-primary-500 bg-primary-50' : 'border-neutral-200'}`}>
              <input type="radio" name="pkg" checked={pkg === p.id} onChange={() => setPkg(p.id)} className="mt-1" />
              <span className="flex-1 text-sm"><b>{field(p as any, 'name') ?? p.name}</b><br /><span className="text-neutral-600">{p.includes.join(' + ')}</span></span>
              <b className="text-sm">{fmtXOF(p.price_xof)}</b>
            </label>
          ))}
        </fieldset>
      )}
      <label className="block text-sm font-semibold">{t('booking.participants')}
        <input type="number" min={1} max={Math.min(50, seatsLeft)} value={n}
               onChange={(e) => setN(Math.max(1, Math.min(Math.min(50, seatsLeft), Number(e.target.value) || 1)))}
               className="mt-1 w-full rounded-xl border border-neutral-300" />
      </label>
      <label className="block text-sm font-semibold">{t('booking.phone')}
        <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 w-full rounded-xl border border-neutral-300" />
      </label>
      <div className="flex items-center justify-between border-t pt-3">
        <span className="text-sm text-neutral-600">{t('booking.total')}</span>
        <span className="text-xl font-bold text-primary-600">{fmtXOF(unit * n)}</span>
      </div>
      <button disabled={busy} className="w-full rounded-xl bg-primary-500 py-3 font-semibold text-white hover:bg-primary-600 disabled:opacity-60">
        {busy ? t('booking.booking') : cta}
      </button>
      {msg && (msg.text === 'login'
        ? <p className="text-sm text-danger">{t('booking.loginPrompt')}<Link className="underline" href="/login">{t('common.signIn')}</Link></p>
        : <p role="status" className={`text-sm ${msg.ok ? 'text-success' : 'text-danger'}`}>{msg.text}</p>)}
      {bookingId && <Link href={lp(`/mes-voyages/${bookingId}`)} className="block rounded-xl bg-emerald-600 py-3 text-center font-semibold text-white">{t('booking.payAndTicket')}</Link>}
    </form>
  );
}
