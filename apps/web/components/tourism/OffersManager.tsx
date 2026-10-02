'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatXOF } from '@soutra/shared';
import { supabaseBrowser } from '@/lib/supabase';
import { TranslationFields, collectI18n } from './TranslationFields';

const KINDS: { key: string; label: string; hint: string }[] = [
  { key: 'discount', label: 'Promotion', hint: 'Réduction simple' },
  { key: 'flash', label: 'Vente flash', hint: 'Date de fin obligatoire' },
  { key: 'early_booking', label: 'Réservation anticipée', hint: 'Réserver au moins N jours avant' },
  { key: 'group', label: 'Offre groupe', hint: '2 personnes ou plus' },
  { key: 'couple', label: 'Offre couple', hint: 'Exactement 2 personnes' },
  { key: 'family', label: 'Offre famille', hint: '3 personnes ou plus' },
  { key: 'birthday', label: 'Anniversaire', hint: 'Code obligatoire' },
  { key: 'corporate', label: 'Entreprise', hint: 'Code obligatoire' },
];
const KIND_LABEL = Object.fromEntries(KINDS.map((k) => [k.key, k.label]));
const TRANSLATABLE = [{ name: 'title', label: 'Titre' }, { name: 'description', label: 'Description', multiline: true }];

interface Offer {
  id: string; owner_id: string | null; kind: string; code: string | null; title: string; description: string | null;
  applies_to: 'trips' | 'activities' | 'both'; trip_id: string | null; activity_id: string | null;
  discount_type: 'percent' | 'fixed'; discount_value: number; max_discount_xof: number | null;
  min_participants: number; max_participants: number | null; min_days_before: number | null; max_days_before: number | null;
  valid_from: string | null; valid_until: string | null; max_uses: number | null; max_uses_per_user: number | null;
  is_public: boolean; active: boolean; i18n: Record<string, Record<string, string>> | null;
}
interface Overview { offers_active: number; redemptions: number; discount_xof: number; by_kind: { kind: string; redemptions: number; discount_xof: number }[] }
interface Target { id: string; title: string }

const input = 'w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white placeholder:text-neutral-600';
const lbl = 'block text-xs font-semibold text-neutral-400';
const toLocal = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16) : '');

function describe(o: Offer) {
  const v = o.discount_type === 'percent' ? `−${o.discount_value} %` : `−${formatXOF(o.discount_value)}`;
  const parts = [v];
  if (o.code) parts.push(`code ${o.code}`); else parts.push('automatique');
  if (o.valid_until) parts.push(`jusqu’au ${new Date(o.valid_until).toLocaleDateString('fr-FR')}`);
  return parts.join(' · ');
}

/** Gestion des offres : `admin` = offres plateforme + vue d'ensemble, sinon offres du partenaire connecté. */
export function OffersManager({ admin = false }: { admin?: boolean }) {
  const sb = supabaseBrowser() as any;
  const [rows, setRows] = useState<Offer[]>([]);
  const [ov, setOv] = useState<Overview | null>(null);
  const [trips, setTrips] = useState<Target[]>([]);
  const [acts, setActs] = useState<Target[]>([]);
  const [editing, setEditing] = useState<Offer | 'new' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await sb.auth.getUser();
    let q = sb.from('tourism_offers').select('*').order('created_at', { ascending: false }).limit(200);
    if (!admin && user) q = q.eq('owner_id', user.id);
    const [{ data: list }, { data: o }, { data: t }, { data: a }] = await Promise.all([
      q,
      admin ? sb.rpc('admin_offers_overview') : Promise.resolve({ data: null }),
      admin ? Promise.resolve({ data: [] }) : sb.from('trips').select('id, title').eq('organizer_id', user?.id ?? '').order('created_at', { ascending: false }).limit(100),
      admin ? Promise.resolve({ data: [] }) : sb.from('activities').select('id, title').eq('organizer_id', user?.id ?? '').order('created_at', { ascending: false }).limit(100),
    ]);
    setRows((list as Offer[]) ?? []); setOv((o as Overview) ?? null);
    setTrips((t as Target[]) ?? []); setActs((a as Target[]) ?? []);
    setLoading(false);
  }, [sb, admin]);
  useEffect(() => { load(); }, [load]);

  async function toggle(o: Offer) {
    const { error } = await sb.from('tourism_offers').update({ active: !o.active }).eq('id', o.id);
    if (error) setErr(error.message); else load();
  }
  async function remove(o: Offer) {
    if (!confirm(`Supprimer l’offre « ${o.title} » ? Les réservations déjà faites gardent leur réduction.`)) return;
    const { error } = await sb.from('tourism_offers').delete().eq('id', o.id);
    if (error) setErr(error.message); else load();
  }

  return (
    <div className="space-y-5 text-white">
      {admin && ov && (
        <div className="grid grid-cols-3 gap-3">
          {[['Offres actives', ov.offers_active], ['Utilisations', ov.redemptions], ['Réductions accordées', formatXOF(Number(ov.discount_xof))]].map(([k, v]) => (
            <div key={String(k)} className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4"><p className="text-xs text-neutral-400">{k}</p><p className="mt-1 text-xl font-bold">{v}</p></div>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-bold">🏷️ {admin ? 'Offres et promotions' : 'Mes offres'}</h2>
        {!editing && <button onClick={() => setEditing('new')} className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-bold">+ Nouvelle offre</button>}
      </div>
      {err && <p role="alert" className="text-sm text-red-400">{err}</p>}
      {editing && (
        <OfferForm key={editing === 'new' ? 'new' : editing.id} offer={editing === 'new' ? null : editing} admin={admin} trips={trips} acts={acts}
                   onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); setErr(null); load(); }} />
      )}
      {loading ? <p className="text-center text-neutral-500">Chargement…</p> : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-800 p-8 text-center text-neutral-500">Aucune offre pour le moment.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{o.title} <span className="ml-1 rounded-full bg-primary-500/15 px-2 py-0.5 text-xs text-primary-300">{KIND_LABEL[o.kind]}</span>
                  {!o.is_public && <span className="ml-1 rounded-full bg-neutral-500/20 px-2 py-0.5 text-xs text-neutral-300">privée</span>}</p>
                <p className="text-sm text-neutral-400">{describe(o)}</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${o.active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-neutral-500/15 text-neutral-400'}`}>{o.active ? 'Active' : 'Désactivée'}</span>
              <button onClick={() => toggle(o)} className="text-sm text-neutral-300 underline">{o.active ? 'Désactiver' : 'Activer'}</button>
              <button onClick={() => setEditing(o)} className="text-sm text-neutral-300 underline">Modifier</button>
              <button onClick={() => remove(o)} className="text-sm text-red-400 underline">Supprimer</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OfferForm({ offer, admin, trips, acts, onCancel, onSaved }: {
  offer: Offer | null; admin: boolean; trips: Target[]; acts: Target[]; onCancel: () => void; onSaved: () => void;
}) {
  const sb = supabaseBrowser() as any;
  const [kind, setKind] = useState(offer?.kind ?? 'discount');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const o = offer;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const g = (k: string) => String(f.get(k) ?? '').trim();
    const int = (k: string) => (g(k) === '' ? null : Math.round(Number(g(k))));
    const when = (k: string) => (g(k) ? new Date(g(k)).toISOString() : null);
    const target = g('target'); // « trip:<id> » | « activity:<id> » | « »
    const [tk, tid] = target.split(':');
    let min = int('min_participants') ?? 1, max = int('max_participants');
    if (kind === 'couple') { min = 2; max = 2; }
    if (kind === 'group' && min < 2) min = 2;
    if (kind === 'family' && min < 3) min = 3;
    setBusy(true); setErr(null);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { setErr('Session expirée.'); setBusy(false); return; }
    const payload = {
      kind, title: g('title'), description: g('description') || null, code: g('code') ? g('code').toUpperCase() : null,
      applies_to: tk === 'trip' ? 'trips' : tk === 'activity' ? 'activities' : g('applies_to') || 'both',
      trip_id: tk === 'trip' ? tid : null, activity_id: tk === 'activity' ? tid : null,
      discount_type: g('discount_type'), discount_value: int('discount_value'), max_discount_xof: int('max_discount_xof'),
      min_participants: min, max_participants: max, min_days_before: int('min_days_before'), max_days_before: int('max_days_before'),
      valid_from: when('valid_from'), valid_until: when('valid_until'), max_uses: int('max_uses'), max_uses_per_user: int('max_uses_per_user'),
      is_public: f.get('is_public') === 'on', active: f.get('active') === 'on',
      i18n: collectI18n(f, TRANSLATABLE.map((x) => x.name), o?.i18n),
    };
    const { error } = o
      ? await sb.from('tourism_offers').update(payload).eq('id', o.id)
      : await sb.from('tourism_offers').insert({ ...payload, owner_id: admin ? null : user.id });
    setBusy(false);
    if (error) {
      const m = String(error.message ?? '');
      setErr(m.includes('ux_tourism_offers_code') || m.includes('duplicate') ? 'Ce code est déjà utilisé.'
        : m.includes('offers_percent_range') ? 'Un pourcentage doit être compris entre 1 et 90.'
        : m.includes('offers_code_required') ? 'Un code est obligatoire pour ce type d’offre.'
        : m.includes('offers_flash_window') ? 'Une vente flash doit avoir une date de fin.'
        : m.includes('offers_early_days') ? 'Indiquez le nombre de jours minimum avant le départ.'
        : m.includes('offers_window') ? 'La date de fin doit suivre la date de début.'
        : m.includes('row-level security') ? 'Droits insuffisants pour créer une offre.' : m);
      return;
    }
    onSaved();
  }

  const hint = KINDS.find((k) => k.key === kind)?.hint;
  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={lbl}>Type d’offre
          <select value={kind} onChange={(e) => setKind(e.target.value)} className={input}>{KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}</select>
          {hint && <span className="mt-1 block font-normal text-neutral-500">{hint}</span>}
        </label>
        <label className={lbl}>Titre *<input name="title" required maxLength={120} defaultValue={o?.title ?? ''} className={input} /></label>
        <label className={`${lbl} sm:col-span-2`}>Description<textarea name="description" rows={2} maxLength={600} defaultValue={o?.description ?? ''} className={input} /></label>
        <label className={lbl}>Code promo {['birthday', 'corporate'].includes(kind) ? '*' : '(optionnel — sans code, l’offre est automatique)'}
          <input name="code" required={['birthday', 'corporate'].includes(kind)} pattern="[A-Za-z0-9_\-]{3,32}" defaultValue={o?.code ?? ''} className={`${input} uppercase`} /></label>
        {admin ? (
          <label className={lbl}>S’applique à
            <select name="applies_to" defaultValue={o?.applies_to ?? 'both'} className={input}>
              <option value="both">Voyages et activités</option><option value="trips">Voyages</option><option value="activities">Activités</option>
            </select></label>
        ) : (
          <label className={lbl}>Cible
            <select name="target" defaultValue={o?.trip_id ? `trip:${o.trip_id}` : o?.activity_id ? `activity:${o.activity_id}` : ''} className={input}>
              <option value="">Tous mes voyages et activités</option>
              {trips.map((t) => <option key={t.id} value={`trip:${t.id}`}>🚌 {t.title}</option>)}
              {acts.map((a) => <option key={a.id} value={`activity:${a.id}`}>🎯 {a.title}</option>)}
            </select></label>
        )}
        <label className={lbl}>Réduction
          <select name="discount_type" defaultValue={o?.discount_type ?? 'percent'} className={input}><option value="percent">Pourcentage (%)</option><option value="fixed">Montant fixe (FCFA)</option></select></label>
        <label className={lbl}>Valeur * (% : 1 à 90)<input name="discount_value" type="number" min={1} required defaultValue={o?.discount_value ?? ''} className={input} /></label>
        <label className={lbl}>Plafond de réduction (FCFA)<input name="max_discount_xof" type="number" min={1} defaultValue={o?.max_discount_xof ?? ''} className={input} /></label>
        {kind !== 'couple' && <>
          <label className={lbl}>Participants minimum<input name="min_participants" type="number" min={kind === 'family' ? 3 : kind === 'group' ? 2 : 1} defaultValue={o?.min_participants ?? (kind === 'family' ? 3 : kind === 'group' ? 2 : 1)} className={input} /></label>
          <label className={lbl}>Participants maximum<input name="max_participants" type="number" min={1} defaultValue={o?.max_participants ?? ''} className={input} /></label>
        </>}
        <label className={lbl}>Réserver au moins N jours avant le départ {kind === 'early_booking' ? '*' : ''}<input name="min_days_before" type="number" min={0} required={kind === 'early_booking'} defaultValue={o?.min_days_before ?? ''} className={input} /></label>
        <label className={lbl}>…ou au plus N jours avant (dernière minute)<input name="max_days_before" type="number" min={0} defaultValue={o?.max_days_before ?? ''} className={input} /></label>
        <label className={lbl}>Début de validité<input name="valid_from" type="datetime-local" defaultValue={toLocal(o?.valid_from ?? null)} className={input} /></label>
        <label className={lbl}>Fin de validité {kind === 'flash' ? '*' : ''}<input name="valid_until" type="datetime-local" required={kind === 'flash'} defaultValue={toLocal(o?.valid_until ?? null)} className={input} /></label>
        <label className={lbl}>Utilisations maximum (total)<input name="max_uses" type="number" min={1} defaultValue={o?.max_uses ?? ''} className={input} /></label>
        <label className={lbl}>Utilisations maximum par client<input name="max_uses_per_user" type="number" min={1} defaultValue={o?.max_uses_per_user ?? ''} className={input} /></label>
        <label className="flex items-center gap-2 text-sm text-neutral-300"><input type="checkbox" name="is_public" defaultChecked={o?.is_public ?? true} /> Visible publiquement (sinon, code à communiquer)</label>
        <label className="flex items-center gap-2 text-sm text-neutral-300"><input type="checkbox" name="active" defaultChecked={o?.active ?? true} /> Active</label>
        <TranslationFields fields={TRANSLATABLE} defaults={o?.i18n} />
      </div>
      {err && <p role="alert" className="text-sm text-red-400">{err}</p>}
      <div className="flex items-center gap-3">
        <button disabled={busy} className="rounded-lg bg-primary-500 px-5 py-2 text-sm font-bold text-white disabled:opacity-60">{busy ? 'Enregistrement…' : o ? 'Enregistrer' : 'Créer l’offre'}</button>
        <button type="button" onClick={onCancel} className="text-sm text-neutral-400 underline">Annuler</button>
      </div>
    </form>
  );
}
