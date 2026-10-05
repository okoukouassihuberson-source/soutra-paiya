'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatXOF, activityCategoryEmoji, activityCategoryLabel } from '@soutra/shared';
import { supabaseBrowser } from '@/lib/supabase';
import { ActivityEditor } from '@/components/tourism/ActivityEditor';
import { SlotsManager } from './SlotsManager';

type Status = 'draft' | 'published' | 'paused' | 'archived';
interface Row {
  id: string; slug: string; title: string; category: string; status: Status; price_xof: number; submitted_at: string | null;
  approved_at: string | null; rating_avg: number; rating_count: number; upcoming_slots: number; bookings: number; paid_xof: number;
}
interface Dash { activities: Row[]; totals: { bookings: number; participants: number; paid_xof: number } }
interface BookingRow {
  id: string; reference: string; traveler_name: string | null; contact_phone: string | null; participants: number;
  starts_at: string; total_xof: number; paid_xof: number; status: string;
}

const STATUS: Record<Status, { label: string; tone: string }> = {
  draft: { label: 'Brouillon', tone: 'bg-amber-500/15 text-amber-700' },
  published: { label: 'Publiée', tone: 'bg-emerald-500/15 text-emerald-700' },
  paused: { label: 'En pause', tone: 'bg-neutral-500/15 text-neutral-700' },
  archived: { label: 'Archivée', tone: 'bg-red-500/15 text-red-700' },
};
const BOOKING_LABEL: Record<string, string> = { pending: 'En attente', paid: 'Payé', confirmed: 'Confirmé', cancelled: 'Annulé', used: 'Utilisé' };
const ERR: Record<string, string> = {
  COVER_REQUIRED: 'Ajoutez une image de couverture avant de soumettre.',
  CONTACT_REQUIRED: 'Ajoutez un téléphone ou un WhatsApp de contact avant de soumettre.',
  SLOT_REQUIRED: 'Ajoutez au moins un créneau à venir avant de soumettre.',
  ACTIVITY_LOCKED: 'Activité publiée : seule la pause est possible, le reste passe par l’administration.',
};

export function ActivityManager() {
  const sb = supabaseBrowser() as any;
  const [dash, setDash] = useState<Dash | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [panel, setPanel] = useState<{ id: string; kind: 'slots' | 'bookings' } | null>(null);
  const [bookings, setBookings] = useState<BookingRow[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await sb.rpc('get_organizer_activity_dashboard');
    if (error) console.error('[org-activities]', error);
    setDash((data as Dash) ?? null);
    setLoading(false);
  }, [sb]);
  useEffect(() => { load(); }, [load]);

  const explain = (m?: string) => Object.entries(ERR).find(([k]) => m?.includes(k))?.[1] ?? 'Action impossible.';

  async function submitForReview(id: string) {
    setMsg(null);
    const { error } = await sb.rpc('submit_activity_for_review', { p_activity_id: id });
    if (error) { setMsg({ ok: false, text: explain(error.message) }); return; }
    setMsg({ ok: true, text: 'Activité soumise. L’équipe Soutra-Playce la validera avant publication.' });
    load();
  }
  async function setStatus(id: string, status: 'paused' | 'published') {
    setMsg(null);
    const { error } = await sb.from('activities').update({ status }).eq('id', id);
    if (error) { setMsg({ ok: false, text: explain(error.message) }); return; }
    load();
  }
  async function openPanel(id: string, kind: 'slots' | 'bookings') {
    if (panel?.id === id && panel.kind === kind) { setPanel(null); return; }
    setPanel({ id, kind }); setBookings(null);
    if (kind === 'bookings') {
      const { data, error } = await sb.rpc('get_organizer_activity_bookings', { p_activity_id: id });
      if (error) { setMsg({ ok: false, text: 'Impossible de charger les participants.' }); setPanel(null); return; }
      setBookings((data as BookingRow[]) ?? []);
    }
  }

  if (loading) return <p className="p-10 text-center text-neutral-600">Chargement…</p>;
  const t = dash?.totals;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <Kpi label="Réservations" value={t?.bookings ?? 0} /><Kpi label="Participants" value={t?.participants ?? 0} /><Kpi label="Encaissé" value={formatXOF(t?.paid_xof ?? 0)} />
      </div>
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold">Mes activités</h2>
        <button onClick={() => { setCreating((v) => !v); setEditing(null); }} className="rounded-full bg-primary-500 px-4 py-1.5 text-xs font-bold text-night">{creating ? 'Fermer' : '+ Nouvelle activité'}</button>
      </div>
      {creating && <ActivityEditor onSaved={() => { setCreating(false); setMsg({ ok: true, text: 'Brouillon créé. Ajoutez des créneaux puis soumettez-le.' }); load(); }} onCancel={() => setCreating(false)} />}
      {editing && <ActivityEditor activityId={editing} onSaved={() => { setEditing(null); load(); }} onCancel={() => setEditing(null)} />}
      {msg && <p role="status" className={`rounded-lg p-3 text-sm ${msg.ok ? 'bg-emerald-500/10 text-emerald-700' : 'bg-red-500/10 text-red-700'}`}>{msg.text}</p>}

      {!dash?.activities.length ? (
        <p className="rounded-2xl border border-neutral-200 bg-white p-10 text-center text-sm text-neutral-700">Aucune activité pour le moment. Créez votre premier brouillon.</p>
      ) : (
        <ul className="space-y-3">
          {dash.activities.map((a) => (
            <li key={a.id} className="rounded-2xl border border-neutral-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS[a.status].tone}`}>{STATUS[a.status].label}</span>
                  {a.status === 'draft' && a.submitted_at && <span className="ml-2 rounded-full bg-primary-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-primary-700">En attente de validation</span>}
                  <p className="mt-1 font-display text-base font-bold">{a.title}</p>
                  <p className="text-xs text-neutral-600">{activityCategoryEmoji(a.category)} {activityCategoryLabel(a.category)} · {formatXOF(a.price_xof)} · {a.upcoming_slots} créneau(x) à venir{a.rating_count > 0 ? ` · ★ ${Number(a.rating_avg).toFixed(1)} (${a.rating_count})` : ''}</p>
                  <p className="text-xs text-neutral-700">{a.bookings} réservation(s) · encaissé {formatXOF(a.paid_xof)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {a.status === 'draft' && <button onClick={() => { setEditing(a.id); setCreating(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-bold">Modifier</button>}
                  <button onClick={() => openPanel(a.id, 'slots')} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-bold">Créneaux</button>
                  {a.bookings > 0 && <button onClick={() => openPanel(a.id, 'bookings')} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-bold">Participants</button>}
                  {a.status === 'draft' && !a.submitted_at && <button onClick={() => submitForReview(a.id)} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white">Soumettre</button>}
                  {a.status === 'published' && <button onClick={() => setStatus(a.id, 'paused')} className="rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-bold">Mettre en pause</button>}
                  {a.status === 'paused' && a.approved_at && <button onClick={() => setStatus(a.id, 'published')} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white">Reprendre</button>}
                  {a.status === 'published' && <a href={`/activites/${a.slug}`} target="_blank" rel="noreferrer" className="text-xs font-semibold text-primary-700 underline">Voir</a>}
                </div>
              </div>
              {panel?.id === a.id && panel.kind === 'slots' && <SlotsManager activityId={a.id} />}
              {panel?.id === a.id && panel.kind === 'bookings' && (
                <div className="mt-3 overflow-x-auto rounded-xl bg-neutral-50">
                  {!bookings ? <p className="p-4 text-sm text-neutral-600">Chargement…</p> : (
                    <table className="w-full text-left text-xs">
                      <thead className="text-neutral-600"><tr><th className="p-2">Réf.</th><th className="p-2">Voyageur</th><th className="p-2">Tél.</th><th className="p-2">Créneau</th><th className="p-2">Pers.</th><th className="p-2">Payé</th><th className="p-2">Statut</th></tr></thead>
                      <tbody>{bookings.map((b) => (
                        <tr key={b.id} className="border-t border-neutral-200">
                          <td className="p-2 font-mono">{b.reference}</td><td className="p-2">{b.traveler_name ?? '—'}</td>
                          <td className="p-2">{b.contact_phone ? <a className="underline" href={`tel:${b.contact_phone}`}>{b.contact_phone}</a> : '—'}</td>
                          <td className="p-2 whitespace-nowrap">{new Date(b.starts_at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Abidjan' })}</td>
                          <td className="p-2">{b.participants}</td><td className="p-2">{formatXOF(b.paid_xof)} / {formatXOF(b.total_xof)}</td><td className="p-2">{BOOKING_LABEL[b.status] ?? b.status}</td>
                        </tr>))}</tbody>
                    </table>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4">
      <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-600">{label}</p>
      <p className="mt-1 font-display text-xl font-bold">{value}</p>
    </div>
  );
}
