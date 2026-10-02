'use client';

import { useCallback, useEffect, useState } from 'react';
import { slugify, formatXOF, formatTripDates, HIGHLIGHT_LABELS, CONTINENTS, type TripHighlight } from '@soutra/shared';
import { supabaseBrowser } from '@/lib/supabase';

type Status = 'draft' | 'published' | 'full' | 'closed' | 'cancelled';
interface TripRow {
  id: string; slug: string; title: string; scope: 'national' | 'international'; status: Status;
  country: string; city: string | null; starts_on: string; ends_on: string; base_price_xof: number;
  seats_total: number; seats_booked: number; commission_pct: number | null; highlight: TripHighlight | null;
}
interface Stats {
  trips_published: number; trips_draft: number; trips_national: number; trips_international: number;
  bookings_total: number; bookings_national: number; bookings_international: number; seats_sold: number;
  revenue_xof: number; outstanding_xof: number; commission_xof: number; destinations: number;
  revenue_by_month: { month: string; revenue_xof: number; bookings: number }[];
  top_destinations: { name: string; bookings: number; revenue_xof: number }[];
}

const STATUS_LABEL: Record<Status, string> = { draft: 'Brouillon', published: 'Publié', full: 'Complet', closed: 'Clos', cancelled: 'Annulé' };
const STATUS_TONE: Record<Status, string> = {
  draft: 'bg-amber-500/15 text-amber-400', published: 'bg-emerald-500/15 text-emerald-400', full: 'bg-blue-500/15 text-blue-400',
  closed: 'bg-neutral-500/15 text-neutral-400', cancelled: 'bg-red-500/15 text-red-400',
};
const input = 'w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white placeholder:text-neutral-600';

export function TripsTab() {
  const sb = supabaseBrowser() as any;
  const [stats, setStats] = useState<Stats | null>(null);
  const [rows, setRows] = useState<TripRow[]>([]);
  const [filter, setFilter] = useState<Status | 'all'>('draft');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: s }, { data: t, error: e }] = await Promise.all([
      sb.rpc('admin_tourism_stats'),
      (() => {
        let q = sb.from('trips').select('id, slug, title, scope, status, country, city, starts_on, ends_on, base_price_xof, seats_total, seats_booked, commission_pct, highlight')
          .order('starts_on', { ascending: false }).limit(200);
        if (filter !== 'all') q = q.eq('status', filter);
        return q;
      })(),
    ]);
    if (e) console.error('[admin-trips]', e);
    setStats((s as Stats) ?? null);
    setRows((t as TripRow[]) ?? []);
    setLoading(false);
  }, [sb, filter]);

  useEffect(() => { load(); }, [load]);

  async function moderate(id: string, args: Record<string, unknown>, confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setBusy(id); setError(null);
    const { error: e } = await sb.rpc('admin_moderate_trip', { p_trip_id: id, ...args });
    setBusy(null);
    if (e) { setError(e.message || 'Erreur'); return; }
    load();
  }

  return (
    <div className="space-y-6">
      {stats && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Voyages publiés" value={stats.trips_published} sub={`${stats.trips_national} 🇨🇮 · ${stats.trips_international} 🌍 · ${stats.trips_draft} brouillon(s)`} />
            <Kpi label="Réservations" value={stats.bookings_total} sub={`${stats.bookings_national} nationales · ${stats.bookings_international} intern.`} />
            <Kpi label="Chiffre d'affaires encaissé" value={formatXOF(stats.revenue_xof)} sub={`Reste à encaisser ${formatXOF(stats.outstanding_xof)}`} />
            <Kpi label="Commissions estimées" value={formatXOF(stats.commission_xof)} sub={`${stats.seats_sold} places vendues`} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Encaissements par mois">
              <Bars items={stats.revenue_by_month.map((m) => ({ label: m.month, value: m.revenue_xof, text: formatXOF(m.revenue_xof) }))} empty="Aucun encaissement." />
            </Panel>
            <Panel title="Destinations les plus réservées">
              <Bars items={stats.top_destinations.map((d) => ({ label: d.name, value: d.revenue_xof || d.bookings, text: `${d.bookings} rés. · ${formatXOF(d.revenue_xof)}` }))} empty="Aucune réservation." />
            </Panel>
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {(['draft', 'published', 'full', 'closed', 'cancelled', 'all'] as const).map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${filter === s ? 'border-primary-500 bg-primary-500/15 text-primary-400' : 'border-neutral-800 bg-neutral-900/50 text-neutral-400'}`}>
            {s === 'all' ? 'Tous' : STATUS_LABEL[s]}
          </button>
        ))}
        <button onClick={() => setShowForm((v) => !v)} className="ml-auto rounded-full bg-primary-500 px-4 py-1.5 text-xs font-bold text-white">
          {showForm ? 'Fermer' : '+ Nouveau voyage'}
        </button>
      </div>

      {showForm && <TripForm onCreated={() => { setShowForm(false); setFilter('draft'); load(); }} />}
      {error && <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-400">{error}</p>}

      {loading ? <p className="p-8 text-center text-neutral-500">Chargement…</p> : rows.length === 0 ? (
        <p className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-10 text-center text-sm text-neutral-400">Aucun voyage pour ce filtre.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((t) => (
            <li key={t.id} className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_TONE[t.status]}`}>{STATUS_LABEL[t.status]}</span>
                  <span className="ml-2 text-[10px] font-semibold uppercase text-neutral-500">{t.scope === 'national' ? '🇨🇮 National' : '🌍 International'}</span>
                  <p className="mt-1 font-display text-base font-bold text-white">{t.title}</p>
                  <p className="text-xs text-neutral-500">{[t.city, t.country].filter(Boolean).join(', ')} · {formatTripDates(t.starts_on, t.ends_on)}</p>
                  <p className="text-xs text-neutral-400">{formatXOF(t.base_price_xof)} · {t.seats_booked}/{t.seats_total} places</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-[10px] text-neutral-500">Commission %
                    <input type="number" min={0} max={100} step="0.5" defaultValue={t.commission_pct ?? ''} placeholder="0"
                      onBlur={(e) => { const v = e.target.value; if (v !== '' && Number(v) !== t.commission_pct) moderate(t.id, { p_commission_pct: Number(v) }); }}
                      className="ml-1 w-16 rounded border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-white" />
                  </label>
                  <select value={t.highlight ?? ''} aria-label="Mise en avant"
                    onChange={(e) => e.target.value ? moderate(t.id, { p_highlight: e.target.value }) : moderate(t.id, { p_clear_highlight: true })}
                    className="rounded border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-white">
                    <option value="">Aucune mise en avant</option>
                    {(Object.keys(HIGHLIGHT_LABELS) as TripHighlight[]).map((h) => <option key={h} value={h}>{HIGHLIGHT_LABELS[h]}</option>)}
                  </select>
                  {(t.status === 'draft' || t.status === 'closed') && <Btn busy={busy === t.id} tone="emerald" onClick={() => moderate(t.id, { p_status: 'published' })}>Publier</Btn>}
                  {(t.status === 'published' || t.status === 'full') && <Btn busy={busy === t.id} tone="neutral" onClick={() => moderate(t.id, { p_status: 'closed' })}>Clore</Btn>}
                  {t.status !== 'cancelled' && <Btn busy={busy === t.id} tone="red" onClick={() => moderate(t.id, { p_status: 'cancelled' }, `Annuler « ${t.title} » ? Les voyageurs déjà payés devront être remboursés manuellement.`)}>Annuler</Btn>}
                  {(t.status === 'published' || t.status === 'full') && <a href={`/voyages/${t.slug}`} target="_blank" rel="noreferrer" className="text-xs font-semibold text-primary-400 underline">Voir</a>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TripForm({ onCreated }: { onCreated: () => void }) {
  const sb = supabaseBrowser() as any;
  const [scope, setScope] = useState<'national' | 'international'>('national');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const g = (k: string) => String(f.get(k) ?? '').trim();
    const list = (k: string) => g(k).split(/\n|,/).map((x) => x.trim()).filter(Boolean);
    setBusy(true); setErr(null);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { setErr('Session expirée.'); setBusy(false); return; }

    const national = scope === 'national';
    const { data: trip, error } = await sb.from('trips').insert({
      slug: `${slugify(g('title')).slice(0, 60)}-${Math.random().toString(36).slice(2, 6)}`,
      organizer_id: user.id, scope, title: g('title'), summary: g('summary') || null, description: g('description') || null,
      country: national ? "Côte d'Ivoire" : g('country'), country_code: national ? 'CI' : g('country_code').toUpperCase(),
      continent: national ? null : g('continent') || null, city: g('city') || null, cover_url: g('cover_url') || null,
      starts_on: g('starts_on'), ends_on: g('ends_on'), base_price_xof: Number(g('base_price_xof')), deposit_pct: Number(g('deposit_pct') || 100),
      seats_total: Number(g('seats_total')), departure_point: g('departure_point') || null,
      departure_time: g('departure_time') || null, return_time: g('return_time') || null,
      transport: g('transport') || null, lodging: g('lodging') || null, meals: g('meals') || null,
      flight_info: g('flight_info') || null, hotel_info: g('hotel_info') || null, visa_info: g('visa_info') || null, insurance_info: g('insurance_info') || null,
      activities: list('activities'), inclusions: list('inclusions'), exclusions: list('exclusions'),
      conditions: g('conditions') || null, contact_phone: g('contact_phone') || null, contact_whatsapp: g('contact_whatsapp') || null,
      is_circuit: f.get('is_circuit') === 'on', status: 'draft',
    }).select('id').single();
    if (error || !trip) { setErr(error?.message || 'Création impossible'); setBusy(false); return; }

    // Programme : une ligne par jour « Titre : étape 1, étape 2 »
    const days = g('days').split('\n').map((l) => l.trim()).filter(Boolean).map((l, i) => {
      const [title, stops = ''] = l.split(':');
      return { trip_id: trip.id, day_number: i + 1, title: title.trim(), stops: stops.split(',').map((s) => s.trim()).filter(Boolean) };
    });
    // Formules : une ligne par formule « Nom | prix | inclus 1, inclus 2 »
    const packages = g('packages').split('\n').map((l) => l.trim()).filter(Boolean).map((l, i) => {
      const [name, price, inc = ''] = l.split('|').map((x) => x.trim());
      const code = (['essentielle', 'confort', 'premium', 'vip'] as const).find((c) => name.toLowerCase().includes(c)) ?? 'custom';
      return { trip_id: trip.id, code, name, price_xof: Number(price), position: i, includes: inc.split(',').map((s) => s.trim()).filter(Boolean) };
    });
    const results = await Promise.all([
      days.length ? sb.from('trip_itineraries').insert(days) : Promise.resolve({}),
      packages.length ? sb.from('trip_packages').insert(packages) : Promise.resolve({}),
    ]);
    const sub = results.find((r: any) => r?.error);
    setBusy(false);
    if (sub) { setErr(`Voyage créé en brouillon, mais programme/formules refusés : ${(sub as any).error.message}`); return; }
    onCreated();
  }

  const lbl = 'block text-xs font-semibold text-neutral-400';
  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5">
      <div className="flex gap-2">
        {(['national', 'international'] as const).map((s) => (
          <button type="button" key={s} onClick={() => setScope(s)}
            className={`rounded-full border px-4 py-1.5 text-xs font-bold ${scope === s ? 'border-primary-500 bg-primary-500/15 text-primary-400' : 'border-neutral-800 text-neutral-400'}`}>
            {s === 'national' ? '🇨🇮 National' : '🌍 International'}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-xs text-neutral-300"><input type="checkbox" name="is_circuit" /> Circuit multi-destinations</label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={`${lbl} sm:col-span-2`}>Titre *<input name="title" required maxLength={200} className={input} /></label>
        <label className={`${lbl} sm:col-span-2`}>Résumé<input name="summary" maxLength={500} className={input} /></label>
        <label className={lbl}>Ville / destination<input name="city" className={input} /></label>
        <label className={lbl}>Image de couverture (URL)<input name="cover_url" type="url" className={input} /></label>
        {scope === 'international' && (<>
          <label className={lbl}>Pays *<input name="country" required className={input} /></label>
          <label className={lbl}>Code pays (2 lettres) *<input name="country_code" required pattern="[A-Za-z]{2}" maxLength={2} className={input} /></label>
          <label className={lbl}>Continent *<select name="continent" required className={input}>{CONTINENTS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></label>
        </>)}
        <label className={lbl}>Début *<input name="starts_on" type="date" required className={input} /></label>
        <label className={lbl}>Fin *<input name="ends_on" type="date" required className={input} /></label>
        <label className={lbl}>Prix de base (XOF) *<input name="base_price_xof" type="number" min={0} required className={input} /></label>
        <label className={lbl}>Places *<input name="seats_total" type="number" min={1} required className={input} /></label>
        <label className={lbl}>Acompte (% du total, 100 = pas d'acompte)<input name="deposit_pct" type="number" min={10} max={100} defaultValue={100} className={input} /></label>
        <label className={lbl}>Point de départ<input name="departure_point" className={input} /></label>
        <label className={lbl}>Heure de départ<input name="departure_time" type="time" className={input} /></label>
        <label className={lbl}>Heure de retour<input name="return_time" type="time" className={input} /></label>
        <label className={lbl}>Transport<input name="transport" className={input} /></label>
        <label className={lbl}>Hébergement<input name="lodging" className={input} /></label>
        <label className={lbl}>Repas<input name="meals" className={input} /></label>
        {scope === 'international' && (<>
          <label className={lbl}>Vol<input name="flight_info" className={input} /></label>
          <label className={lbl}>Hôtel<input name="hotel_info" className={input} /></label>
          <label className={lbl}>Visa<input name="visa_info" className={input} /></label>
          <label className={lbl}>Assurance<input name="insurance_info" className={input} /></label>
        </>)}
        <label className={`${lbl} sm:col-span-2`}>Description<textarea name="description" rows={3} className={input} /></label>
        <label className={lbl}>Activités (séparées par virgule ou ligne)<textarea name="activities" rows={2} className={input} /></label>
        <label className={lbl}>Inclus<textarea name="inclusions" rows={2} className={input} /></label>
        <label className={lbl}>Non inclus<textarea name="exclusions" rows={2} className={input} /></label>
        <label className={lbl}>Conditions<textarea name="conditions" rows={2} className={input} /></label>
        <label className={`${lbl} sm:col-span-2`}>Programme (une ligne par jour : « Titre : étape 1, étape 2 »)<textarea name="days" rows={3} className={input} placeholder="Abidjan → Grand-Bassam : Abidjan, Grand-Bassam" /></label>
        <label className={`${lbl} sm:col-span-2`}>Formules (une ligne : « Nom | prix XOF | inclus 1, inclus 2 »)<textarea name="packages" rows={3} className={input} placeholder="Formule Confort | 65000 | Transport, Hébergement" /></label>
        <label className={lbl}>Téléphone contact<input name="contact_phone" className={input} /></label>
        <label className={lbl}>WhatsApp contact<input name="contact_whatsapp" className={input} /></label>
      </div>
      {err && <p role="alert" className="text-sm text-red-400">{err}</p>}
      <p className="text-xs text-neutral-500">Le voyage est créé en brouillon ; publiez-le ensuite depuis la liste.</p>
      <button disabled={busy} className="rounded-lg bg-primary-500 px-5 py-2 text-sm font-bold text-white disabled:opacity-60">{busy ? 'Création…' : 'Créer le brouillon'}</button>
    </form>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-4">
      <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1 font-display text-xl font-bold text-white">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-neutral-500">{sub}</p>}
    </div>
  );
}
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-4"><h3 className="mb-3 text-sm font-bold text-white">{title}</h3>{children}</div>;
}
function Bars({ items, empty }: { items: { label: string; value: number; text: string }[]; empty: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (items.length === 0) return <p className="text-sm text-neutral-500">{empty}</p>;
  return (
    <ul className="space-y-2">
      {items.map((i) => (
        <li key={i.label}>
          <div className="flex justify-between text-xs text-neutral-300"><span>{i.label}</span><span className="text-neutral-500">{i.text}</span></div>
          <div className="mt-1 h-2 rounded bg-neutral-800"><div className="h-2 rounded bg-primary-500" style={{ width: `${Math.max(3, (i.value / max) * 100)}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}
function Btn({ children, onClick, busy, tone }: { children: React.ReactNode; onClick: () => void; busy: boolean; tone: 'emerald' | 'red' | 'neutral' }) {
  const c = tone === 'emerald' ? 'bg-emerald-600 text-white' : tone === 'red' ? 'bg-red-500/15 text-red-400' : 'bg-neutral-800 text-neutral-200';
  return <button disabled={busy} onClick={onClick} className={`rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-50 ${c}`}>{children}</button>;
}
