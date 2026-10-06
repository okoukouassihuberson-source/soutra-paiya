'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatSlot, formatXOF, type ActivitySlot } from '@soutra/shared';
import { supabaseBrowser } from '@/lib/supabase';

const input = 'w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-dark';
const MAX_GENERATED = 120;

/** Gestion des créneaux d'une activité : génération par plage de dates / horaires, fermeture, suppression. */
export function SlotsManager({ activityId }: { activityId: string }) {
  const sb = supabaseBrowser() as any;
  const [slots, setSlots] = useState<ActivitySlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await sb.from('activity_slots').select('*').eq('activity_id', activityId)
      .gt('starts_at', new Date().toISOString()).order('starts_at').limit(300);
    if (error) console.error('[slots]', error);
    setSlots((data ?? []) as ActivitySlot[]);
    setLoading(false);
  }, [sb, activityId]);
  useEffect(() => { load(); }, [load]);

  async function generate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const g = (k: string) => String(f.get(k) ?? '').trim();
    const from = g('from'), to = g('to') || from;
    const times = g('times').split(/[,\s]+/).filter((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t));
    const days = f.getAll('dow').map(Number);
    const capacity = Number(g('capacity'));
    const price = g('price') === '' ? null : Number(g('price'));
    if (!from || times.length === 0) { setMsg({ ok: false, text: 'Indiquez une date et au moins une heure (HH:MM).' }); return; }
    const rows: { activity_id: string; starts_at: string; capacity: number; price_xof: number | null }[] = [];
    // Les horaires sont saisis en heure d'Abidjan (UTC+0, sans changement d'heure).
    for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
      if (days.length && !days.includes(d.getUTCDay())) continue;
      for (const t of times) rows.push({ activity_id: activityId, starts_at: `${d.toISOString().slice(0, 10)}T${t}:00Z`, capacity, price_xof: price });
    }
    const future = rows.filter((r) => new Date(r.starts_at) > new Date());
    if (future.length === 0) { setMsg({ ok: false, text: 'Aucun créneau futur à créer.' }); return; }
    if (future.length > MAX_GENERATED) { setMsg({ ok: false, text: `Trop de créneaux (${future.length}) : maximum ${MAX_GENERATED} à la fois.` }); return; }
    setBusy(true); setMsg(null);
    const { error } = await sb.from('activity_slots').upsert(future, { onConflict: 'activity_id,starts_at', ignoreDuplicates: true });
    setBusy(false);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setMsg({ ok: true, text: `${future.length} créneau(x) ajouté(s) (les doublons sont ignorés).` });
    load();
  }

  async function toggle(s: ActivitySlot) {
    const { error } = await sb.from('activity_slots').update({ status: s.status === 'open' ? 'closed' : 'open' }).eq('id', s.id);
    if (error) setMsg({ ok: false, text: error.message }); else load();
  }
  async function remove(s: ActivitySlot) {
    if (s.booked > 0) { setMsg({ ok: false, text: 'Ce créneau a des réservations : fermez-le plutôt que de le supprimer.' }); return; }
    const { error } = await sb.from('activity_slots').delete().eq('id', s.id);
    if (error) setMsg({ ok: false, text: error.message }); else load();
  }

  const dows = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  return (
    <div className="mt-3 space-y-4 rounded-xl bg-neutral-50 p-4">
      <form onSubmit={generate} className="grid gap-3 sm:grid-cols-4">
        <label className="text-xs font-semibold text-neutral-700">Du<input name="from" type="date" required className={input} /></label>
        <label className="text-xs font-semibold text-neutral-700">Au (optionnel)<input name="to" type="date" className={input} /></label>
        <label className="text-xs font-semibold text-neutral-700 sm:col-span-2">Heures (ex. 09:00, 14:30)<input name="times" required placeholder="09:00, 14:00" className={input} /></label>
        <label className="text-xs font-semibold text-neutral-700">Places par créneau<input name="capacity" type="number" min={1} max={500} defaultValue={10} required className={input} /></label>
        <label className="text-xs font-semibold text-neutral-700">Prix spécifique (XOF)<input name="price" type="number" min={0} placeholder="prix de base" className={input} /></label>
        <fieldset className="text-xs font-semibold text-neutral-700 sm:col-span-2"><legend>Jours (tous si aucun)</legend>
          <div className="mt-1 flex flex-wrap gap-2">{dows.map((d, i) => <label key={d} className="flex items-center gap-1 font-normal"><input type="checkbox" name="dow" value={i} /> {d}</label>)}</div>
        </fieldset>
        <div className="sm:col-span-4"><button disabled={busy} className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-bold text-night disabled:opacity-60">{busy ? 'Ajout…' : 'Ajouter des créneaux'}</button></div>
      </form>
      {msg && <p role="status" className={`text-sm ${msg.ok ? 'text-emerald-700' : 'text-red-700'}`}>{msg.text}</p>}
      {loading ? <p className="text-sm text-neutral-600">Chargement…</p> : slots.length === 0 ? <p className="text-sm text-neutral-600">Aucun créneau à venir.</p> : (
        <ul className="divide-y divide-neutral-200 text-sm">
          {slots.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>{formatSlot(s.starts_at)} <span className="text-neutral-600">· {s.booked}/{s.capacity} réservés{s.price_xof != null ? ` · ${formatXOF(s.price_xof)}` : ''}</span>{s.status === 'closed' && <span className="ml-2 rounded bg-neutral-200 px-1.5 text-[10px] uppercase">fermé</span>}</span>
              <span className="flex gap-3 text-xs"><button onClick={() => toggle(s)} className="underline">{s.status === 'open' ? 'Fermer' : 'Rouvrir'}</button><button onClick={() => remove(s)} className="text-red-700 underline">Supprimer</button></span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
