'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatXOF, formatTripDates, HIGHLIGHT_LABELS, type TripHighlight } from '@soutra/shared';
import { supabaseBrowser } from '@/lib/supabase';
import { TripEditor } from '@/components/tourism/TripEditor';

type Status = 'draft' | 'published' | 'full' | 'closed' | 'cancelled';
interface TripRow {
  id: string; slug: string; title: string; scope: 'national' | 'international'; status: Status;
  country: string; city: string | null; starts_on: string; ends_on: string; base_price_xof: number;
  seats_total: number; seats_booked: number; commission_pct: number | null; highlight: TripHighlight | null; submitted_at: string | null;
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
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: s }, { data: t, error: e }] = await Promise.all([
      sb.rpc('admin_tourism_stats'),
      (() => {
        let q = sb.from('trips').select('id, slug, title, scope, status, country, city, starts_on, ends_on, base_price_xof, seats_total, seats_booked, commission_pct, highlight, submitted_at')
          .order('starts_on', { ascending: false }).limit(200);
        if (filter !== 'all') q = q.eq('status', filter);
        return q;
      })(),
    ]);
    if (e) console.error('[admin-trips]', e);
    setStats((s as Stats) ?? null);
    const list = (t as TripRow[]) ?? [];
    // Brouillons soumis à validation en tête de file.
    if (filter === 'draft') list.sort((a, b) => Number(!!b.submitted_at) - Number(!!a.submitted_at));
    setRows(list);
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

  async function remove(t: { id: string; title: string }) {
    if (!confirm(`Supprimer définitivement « ${t.title} » ? Impossible si des réservations existent (utilisez alors « Annuler »).`)) return;
    setBusy(t.id); setError(null);
    const { error: e } = await sb.rpc('admin_delete_trip', { p_trip_id: t.id });
    setBusy(null);
    if (e) { setError(String(e.message).includes('HAS_BOOKINGS') ? 'Suppression impossible : des réservations existent. Annulez le voyage à la place.' : e.message || 'Erreur'); return; }
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

      {showForm && <TripEditor onSaved={() => { setShowForm(false); setFilter('draft'); load(); }} onCancel={() => setShowForm(false)} />}
      {editing && <TripEditor tripId={editing} onSaved={() => { setEditing(null); load(); }} onCancel={() => setEditing(null)} />}
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
                  {t.status === 'draft' && t.submitted_at && <span className="ml-2 rounded-full bg-primary-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-primary-300">Soumis à validation</span>}
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
                  <Btn busy={false} tone="neutral" onClick={() => { setShowForm(false); setEditing(t.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Modifier</Btn>
                  {(t.status === 'draft' || t.status === 'closed') && <Btn busy={busy === t.id} tone="emerald" onClick={() => moderate(t.id, { p_status: 'published' })}>Publier</Btn>}
                  {(t.status === 'published' || t.status === 'full') && <Btn busy={busy === t.id} tone="neutral" onClick={() => moderate(t.id, { p_status: 'closed' })}>Clore</Btn>}
                  {t.status !== 'cancelled' && <Btn busy={busy === t.id} tone="red" onClick={() => moderate(t.id, { p_status: 'cancelled' }, `Annuler « ${t.title} » ? Les voyageurs déjà payés devront être remboursés manuellement.`)}>Annuler</Btn>}
                  <Btn busy={busy === t.id} tone="red" onClick={() => remove(t)}>Supprimer</Btn>
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
