'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { formatSlot, formatXOF, type ActivitySlot } from '@soutra/shared';
import { supabaseBrowser } from '@/lib/supabase';

const ERRORS: Record<string, string> = {
  NOT_AUTHENTICATED: 'Connectez-vous pour réserver.',
  NOT_ENOUGH_SEATS: "Il n'y a plus assez de places sur ce créneau.",
  SLOT_CLOSED: 'Ce créneau n’est plus réservable (moins d’une heure avant le départ).',
  GROUP_TOO_LARGE: 'Groupe trop grand pour une même réservation.',
  ACTIVITY_NOT_AVAILABLE: "Cette activité n'est plus disponible.",
  INVALID_PARTICIPANTS: 'Nombre de participants invalide.',
};

export function ActivityBooking({ slots, basePrice, maxGroup, minAge }: {
  slots: ActivitySlot[]; basePrice: number; maxGroup: number; minAge: number;
}) {
  const [slotId, setSlotId] = useState(slots[0]?.id ?? '');
  const [n, setN] = useState(1);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; id?: string } | null>(null);

  const slot = slots.find((s) => s.id === slotId);
  const left = slot ? slot.capacity - slot.booked : 0;
  const maxN = Math.max(1, Math.min(maxGroup, left));
  const unit = slot?.price_xof ?? basePrice;

  // Créneaux regroupés par jour pour une lecture rapide sur mobile.
  const byDay = useMemo(() => {
    const m = new Map<string, ActivitySlot[]>();
    slots.forEach((s) => {
      const d = new Date(s.starts_at).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Abidjan' });
      m.set(d, [...(m.get(d) ?? []), s]);
    });
    return [...m.entries()];
  }, [slots]);

  if (slots.length === 0) {
    return <p className="rounded-2xl bg-neutral-100 p-5 text-center text-sm font-medium">Aucun créneau disponible pour le moment. Revenez bientôt !</p>;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const sb = supabaseBrowser() as any;
    const { data: s } = await sb.auth.getSession();
    if (!s.session) { setMsg({ ok: false, text: 'login' }); setBusy(false); return; }
    const { data, error } = await sb.rpc('create_activity_booking', { p_slot_id: slotId, p_participants: n, p_phone: phone || null, p_notes: null });
    setBusy(false);
    if (error) {
      const code = Object.keys(ERRORS).find((k) => error.message?.includes(k));
      setMsg({ ok: false, text: code ? ERRORS[code] : 'Réservation impossible, réessayez.' });
      return;
    }
    setMsg({ ok: true, id: data.id, text: `Réservation ${data.reference} enregistrée (${formatXOF(data.total_xof)}). Payez dans l’heure pour garantir vos places.` });
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <fieldset className="space-y-3">
        <legend className="mb-1 text-sm font-semibold">Choisissez un créneau</legend>
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
                      {new Date(s.starts_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Abidjan' })}
                      <span className="ml-1 text-xs opacity-80">· {rest} pl.</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </fieldset>
      <label className="block text-sm font-semibold">Participants
        <input type="number" min={1} max={maxN} value={n} onChange={(e) => setN(Math.max(1, Math.min(maxN, Number(e.target.value) || 1)))} className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2" />
      </label>
      {minAge > 0 && <p className="text-xs text-neutral-500">Âge minimum : {minAge} ans.</p>}
      <label className="block text-sm font-semibold">Téléphone (optionnel)
        <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2" />
      </label>
      <div className="flex items-center justify-between border-t pt-3">
        <span className="text-sm text-neutral-600">{slot ? formatSlot(slot.starts_at) : ''}</span>
        <span className="text-xl font-bold text-primary-600">{formatXOF(unit * n)}</span>
      </div>
      <button disabled={busy || !slot} className="w-full rounded-xl bg-primary-500 py-3 font-semibold text-white hover:bg-primary-600 disabled:opacity-60">{busy ? 'Réservation…' : 'Réserver'}</button>
      {msg && (msg.text === 'login'
        ? <p className="text-sm text-danger">Connectez-vous pour réserver : <Link className="underline" href="/login">Se connecter</Link></p>
        : <p role="status" className={`text-sm ${msg.ok ? 'text-success' : 'text-danger'}`}>{msg.text}</p>)}
      {msg?.id && <Link href={`/mes-activites/${msg.id}`} className="block rounded-xl bg-emerald-600 py-3 text-center font-semibold text-white">Payer et obtenir mon billet →</Link>}
    </form>
  );
}
