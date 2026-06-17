'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase';
import { formatXOF } from '@soutra/shared';

/* ─────────────────────────────────────────────────── *
 *  TYPES                                              *
 * ─────────────────────────────────────────────────── */

type RoomStatus = 'active' | 'maintenance' | 'archived';

interface Room {
  id: string;
  venue_id: string;
  name: string;
  description: string | null;
  capacity: number;
  price_per_night_xof: number;
  photos: string[];
  amenities: string[];
  room_type: string | null;
  status: RoomStatus;
  position: number | null;
  created_at: string;
}

const STATUS_META: Record<RoomStatus, { label: string; bg: string }> = {
  active:      { label: 'Disponible',  bg: 'bg-emerald-50 text-emerald-700' },
  maintenance: { label: 'Maintenance', bg: 'bg-amber-50 text-amber-700' },
  archived:    { label: 'Archivée',    bg: 'bg-neutral-100 text-neutral-600' },
};

const AMENITY_SUGGESTIONS = ['Wifi', 'Climatisation', 'TV', 'Coffre-fort', 'Mini-bar', 'Balcon', 'Vue mer', 'Salle de bain privée', 'Petit-déjeuner inclus'];

/**
 * Onglet Pro "Chambres" — CRUD pour les venues hôteliers.
 * Pattern miroir de ShopProductsTab mais adapté aux chambres (capacity,
 * prix/nuit, amenities, pas de stock).
 */
export function HotelRoomsTab({ venueId }: { venueId: string }) {
  const sb = supabaseBrowser();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Room | null>(null);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const flash = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok });
    window.setTimeout(() => setToast(null), 3000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (sb as any)
      .from('rooms')
      .select('*')
      .eq('venue_id', venueId)
      .order('status', { ascending: true })
      .order('position', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[hotel-rooms] load:', error);
      setRooms([]);
    } else {
      setRooms((data as Room[]) ?? []);
    }
    setLoading(false);
  }, [sb, venueId]);

  useEffect(() => { load(); }, [load]);

  const handleStatusToggle = useCallback(async (r: Room) => {
    const next: RoomStatus =
      r.status === 'active' ? 'maintenance'
      : r.status === 'maintenance' ? 'archived'
      : 'active';
    const { error } = await (sb as any)
      .from('rooms')
      .update({ status: next })
      .eq('id', r.id);
    if (error) flash(error.message, false);
    else { flash(`Chambre → ${STATUS_META[next].label}`); load(); }
  }, [sb, flash, load]);

  const handleDelete = useCallback(async (r: Room) => {
    if (!confirm(`Supprimer définitivement "${r.name}" ?\nLes réservations existantes ne sont pas affectées.`)) return;
    const { error } = await (sb as any).from('rooms').delete().eq('id', r.id);
    if (error) flash(error.message, false);
    else { flash('Chambre supprimée'); load(); }
  }, [sb, flash, load]);

  return (
    <div className="space-y-6">
      {toast && (
        <div className={`fixed left-1/2 top-6 z-[100] flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold shadow-2xl ${
          toast.ok ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
        }`}>
          {toast.ok ? '✓' : '⚠'} {toast.msg}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-neutral-900">Mes chambres</h2>
          <p className="text-sm text-neutral-500">
            {rooms.length} chambre{rooms.length > 1 ? 's' : ''} ·{' '}
            {rooms.filter((r) => r.status === 'active').length} disponible{rooms.filter((r) => r.status === 'active').length > 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="rounded-full bg-primary-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary-500/30 transition hover:bg-primary-600 active:scale-[0.98]"
        >
          + Ajouter une chambre
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        {loading ? (
          <div className="p-12 text-center text-neutral-500">Chargement…</div>
        ) : rooms.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm text-neutral-500">Aucune chambre publiée.</p>
            <button
              onClick={() => setCreating(true)}
              className="mt-4 rounded-full bg-primary-500 px-5 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-primary-600"
            >
              Créer ma première chambre
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                  <th className="px-4 py-3">Chambre</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3 text-right">Capacité</th>
                  <th className="px-4 py-3 text-right">Prix / nuit</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {rooms.map((r) => (
                  <tr key={r.id} className="border-b border-neutral-100 transition hover:bg-neutral-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {r.photos[0] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.photos[0]} alt={r.name} className="h-10 w-10 rounded-lg object-cover" />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-100 text-neutral-400">🛏️</div>
                        )}
                        <div>
                          <p className="font-semibold text-neutral-900">{r.name}</p>
                          {r.amenities.length > 0 && (
                            <p className="text-[10px] text-neutral-500">{r.amenities.slice(0, 3).join(' · ')}{r.amenities.length > 3 ? ` +${r.amenities.length - 3}` : ''}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-neutral-600">{r.room_type || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-mono">{r.capacity} pers.</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">{formatXOF(r.price_per_night_xof)}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleStatusToggle(r)}
                        className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${STATUS_META[r.status].bg} hover:opacity-80`}
                        title="Cliquer pour changer le statut"
                      >
                        {STATUS_META[r.status].label}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setEditing(r)}
                          className="rounded-lg px-2.5 py-1 text-xs font-semibold text-primary-600 transition hover:bg-primary-50"
                        >
                          Modifier
                        </button>
                        <button
                          onClick={() => handleDelete(r)}
                          className="rounded-lg px-2.5 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                        >
                          Suppr
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(creating || editing) && (
        <RoomFormModal
          venueId={venueId}
          room={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); flash('Chambre enregistrée'); load(); }}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────── *
 *  MODAL FORMULAIRE                                   *
 * ─────────────────────────────────────────────────── */

function RoomFormModal({
  venueId,
  room,
  onClose,
  onSaved,
}: {
  venueId: string;
  room: Room | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const sb = supabaseBrowser();
  const [name, setName] = useState(room?.name || '');
  const [description, setDescription] = useState(room?.description || '');
  const [roomType, setRoomType] = useState(room?.room_type || '');
  const [capacity, setCapacity] = useState<string>(String(room?.capacity ?? 2));
  const [price, setPrice] = useState<string>(String(room?.price_per_night_xof ?? ''));
  const [photoUrl, setPhotoUrl] = useState(room?.photos?.[0] || '');
  const [amenities, setAmenities] = useState<string[]>(room?.amenities || []);
  const [amenityInput, setAmenityInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addAmenity = (a: string) => {
    const v = a.trim();
    if (v && !amenities.includes(v)) setAmenities([...amenities, v]);
  };
  const removeAmenity = (a: string) => setAmenities(amenities.filter((x) => x !== a));

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const priceNum = Number(price);
    const capacityNum = Number(capacity);
    if (!name.trim() || !Number.isFinite(priceNum) || priceNum < 0) {
      setError('Nom et prix sont requis');
      return;
    }
    if (!Number.isFinite(capacityNum) || capacityNum < 1 || capacityNum > 20) {
      setError('Capacité entre 1 et 20 personnes');
      return;
    }

    const payload = {
      venue_id: venueId,
      name: name.trim(),
      description: description.trim() || null,
      room_type: roomType.trim() || null,
      capacity: Math.floor(capacityNum),
      price_per_night_xof: Math.round(priceNum),
      photos: photoUrl.trim() ? [photoUrl.trim()] : [],
      amenities,
    };

    setSaving(true);
    const { error } = room
      ? await (sb as any).from('rooms').update(payload).eq('id', room.id)
      : await (sb as any).from('rooms').insert(payload);
    setSaving(false);

    if (error) {
      setError(error.message || 'Erreur');
      return;
    }
    onSaved();
  }, [sb, venueId, room, name, description, roomType, capacity, price, photoUrl, amenities, onSaved]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[200] flex items-end justify-center bg-neutral-900/70 backdrop-blur-md sm:items-center"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-slide-up flex w-full max-w-xl flex-col rounded-t-3xl border border-neutral-200 bg-white p-6 shadow-2xl sm:rounded-3xl sm:p-8"
      >
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-neutral-300 sm:hidden" />

        <div className="flex items-start justify-between gap-3">
          <h3 className="font-display text-xl font-bold text-neutral-900">
            {room ? 'Modifier la chambre' : 'Nouvelle chambre'}
          </h3>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-neutral-500 hover:bg-neutral-100">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            ⚠ {error}
          </div>
        )}

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nom de la chambre *" className="sm:col-span-2">
            <input
              type="text" value={name} onChange={(e) => setName(e.target.value)}
              maxLength={200} required
              className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm focus:border-primary-500 focus:outline-none"
              placeholder="Chambre Deluxe vue océan"
            />
          </Field>
          <Field label="Type">
            <input
              type="text" value={roomType} onChange={(e) => setRoomType(e.target.value)}
              className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm focus:border-primary-500 focus:outline-none"
              placeholder="Suite, Deluxe, Standard…"
            />
          </Field>
          <Field label="Capacité (personnes) *">
            <input
              type="number" inputMode="numeric" min={1} max={20} required
              value={capacity} onChange={(e) => setCapacity(e.target.value)}
              className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-2.5 font-mono text-sm focus:border-primary-500 focus:outline-none"
              placeholder="2"
            />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <textarea
              value={description} onChange={(e) => setDescription(e.target.value)}
              rows={3} maxLength={2000}
              className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm focus:border-primary-500 focus:outline-none"
              placeholder="Confortable suite avec balcon, climatisée, vue panoramique…"
            />
          </Field>
          <Field label="Prix par nuit (FCFA) *" className="sm:col-span-2">
            <input
              type="number" inputMode="numeric" min={0} step={1000} required
              value={price} onChange={(e) => setPrice(e.target.value)}
              className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-2.5 font-mono text-sm focus:border-primary-500 focus:outline-none"
              placeholder="45000"
            />
          </Field>

          <Field label="Photo principale (URL)" className="sm:col-span-2">
            <input
              type="url" value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)}
              className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm focus:border-primary-500 focus:outline-none"
              placeholder="https://…"
            />
            <p className="mt-1 text-[11px] text-neutral-500">
              Upload Supabase Storage à venir. Pour l&apos;instant, copier-coller l&apos;URL.
            </p>
          </Field>

          <Field label="Équipements" className="sm:col-span-2">
            <div className="flex flex-wrap gap-1.5">
              {amenities.map((a) => (
                <span
                  key={a}
                  className="inline-flex items-center gap-1 rounded-full bg-primary-100 px-2.5 py-1 text-xs font-semibold text-primary-700"
                >
                  {a}
                  <button
                    type="button"
                    onClick={() => removeAmenity(a)}
                    className="ml-0.5 hover:text-red-600"
                  >×</button>
                </span>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={amenityInput}
                onChange={(e) => setAmenityInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addAmenity(amenityInput);
                    setAmenityInput('');
                  }
                }}
                className="flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none"
                placeholder="Ajouter (Entrée pour valider)…"
              />
              <button
                type="button"
                onClick={() => { addAmenity(amenityInput); setAmenityInput(''); }}
                className="rounded-lg bg-neutral-100 px-3 py-1.5 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-200"
              >
                +
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {AMENITY_SUGGESTIONS.filter((s) => !amenities.includes(s)).slice(0, 6).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => addAmenity(s)}
                  className="rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-[11px] font-medium text-neutral-600 transition hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700"
                >
                  + {s}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button" onClick={onClose} disabled={saving}
            className="rounded-2xl border border-neutral-300 bg-white px-5 py-3 text-sm font-bold text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="submit" disabled={saving}
            className="rounded-2xl bg-primary-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-primary-500/30 transition hover:bg-primary-600 disabled:opacity-50"
          >
            {saving ? 'Enregistrement…' : room ? 'Enregistrer' : 'Créer la chambre'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label, children, className = '',
}: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-neutral-600">
        {label}
      </span>
      {children}
    </label>
  );
}
