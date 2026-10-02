'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatXOF, HIGHLIGHT_LABELS, activityCategoryEmoji, activityCategoryLabel, type TripHighlight } from '@soutra/shared';
import { supabaseBrowser } from '@/lib/supabase';
import { ActivityEditor } from '@/components/tourism/ActivityEditor';

type Status = 'draft' | 'published' | 'paused' | 'archived';
interface Row {
  id: string; slug: string; title: string; category: string; city: string | null; status: Status; price_xof: number;
  commission_pct: number | null; highlight: TripHighlight | null; submitted_at: string | null; rating_avg: number; rating_count: number;
}
interface Overview {
  activities_published: number; activities_pending: number; bookings: number; participants: number; revenue_xof: number; commission_xof: number;
  by_category: { category: string; bookings: number; revenue_xof: number }[];
  reported_reviews: { id: string; activity: string; rating: number; comment: string | null; status: string; reports: number }[];
}

const LABEL: Record<Status, string> = { draft: 'Brouillon', published: 'Publiée', paused: 'En pause', archived: 'Archivée' };
const TONE: Record<Status, string> = {
  draft: 'bg-amber-500/15 text-amber-400', published: 'bg-emerald-500/15 text-emerald-400',
  paused: 'bg-neutral-500/15 text-neutral-400', archived: 'bg-red-500/15 text-red-400',
};

export function ActivitiesTab() {
  const sb = supabaseBrowser() as any;
  const [ov, setOv] = useState<Overview | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<Status | 'all'>('draft');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    let q = sb.from('activities').select('id, slug, title, category, city, status, price_xof, commission_pct, highlight, submitted_at, rating_avg, rating_count')
      .order('created_at', { ascending: false }).limit(200);
    if (filter !== 'all') q = q.eq('status', filter);
    const [{ data: o }, { data: list, error: e }] = await Promise.all([sb.rpc('admin_activity_overview'), q]);
    if (e) console.error('[admin-activities]', e);
    const rowsData = (list as Row[]) ?? [];
    if (filter === 'draft') rowsData.sort((a, b) => Number(!!b.submitted_at) - Number(!!a.submitted_at));
    setOv((o as Overview) ?? null);
    setRows(rowsData);
    setLoading(false);
  }, [sb, filter]);
  useEffect(() => { load(); }, [load]);

  async function moderate(id: string, args: Record<string, unknown>, confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setError(null);
    const { error: e } = await sb.rpc('admin_moderate_activity', { p_activity_id: id, ...args });
    if (e) { setError(e.message || 'Erreur'); return; }
    load();
  }
  async function moderateReview(id: string, status: 'published' | 'hidden') {
    const { error: e } = await sb.rpc('admin_moderate_activity_review', { p_review_id: id, p_status: status });
    if (e) { setError(e.message || 'Erreur'); return; }
    load();
  }

  return (
    <div className="space-y-6">
      {ov && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Activités publiées" value={ov.activities_published} sub={`${ov.activities_pending} à valider`} />
          <Kpi label="Réservations" value={ov.bookings} sub={`${ov.participants} participants`} />
          <Kpi label="Chiffre d'affaires encaissé" value={formatXOF(ov.revenue_xof)} />
          <Kpi label="Commissions estimées" value={formatXOF(ov.commission_xof)} />
        </div>
      )}
      {ov && ov.by_category.length > 0 && (
        <div className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-4">
          <h3 className="mb-3 text-sm font-bold text-white">Revenus par catégorie</h3>
          <ul className="space-y-2">{ov.by_category.map((c) => {
            const max = Math.max(1, ...ov.by_category.map((x) => x.revenue_xof));
            return (<li key={c.category}>
              <div className="flex justify-between text-xs text-neutral-300"><span>{activityCategoryEmoji(c.category)} {activityCategoryLabel(c.category)}</span><span className="text-neutral-500">{c.bookings} rés. · {formatXOF(c.revenue_xof)}</span></div>
              <div className="mt-1 h-2 rounded bg-neutral-800"><div className="h-2 rounded bg-primary-500" style={{ width: `${Math.max(3, (c.revenue_xof / max) * 100)}%` }} /></div>
            </li>);
          })}</ul>
        </div>
      )}
      {ov && ov.reported_reviews.length > 0 && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
          <h3 className="mb-3 text-sm font-bold text-amber-300">Avis signalés ({ov.reported_reviews.length})</h3>
          <ul className="space-y-3">{ov.reported_reviews.map((r) => (
            <li key={r.id} className="rounded-xl bg-neutral-950/60 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2"><b className="text-white">{r.activity}</b><span className="text-amber-400">{'★'.repeat(r.rating)} · {r.reports} signalement(s) · {r.status === 'hidden' ? 'masqué' : 'visible'}</span></div>
              {r.comment && <p className="mt-1 text-neutral-300">{r.comment}</p>}
              <div className="mt-2 flex gap-3 text-xs">
                {r.status === 'published' ? <button onClick={() => moderateReview(r.id, 'hidden')} className="font-bold text-red-400 underline">Masquer</button>
                  : <button onClick={() => moderateReview(r.id, 'published')} className="font-bold text-emerald-400 underline">Rétablir</button>}
              </div>
            </li>))}</ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {(['draft', 'published', 'paused', 'archived', 'all'] as const).map((s) => (
          <button key={s} onClick={() => setFilter(s)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${filter === s ? 'border-primary-500 bg-primary-500/15 text-primary-400' : 'border-neutral-800 bg-neutral-900/50 text-neutral-400'}`}>
            {s === 'all' ? 'Toutes' : LABEL[s]}
          </button>
        ))}
      </div>
      {editing && <ActivityEditor activityId={editing} onSaved={() => { setEditing(null); load(); }} onCancel={() => setEditing(null)} />}
      {error && <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-400">{error}</p>}

      {loading ? <p className="p-8 text-center text-neutral-500">Chargement…</p> : rows.length === 0 ? (
        <p className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-10 text-center text-sm text-neutral-400">Aucune activité pour ce filtre.</p>
      ) : (
        <ul className="space-y-3">{rows.map((a) => (
          <li key={a.id} className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${TONE[a.status]}`}>{LABEL[a.status]}</span>
                {a.status === 'draft' && a.submitted_at && <span className="ml-2 rounded-full bg-primary-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-primary-300">Soumise à validation</span>}
                <p className="mt-1 font-display text-base font-bold text-white">{a.title}</p>
                <p className="text-xs text-neutral-500">{activityCategoryEmoji(a.category)} {activityCategoryLabel(a.category)} · {a.city ?? '—'} · {formatXOF(a.price_xof)}{a.rating_count > 0 ? ` · ★ ${Number(a.rating_avg).toFixed(1)} (${a.rating_count})` : ''}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-[10px] text-neutral-500">Commission %
                  <input type="number" min={0} max={100} step="0.5" defaultValue={a.commission_pct ?? ''} placeholder="0"
                    onBlur={(e) => { const v = e.target.value; if (v !== '' && Number(v) !== a.commission_pct) moderate(a.id, { p_commission_pct: Number(v) }); }}
                    className="ml-1 w-16 rounded border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-white" />
                </label>
                <select value={a.highlight ?? ''} aria-label="Mise en avant"
                  onChange={(e) => e.target.value ? moderate(a.id, { p_highlight: e.target.value }) : moderate(a.id, { p_clear_highlight: true })}
                  className="rounded border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-white">
                  <option value="">Aucune mise en avant</option>
                  {(Object.keys(HIGHLIGHT_LABELS) as TripHighlight[]).map((h) => <option key={h} value={h}>{HIGHLIGHT_LABELS[h]}</option>)}
                </select>
                <button onClick={() => { setEditing(a.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="rounded-lg bg-neutral-800 px-3 py-1.5 text-xs font-bold text-neutral-200">Modifier</button>
                {(a.status === 'draft' || a.status === 'paused') && <button onClick={() => moderate(a.id, { p_status: 'published' })} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white">Publier</button>}
                {a.status === 'published' && <button onClick={() => moderate(a.id, { p_status: 'paused' })} className="rounded-lg bg-neutral-800 px-3 py-1.5 text-xs font-bold text-neutral-200">Pause</button>}
                {a.status !== 'archived' && <button onClick={() => moderate(a.id, { p_status: 'archived' }, `Archiver « ${a.title} » ? Elle ne sera plus réservable.`)} className="rounded-lg bg-red-500/15 px-3 py-1.5 text-xs font-bold text-red-400">Archiver</button>}
                {a.status === 'published' && <a href={`/activites/${a.slug}`} target="_blank" rel="noreferrer" className="text-xs font-semibold text-primary-400 underline">Voir</a>}
              </div>
            </div>
          </li>))}</ul>
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
