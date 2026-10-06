'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatXOF } from '@soutra/shared';
import { supabaseBrowser } from '@/lib/supabase';

interface Report {
  defaults: { trip_pct: number; activity_pct: number };
  overrides: { organizer_id: string; name: string | null; trip_pct: number | null; activity_pct: number | null; note: string | null }[];
  totals: { collected_xof: number; commission_xof: number };
  by_month: { month: string; kind: 'trip' | 'activity'; collected_xof: number; commission_xof: number }[];
  top_organizers: { organizer_id: string; name: string | null; collected_xof: number; commission_xof: number }[];
}
interface Partner { id: string; full_name: string | null }

const input = 'w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-dark placeholder:text-neutral-600';
const lbl = 'block text-xs font-semibold text-neutral-700';
const ERR: Record<string, string> = {
  INVALID_COMMISSION: 'Le taux doit être compris entre 0 et 100 %.', NOT_AUTHORIZED: 'Action réservée à l’administration.',
  ORGANIZER_NOT_FOUND: 'Partenaire introuvable.',
};
const pct = (v: number | null) => (v == null ? '—' : `${Number(v)} %`);

/** Administration : taux par défaut, surcharges par partenaire, rapport de commissions. */
export function CommissionsPanel() {
  const sb = supabaseBrowser() as any;
  const [rep, setRep] = useState<Report | null>(null);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [{ data: r }, { data: p }] = await Promise.all([
      sb.rpc('admin_commission_report'),
      sb.from('profiles').select('id, full_name').in('role', ['organizer', 'guide', 'venue_owner']).order('full_name').limit(300),
    ]);
    setRep((r as Report) ?? null); setPartners((p as Partner[]) ?? []);
  }, [sb]);
  useEffect(() => { load(); }, [load]);

  async function call(fn: string, args: Record<string, unknown>, okText: string) {
    setBusy(true); setMsg(null);
    const { error } = await sb.rpc(fn, args);
    setBusy(false);
    if (error) { const k = Object.keys(ERR).find((x) => error.message?.includes(x)); setMsg({ ok: false, text: k ? ERR[k] : error.message }); return; }
    setMsg({ ok: true, text: okText }); load();
  }
  const num = (f: FormData, k: string) => (String(f.get(k) ?? '').trim() === '' ? null : Number(f.get(k)));

  if (!rep) return <p className="p-6 text-center text-neutral-600">Chargement…</p>;
  const months = [...new Set(rep.by_month.map((m) => m.month))].sort().reverse();
  return (
    <div className="space-y-6 text-dark">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-neutral-200 bg-white p-4"><p className="text-xs text-neutral-700">Encaissé (voyages + activités)</p><p className="mt-1 text-xl font-bold">{formatXOF(Number(rep.totals.collected_xof))}</p></div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4"><p className="text-xs text-neutral-700">Commissions</p><p className="mt-1 text-xl font-bold text-emerald-700">{formatXOF(Number(rep.totals.commission_xof))}</p></div>
      </div>

      {msg && <p role="status" className={`text-sm ${msg.ok ? 'text-emerald-700' : 'text-red-700'}`}>{msg.text}</p>}

      <form className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-5" onSubmit={(e) => {
        e.preventDefault(); const f = new FormData(e.currentTarget);
        call('admin_set_commission_defaults', { p_trip_pct: num(f, 'trip'), p_activity_pct: num(f, 'activity') }, 'Taux par défaut enregistrés (appliqués aux prochains paiements).');
      }}>
        <h3 className="font-semibold">Taux par défaut</h3>
        <p className="text-xs text-neutral-600">Appliqués quand ni le voyage / l’activité ni le partenaire n’ont de taux propre. Les paiements déjà encaissés gardent leur taux d’origine.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={lbl}>Voyages (%)<input name="trip" type="number" step="0.01" min={0} max={100} required defaultValue={rep.defaults.trip_pct} className={input} /></label>
          <label className={lbl}>Activités (%)<input name="activity" type="number" step="0.01" min={0} max={100} required defaultValue={rep.defaults.activity_pct} className={input} /></label>
        </div>
        <button disabled={busy} className="rounded-lg bg-primary-500 px-5 py-2 text-sm font-bold disabled:opacity-60">Enregistrer</button>
      </form>

      <form className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-5" onSubmit={(e) => {
        e.preventDefault(); const f = new FormData(e.currentTarget);
        call('admin_set_organizer_commission', { p_organizer: f.get('organizer'), p_trip_pct: num(f, 'trip'), p_activity_pct: num(f, 'activity'), p_note: String(f.get('note') ?? '') || null }, 'Taux du partenaire enregistré.');
      }}>
        <h3 className="font-semibold">Taux négocié pour un partenaire</h3>
        <p className="text-xs text-neutral-600">Champ vide = taux par défaut. Les deux champs vides suppriment la surcharge. Un taux fixé sur un voyage ou une activité reste prioritaire.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={`${lbl} sm:col-span-2`}>Partenaire<select name="organizer" required className={input}><option value="">Choisir…</option>{partners.map((p) => <option key={p.id} value={p.id}>{p.full_name ?? p.id.slice(0, 8)}</option>)}</select></label>
          <label className={lbl}>Voyages (%)<input name="trip" type="number" step="0.01" min={0} max={100} className={input} /></label>
          <label className={lbl}>Activités (%)<input name="activity" type="number" step="0.01" min={0} max={100} className={input} /></label>
          <label className={`${lbl} sm:col-span-2`}>Note interne<input name="note" maxLength={300} className={input} /></label>
        </div>
        <button disabled={busy} className="rounded-lg bg-primary-500 px-5 py-2 text-sm font-bold disabled:opacity-60">Enregistrer</button>
      </form>

      {rep.overrides.length > 0 && (
        <section>
          <h3 className="mb-2 font-semibold">Taux négociés</h3>
          <ul className="space-y-2">{rep.overrides.map((o) => (
            <li key={o.organizer_id} className="flex flex-wrap items-center gap-3 rounded-xl border border-neutral-200 bg-white p-3 text-sm">
              <b className="flex-1">{o.name ?? o.organizer_id.slice(0, 8)}</b>
              <span className="text-neutral-800">Voyages {pct(o.trip_pct)} · Activités {pct(o.activity_pct)}</span>
              {o.note && <span className="text-xs text-neutral-600">{o.note}</span>}
              <button onClick={() => confirm('Supprimer ce taux négocié ?') && call('admin_set_organizer_commission', { p_organizer: o.organizer_id, p_trip_pct: null, p_activity_pct: null }, 'Taux négocié supprimé.')} className="text-red-700 underline">Supprimer</button>
            </li>))}</ul>
        </section>
      )}

      {months.length > 0 && (
        <section>
          <h3 className="mb-2 font-semibold">12 derniers mois</h3>
          <table className="w-full text-sm"><thead><tr className="text-left text-xs text-neutral-600"><th className="py-1">Mois</th><th>Encaissé</th><th>Commission</th></tr></thead><tbody>
            {months.map((m) => {
              const rows = rep.by_month.filter((x) => x.month === m);
              return <tr key={m} className="border-t border-neutral-200"><td className="py-1.5">{m}</td>
                <td>{formatXOF(rows.reduce((s, r) => s + Number(r.collected_xof), 0))}</td>
                <td className="text-emerald-700">{formatXOF(rows.reduce((s, r) => s + Number(r.commission_xof), 0))}</td></tr>;
            })}
          </tbody></table>
        </section>
      )}

      {rep.top_organizers.length > 0 && (
        <section>
          <h3 className="mb-2 font-semibold">Partenaires qui génèrent le plus de commission</h3>
          <ol className="space-y-1 text-sm">{rep.top_organizers.map((o) => (
            <li key={o.organizer_id ?? o.name} className="flex justify-between border-t border-neutral-200 py-1.5"><span>{o.name ?? '—'}</span>
              <span>{formatXOF(Number(o.collected_xof))} · <b className="text-emerald-700">{formatXOF(Number(o.commission_xof))}</b></span></li>))}</ol>
        </section>
      )}
    </div>
  );
}

/** Espace partenaire : taux en vigueur et commissions prélevées (transparence). */
export function MyCommission() {
  const [d, setD] = useState<{ trip_pct: number; activity_pct: number; collected_xof: number; commission_xof: number } | null>(null);
  useEffect(() => { (async () => { const { data } = await (supabaseBrowser() as any).rpc('get_my_commission'); setD(data ?? null); })(); }, []);
  if (!d) return null;
  return (
    <p className="rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-800">
      💼 Votre commission : <b>{Number(d.trip_pct)} %</b> sur les voyages, <b>{Number(d.activity_pct)} %</b> sur les activités
      (sauf taux spécifique à un voyage ou une activité). Déjà prélevé : <b>{formatXOF(Number(d.commission_xof))}</b> sur {formatXOF(Number(d.collected_xof))} encaissés.
    </p>
  );
}
