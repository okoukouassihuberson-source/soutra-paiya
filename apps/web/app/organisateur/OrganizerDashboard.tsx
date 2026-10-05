'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatTripDates, formatXOF } from '@soutra/shared';
import { supabaseBrowser } from '@/lib/supabase';
import { TripEditor } from '@/components/tourism/TripEditor';

type Status = 'draft' | 'published' | 'full' | 'closed' | 'cancelled';
interface TripRow {
  id: string; slug: string; title: string; scope: 'national' | 'international'; status: Status;
  starts_on: string; ends_on: string; seats_total: number; seats_booked: number; base_price_xof: number;
  submitted_at: string | null; commission_pct: number | null; bookings: number; paid_xof: number; due_xof: number;
}
interface Dash { trips: TripRow[]; totals: { bookings: number; seats_sold: number; paid_xof: number; due_xof: number } }
interface BookingRow {
  id: string; reference: string; traveler_name: string | null; contact_phone: string | null; participants: number;
  total_xof: number; paid_xof: number; status: string; used_at: string | null;
}

const STATUS: Record<Status, { label: string; tone: string }> = {
  draft: { label: 'Brouillon', tone: 'bg-amber-500/15 text-amber-700' },
  published: { label: 'Publié', tone: 'bg-emerald-500/15 text-emerald-700' },
  full: { label: 'Complet', tone: 'bg-blue-500/15 text-blue-700' },
  closed: { label: 'Ventes closes', tone: 'bg-neutral-500/15 text-neutral-700' },
  cancelled: { label: 'Annulé', tone: 'bg-red-500/15 text-red-700' },
};
const BOOKING_LABEL: Record<string, string> = { pending: 'En attente', paid: 'Payé', confirmed: 'Acompte versé', cancelled: 'Annulé', used: 'Embarqué' };
const ERR: Record<string, string> = {
  COVER_REQUIRED: 'Ajoutez une image de couverture avant de soumettre.',
  CONTACT_REQUIRED: 'Ajoutez un téléphone ou un WhatsApp de contact avant de soumettre.',
  TRIP_ALREADY_STARTED: 'La date de départ est déjà passée.',
  TRIP_HAS_PAYMENTS: 'Des voyageurs ont déjà payé : contactez l’administration pour annuler et rembourser.',
  TRIP_LOCKED: 'Voyage publié : modification réservée à l’administration.',
};

export function OrganizerDashboard() {
  const sb = supabaseBrowser() as any;
  const [dash, setDash] = useState<Dash | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [bookings, setBookings] = useState<BookingRow[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await sb.rpc('get_organizer_dashboard');
    if (error) console.error('[organizer]', error);
    setDash((data as Dash) ?? null);
    setLoading(false);
  }, [sb]);
  useEffect(() => { load(); }, [load]);

  const explain = (m?: string) => Object.entries(ERR).find(([k]) => m?.includes(k))?.[1] ?? 'Action impossible.';

  async function submitForReview(id: string) {
    setMsg(null);
    const { error } = await sb.rpc('submit_trip_for_review', { p_trip_id: id });
    if (error) { setMsg({ ok: false, text: explain(error.message) }); return; }
    setMsg({ ok: true, text: 'Voyage soumis. L’équipe Soutra-Playce le validera avant publication.' });
    load();
  }
  async function closeSales(id: string) {
    if (!confirm('Fermer les ventes de ce voyage ? Les réservations existantes sont conservées.')) return;
    setMsg(null);
    const { error } = await sb.from('trips').update({ status: 'closed' }).eq('id', id);
    if (error) { setMsg({ ok: false, text: explain(error.message) }); return; }
    load();
  }
  async function toggleBookings(id: string) {
    if (open === id) { setOpen(null); return; }
    setOpen(id); setBookings(null);
    const { data, error } = await sb.rpc('get_organizer_trip_bookings', { p_trip_id: id });
    if (error) { setMsg({ ok: false, text: 'Impossible de charger les voyageurs.' }); setOpen(null); return; }
    setBookings((data as BookingRow[]) ?? []);
  }

  if (loading) return <p className="p-10 text-center text-neutral-600">Chargement…</p>;
  const t = dash?.totals;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Réservations" value={t?.bookings ?? 0} />
        <Kpi label="Places vendues" value={t?.seats_sold ?? 0} />
        <Kpi label="Encaissé" value={formatXOF(t?.paid_xof ?? 0)} />
        <Kpi label="Reste à encaisser" value={formatXOF(t?.due_xof ?? 0)} />
      </div>

      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold">Mes voyages</h2>
        <button onClick={() => { setCreating((v) => !v); setEditing(null); }} className="rounded-full bg-primary-500 px-4 py-1.5 text-xs font-bold text-night">{creating ? 'Fermer' : '+ Nouveau voyage'}</button>
      </div>

      {creating && <TripEditor onSaved={() => { setCreating(false); setMsg({ ok: true, text: 'Brouillon créé. Complétez-le puis soumettez-le pour validation.' }); load(); }} onCancel={() => setCreating(false)} />}
      {editing && <TripEditor tripId={editing} onSaved={() => { setEditing(null); load(); }} onCancel={() => setEditing(null)} />}
      {msg && <p role="status" className={`rounded-lg p-3 text-sm ${msg.ok ? 'bg-emerald-500/10 text-emerald-700' : 'bg-red-500/10 text-red-700'}`}>{msg.text}</p>}

      {!dash?.trips.length ? (
        <p className="rounded-2xl border border-neutral-200 bg-white p-10 text-center text-sm text-neutral-700">Aucun voyage pour le moment. Créez votre premier brouillon.</p>
      ) : (
        <ul className="space-y-3">
          {dash.trips.map((tr) => (
            <li key={tr.id} className="rounded-2xl border border-neutral-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS[tr.status].tone}`}>{STATUS[tr.status].label}</span>
                  {tr.status === 'draft' && tr.submitted_at && <span className="ml-2 rounded-full bg-primary-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-primary-700">En attente de validation</span>}
                  <p className="mt-1 font-display text-base font-bold">{tr.title}</p>
                  <p className="text-xs text-neutral-600">{tr.scope === 'national' ? '🇨🇮' : '🌍'} {formatTripDates(tr.starts_on, tr.ends_on)} · {formatXOF(tr.base_price_xof)} · {tr.seats_booked}/{tr.seats_total} places</p>
                  <p className="text-xs text-neutral-700">{tr.bookings} réservation(s) · encaissé {formatXOF(tr.paid_xof)} · à encaisser {formatXOF(tr.due_xof)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {tr.status === 'draft' && <button onClick={() => { setEditing(tr.id); setCreating(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-bold">Modifier</button>}
                  {tr.status === 'draft' && !tr.submitted_at && <button onClick={() => submitForReview(tr.id)} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white">Soumettre</button>}
                  {(tr.status === 'published' || tr.status === 'full') && <button onClick={() => closeSales(tr.id)} className="rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-bold">Clore les ventes</button>}
                  {tr.bookings > 0 && <button onClick={() => toggleBookings(tr.id)} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-bold">{open === tr.id ? 'Masquer' : 'Voyageurs'}</button>}
                  {(tr.status === 'published' || tr.status === 'full') && <a href={`/voyages/${tr.slug}`} target="_blank" rel="noreferrer" className="text-xs font-semibold text-primary-700 underline">Voir</a>}
                </div>
              </div>
              {open === tr.id && (
                <div className="mt-3 overflow-x-auto rounded-xl bg-neutral-50">
                  {!bookings ? <p className="p-4 text-sm text-neutral-600">Chargement…</p> : (
                    <table className="w-full text-left text-xs">
                      <thead className="text-neutral-600"><tr><th className="p-2">Réf.</th><th className="p-2">Voyageur</th><th className="p-2">Tél.</th><th className="p-2">Pers.</th><th className="p-2">Payé / Total</th><th className="p-2">Statut</th></tr></thead>
                      <tbody>
                        {bookings.map((b) => (
                          <tr key={b.id} className="border-t border-neutral-200">
                            <td className="p-2 font-mono">{b.reference}</td><td className="p-2">{b.traveler_name ?? '—'}</td>
                            <td className="p-2">{b.contact_phone ? <a className="underline" href={`tel:${b.contact_phone}`}>{b.contact_phone}</a> : '—'}</td>
                            <td className="p-2">{b.participants}</td><td className="p-2">{formatXOF(b.paid_xof)} / {formatXOF(b.total_xof)}</td>
                            <td className="p-2">{BOOKING_LABEL[b.status] ?? b.status}</td>
                          </tr>
                        ))}
                      </tbody>
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
