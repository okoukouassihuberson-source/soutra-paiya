'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { ActivitySlot } from '@soutra/shared';
import { useI18n } from '@/lib/i18n/client';
import { supabaseBrowser } from '@/lib/supabase';
import { PriceSummary, PromoField, usePricePreview } from '@/components/tourism/Promo';

export function ActivityBooking({ slots, basePrice, maxGroup, minAge }: {
  slots: ActivitySlot[]; basePrice: number; maxGroup: number; minAge: number;
}) {
  const { t, lp, intl, fmtXOF } = useI18n();
  const slotFmt = (iso: string) => new Date(iso).toLocaleString(intl, { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Abidjan' });
  const [slotId, setSlotId] = useState(slots[0]?.id ?? '');
  const [n, setN] = useState(1);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; id?: string } | null>(null);

  const [code, setCode] = useState('');
  const preview = usePricePreview('activity', slotId || null, n, null, code);
  const slot = slots.find((s) => s.id === slotId);
  const left = slot ? slot.capacity - slot.booked : 0;
  const maxN = Math.max(1, Math.min(maxGroup, left));
  const unit = slot?.price_xof ?? basePrice;

  // Créneaux regroupés par jour pour une lecture rapide sur mobile.
  const byDay = useMemo(() => {
    const m = new Map<string, ActivitySlot[]>();
    slots.forEach((s) => {
      const d = new Date(s.starts_at).toLocaleDateString(intl, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Abidjan' });
      m.set(d, [...(m.get(d) ?? []), s]);
    });
    return [...m.entries()];
  }, [slots]);

  if (slots.length === 0) {
    return <p className="rounded-2xl bg-neutral-100 p-5 text-center text-sm font-medium">{t('act.noSlots')}</p>;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const sb = supabaseBrowser() as any;
    const { data: s } = await sb.auth.getSession();
    if (!s.session) { setMsg({ ok: false, text: 'login' }); setBusy(false); return; }
    const { data, error } = await sb.rpc('create_activity_booking', { p_slot_id: slotId, p_participants: n, p_phone: phone || null, p_notes: null, p_promo_code: code.trim() || null });
    setBusy(false);
    if (!error && data?.error) { setMsg({ ok: false, text: t(`promo.err.${data.error}` as 'promo.err.generic') }); return; }   // échec de code : renvoyé en { error } (compteur anti-devinette)
    if (error) {
      const promo = String(error.message ?? '').match(/PROMO_[A-Z_]+/)?.[0];
      if (promo) { setMsg({ ok: false, text: t(`promo.err.${promo}` as 'promo.err.generic') }); return; }
      const known = ['NOT_AUTHENTICATED', 'NOT_ENOUGH_SEATS', 'SLOT_CLOSED', 'GROUP_TOO_LARGE', 'ACTIVITY_NOT_AVAILABLE', 'INVALID_PARTICIPANTS'].find((k) => error.message?.includes(k));
      setMsg({ ok: false, text: known ? t(`act.err.${known}` as 'act.err.SLOT_CLOSED') : t('act.err.generic') });
      return;
    }
    setMsg({ ok: true, id: data.id, text: t('act.created', { ref: data.reference, total: fmtXOF(data.total_xof) }) });
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <fieldset className="space-y-3">
        <legend className="mb-1 text-sm font-semibold">{t('act.chooseSlot')}</legend>
        {byDay.map(([day, list]) => (
          <div key={day}>
            <p className="mb-1 text-xs font-semibold capitalize text-neutral-500">{day}</p>
            <div className="flex flex-wrap gap-2">
              {list.map((s) => {
                const rest = s.capacity - s.booked;
                return (
                  <label key={s.id} className="cursor-pointer">
                    <input type="radio" name="slot" className="peer sr-only" checked={slotId === s.id} onChange={() => { setSlotId(s.id); setN(1); }} />
                    <span className="inline-block rounded-xl border border-neutral-300 px-3 py-2 text-sm peer-checked:border-primary-500 peer-checked:bg-primary-500 peer-checked:text-white peer-focus-visible:ring-2">
                      {new Date(s.starts_at).toLocaleTimeString(intl, { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Abidjan' })}
                      <span className="ml-1 text-xs opacity-80">· {t('act.seatsAbbr', { n: rest })}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </fieldset>
      <label className="block text-sm font-semibold">{t('common.participants')}
        <input type="number" min={1} max={maxN} value={n} onChange={(e) => setN(Math.max(1, Math.min(maxN, Number(e.target.value) || 1)))} className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2" />
      </label>
      {minAge > 0 && <p className="text-xs text-neutral-500">{t('act.minAgeNote', { n: minAge })}</p>}
      <label className="block text-sm font-semibold">{t('common.phone')}
        <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2" />
      </label>
      <PromoField value={code} onChange={setCode} preview={preview} />
      <PriceSummary preview={preview} fallback={unit * n} label={slot ? slotFmt(slot.starts_at) : ''} />
      <button disabled={busy || !slot} className="w-full rounded-xl bg-primary-500 py-3 font-semibold text-white hover:bg-primary-600 disabled:opacity-60">{busy ? t('act.booking') : t('act.book')}</button>
      {msg && (msg.text === 'login'
        ? <p className="text-sm text-danger">{t('booking.loginPrompt')}<Link className="underline" href="/login">{t('common.signIn')}</Link></p>
        : <p role="status" className={`text-sm ${msg.ok ? 'text-success' : 'text-danger'}`}>{msg.text}</p>)}
      {msg?.id && <Link href={lp(`/mes-activites/${msg.id}`)} className="block rounded-xl bg-emerald-600 py-3 text-center font-semibold text-white">{t('booking.payAndTicket')}</Link>}
    </form>
  );
}
