'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase';
import { formatXOF } from '@soutra/shared';

/* ─────────────────────────────────────────────────── *
 *  TYPES                                              *
 * ─────────────────────────────────────────────────── */

type BookingStatus = 'pending' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'refunded';
type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

interface Booking {
  id: string;
  booking_number: string;
  user_id: string;
  room_id: string;
  venue_id: string;
  check_in_date: string;
  check_out_date: string;
  nights_count: number;
  guests_count: number;
  unit_price_xof: number;
  total_xof: number;
  status: BookingStatus;
  contact_name: string | null;
  contact_phone: string | null;
  notes: string | null;
  payment_status: PaymentStatus;
  created_at: string;
  confirmed_at: string | null;
  checked_in_at: string | null;
  checked_out_at: string | null;
  // Jointures
  room: { name: string; room_type: string | null } | null;
}

const STATUS_META: Record<BookingStatus, { label: string; tone: string }> = {
  pending:      { label: 'En attente paiement', tone: 'bg-amber-50 text-amber-700 border-amber-200' },
  confirmed:    { label: 'Confirmée',           tone: 'bg-blue-50 text-blue-700 border-blue-200' },
  checked_in:   { label: 'Arrivé',              tone: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  checked_out:  { label: 'Séjour terminé',      tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  cancelled:    { label: 'Annulée',             tone: 'bg-neutral-100 text-neutral-600 border-neutral-300' },
  refunded:     { label: 'Remboursée',          tone: 'bg-purple-50 text-purple-700 border-purple-200' },
};

const NEXT_STATUS: Partial<Record<BookingStatus, { next: BookingStatus; label: string }>> = {
  confirmed:   { next: 'checked_in',  label: 'Marquer arrivée' },
  checked_in:  { next: 'checked_out', label: 'Marquer départ' },
};

export function HotelBookingsTab({ venueId }: { venueId: string }) {
  const sb = supabaseBrowser();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | BookingStatus>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const flash = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok });
    window.setTimeout(() => setToast(null), 3000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (sb as any)
      .from('room_bookings')
      .select(`
        id, booking_number, user_id, room_id, venue_id,
        check_in_date, check_out_date, nights_count, guests_count,
        unit_price_xof, total_xof, status,
        contact_name, contact_phone, notes,
        payment_status, created_at, confirmed_at, checked_in_at, checked_out_at,
        room:rooms(name, room_type)
      `)
      .eq('venue_id', venueId)
      .order('check_in_date', { ascending: false })
      .limit(200);
    if (error) {
      console.error('[hotel-bookings] load:', error);
      setBookings([]);
    } else {
      setBookings(((data as any[]) ?? []).map((b) => ({ ...b, room: b.room || null })));
    }
    setLoading(false);
  }, [sb, venueId]);

  useEffect(() => { load(); }, [load]);

  const handleStatusChange = useCallback(async (bookingId: string, status: BookingStatus, reason?: string) => {
    setActionLoading(bookingId);
    const { error } = await (sb.rpc as any)('update_room_booking_status', {
      p_booking_id: bookingId,
      p_status: status,
      p_reason: reason || null,
    });
    setActionLoading(null);
    if (error) flash(error.message, false);
    else { flash(`Statut → ${STATUS_META[status].label}`); load(); }
  }, [sb, flash, load]);

  const handleCancel = useCallback(async (bookingId: string) => {
    const reason = window.prompt('Raison de l\'annulation (optionnel) :');
    if (reason === null) return;
    handleStatusChange(bookingId, 'cancelled', reason);
  }, [handleStatusChange]);

  const filtered = useMemo(() => {
    if (filter === 'all') return bookings;
    return bookings.filter((b) => b.status === filter);
  }, [bookings, filter]);

  const counts = useMemo(() => {
    const c: Record<BookingStatus | 'all', number> = {
      all: bookings.length,
      pending: 0, confirmed: 0, checked_in: 0, checked_out: 0, cancelled: 0, refunded: 0,
    };
    bookings.forEach((b) => { c[b.status]++; });
    return c;
  }, [bookings]);

  return (
    <div className="space-y-6">
      {toast && (
        <div className={`fixed left-1/2 top-6 z-[100] flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold shadow-2xl ${
          toast.ok ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
        }`}>
          {toast.ok ? '✓' : '⚠'} {toast.msg}
        </div>
      )}

      <div>
        <h2 className="font-display text-2xl font-bold text-neutral-900">Réservations chambres</h2>
        <p className="text-sm text-neutral-500">
          {bookings.length} réservation{bookings.length > 1 ? 's' : ''} ·{' '}
          {counts.confirmed + counts.checked_in} actif{counts.confirmed + counts.checked_in > 1 ? 's' : ''}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(['all', 'pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              filter === s
                ? 'border-primary-500 bg-primary-50 text-primary-700'
                : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300'
            }`}
          >
            {s === 'all' ? 'Toutes' : STATUS_META[s].label} ({counts[s]})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-12 text-center text-neutral-500">
          Chargement…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-12 text-center">
          <p className="text-sm text-neutral-500">Aucune réservation dans ce filtre.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((b) => {
            const isOpen = expandedId === b.id;
            const next = NEXT_STATUS[b.status];
            const canCancel = ['pending', 'confirmed'].includes(b.status);
            return (
              <li key={b.id} className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                <button
                  onClick={() => setExpandedId(isOpen ? null : b.id)}
                  className="flex w-full items-start gap-3 p-4 text-left transition hover:bg-neutral-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-neutral-700">{b.booking_number}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS_META[b.status].tone}`}>
                        {STATUS_META[b.status].label}
                      </span>
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-600">
                        🛏️ {b.room?.name || 'Chambre'}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm font-semibold text-neutral-900">
                      {b.contact_name || 'Client'}
                      {b.contact_phone && <span className="ml-1 font-mono text-xs text-neutral-500">· {b.contact_phone}</span>}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {formatDate(b.check_in_date)} → {formatDate(b.check_out_date)} ·{' '}
                      {b.nights_count} nuit{b.nights_count > 1 ? 's' : ''} ·{' '}
                      {b.guests_count} pers.
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-bold text-neutral-900">{formatXOF(b.total_xof)}</p>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`mt-1 ml-auto text-neutral-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}>
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-neutral-100 bg-neutral-50/50 p-4">
                    {/* Détails séjour */}
                    <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <DetailCard label="Arrivée" value={formatDate(b.check_in_date)} highlight />
                      <DetailCard label="Départ" value={formatDate(b.check_out_date)} highlight />
                      <DetailCard label="Durée" value={`${b.nights_count} nuit${b.nights_count > 1 ? 's' : ''}`} />
                    </div>

                    {/* Totaux */}
                    <div className="mb-4 space-y-1 rounded-xl bg-white px-4 py-3 text-sm">
                      <Row label={`${formatXOF(b.unit_price_xof)} × ${b.nights_count} nuits`} value={formatXOF(b.total_xof)} />
                      <Row label="Total" value={formatXOF(b.total_xof)} bold />
                      <Row
                        label="Paiement"
                        value={
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            b.payment_status === 'paid' ? 'bg-emerald-50 text-emerald-700'
                            : b.payment_status === 'pending' ? 'bg-amber-50 text-amber-700'
                            : 'bg-red-50 text-red-700'
                          }`}>
                            {b.payment_status === 'paid' ? 'Payé'
                             : b.payment_status === 'pending' ? 'En attente'
                             : b.payment_status === 'failed' ? 'Échec'
                             : 'Remboursé'}
                          </span>
                        }
                      />
                    </div>

                    {/* Notes */}
                    {b.notes && (
                      <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
                        <p className="text-xs font-bold uppercase text-amber-700">Notes du client</p>
                        <p className="mt-1 whitespace-pre-wrap text-neutral-900">{b.notes}</p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2">
                      {b.status === 'pending' && (
                        <button
                          onClick={() => handleStatusChange(b.id, 'confirmed')}
                          disabled={actionLoading === b.id}
                          className="rounded-full bg-blue-500 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-600 disabled:opacity-50"
                        >
                          ✓ Confirmer manuellement
                        </button>
                      )}
                      {next && (
                        <button
                          onClick={() => handleStatusChange(b.id, next.next)}
                          disabled={actionLoading === b.id}
                          className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-600 disabled:opacity-50"
                        >
                          → {next.label}
                        </button>
                      )}
                      {canCancel && (
                        <button
                          onClick={() => handleCancel(b.id)}
                          disabled={actionLoading === b.id}
                          className="rounded-full border border-red-300 bg-white px-4 py-2 text-xs font-bold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                        >
                          Annuler
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function DetailCard({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl p-3 ${highlight ? 'bg-primary-50 border border-primary-200' : 'bg-white border border-neutral-200'}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{label}</p>
      <p className={`mt-1 text-sm font-bold ${highlight ? 'text-primary-700' : 'text-neutral-900'}`}>{value}</p>
    </div>
  );
}

function Row({ label, value, bold = false }: { label: string; value: React.ReactNode; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={bold ? 'font-bold text-neutral-900' : 'text-neutral-600'}>{label}</span>
      <span className={bold ? 'font-mono font-bold text-neutral-900' : 'font-mono text-neutral-700'}>{value}</span>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  });
}
