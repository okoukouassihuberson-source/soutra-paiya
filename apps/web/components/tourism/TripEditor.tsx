'use client';

import { useEffect, useState } from 'react';
import { slugify, CONTINENTS } from '@soutra/shared';
import { supabaseBrowser } from '@/lib/supabase';
import { ImageField, GalleryField } from './ImageUpload';
import { TranslationFields, collectI18n } from './TranslationFields';
import { PREFIXED_LOCALES } from '@/lib/i18n/config';

const TRANSLATABLE = [
  { name: 'title', label: 'Titre' }, { name: 'summary', label: 'Résumé' }, { name: 'description', label: 'Description', multiline: true },
  { name: 'conditions', label: 'Conditions', multiline: true }, { name: 'transport', label: 'Transport' }, { name: 'lodging', label: 'Hébergement' },
  { name: 'meals', label: 'Repas' }, { name: 'inclusions', label: 'Inclus', list: true }, { name: 'exclusions', label: 'Non inclus', list: true },
  { name: 'activities', label: 'Activités', list: true },
];
const lines = (v: FormDataEntryValue | null) => String(v ?? '').split('\n').map((x) => x.trim());

const input = 'w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white placeholder:text-neutral-600';
const lbl = 'block text-xs font-semibold text-neutral-400';

interface Loaded {
  trip: Record<string, any>;
  days: string;
  packages: string;
  daysTr: Record<string, string>;
  packagesTr: Record<string, string>;
  existingPackages: { id: string; name: string }[];
}

/**
 * Création / modification d'un voyage (thème sombre : admin et espace organisateur).
 * Sans `tripId` : crée un BROUILLON. Avec `tripId` : met à jour (programme
 * remplacé ; formules mises à jour par nom, les retirées sont désactivées car
 * des réservations peuvent y être rattachées). La publication reste réservée
 * à l'admin (garde SQL tg_trips_guard).
 */
export function TripEditor({ tripId, onSaved, onCancel }: { tripId?: string; onSaved: () => void; onCancel?: () => void }) {
  const sb = supabaseBrowser() as any;
  const [scope, setScope] = useState<'national' | 'international'>('national');
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(!!tripId);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!tripId) return;
    (async () => {
      const [{ data: trip }, { data: days }, { data: pkgs }] = await Promise.all([
        sb.from('trips').select('*').eq('id', tripId).maybeSingle(),
        sb.from('trip_itineraries').select('day_number, title, stops, i18n').eq('trip_id', tripId).order('day_number'),
        sb.from('trip_packages').select('id, name, price_xof, includes, is_active, i18n').eq('trip_id', tripId).order('position'),
      ]);
      if (!trip) { setErr('Voyage introuvable.'); setLoading(false); return; }
      setScope(trip.scope);
      const active = (pkgs ?? []).filter((p: any) => p.is_active);
      setLoaded({
        trip,
        days: (days ?? []).map((d: any) => `${d.title}${d.stops?.length ? ` : ${d.stops.join(', ')}` : ''}`).join('\n'),
        packages: active.map((p: any) => `${p.name} | ${p.price_xof} | ${(p.includes ?? []).join(', ')}`).join('\n'),
        daysTr: Object.fromEntries(PREFIXED_LOCALES.map((l) => [l, (days ?? []).map((d: any) => d.i18n?.[l]?.title ?? '').join('\n')])),
        packagesTr: Object.fromEntries(PREFIXED_LOCALES.map((l) => [l, active.map((p: any) => p.i18n?.[l]?.name ?? '').join('\n')])),
        existingPackages: (pkgs ?? []).map((p: any) => ({ id: p.id, name: p.name })),
      });
      setLoading(false);
    })();
  }, [sb, tripId]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const g = (k: string) => String(f.get(k) ?? '').trim();
    const list = (k: string) => g(k).split(/\n|,/).map((x) => x.trim()).filter(Boolean);
    setBusy(true); setErr(null);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { setErr('Session expirée.'); setBusy(false); return; }

    const national = scope === 'national';
    const fields = {
      scope, title: g('title'), summary: g('summary') || null, description: g('description') || null,
      country: national ? "Côte d'Ivoire" : g('country'), country_code: national ? 'CI' : g('country_code').toUpperCase(),
      continent: national ? null : g('continent') || null, city: g('city') || null, cover_url: g('cover_url') || null,
      starts_on: g('starts_on'), ends_on: g('ends_on'), base_price_xof: Number(g('base_price_xof')), deposit_pct: Number(g('deposit_pct') || 100),
      seats_total: Number(g('seats_total')), departure_point: g('departure_point') || null,
      departure_time: g('departure_time') || null, return_time: g('return_time') || null,
      transport: g('transport') || null, lodging: g('lodging') || null, meals: g('meals') || null,
      flight_info: g('flight_info') || null, hotel_info: g('hotel_info') || null, visa_info: g('visa_info') || null, insurance_info: g('insurance_info') || null,
      activities: list('activities'), inclusions: list('inclusions'), exclusions: list('exclusions'),
      conditions: g('conditions') || null, contact_phone: g('contact_phone') || null, contact_whatsapp: g('contact_whatsapp') || null,
      is_circuit: f.get('is_circuit') === 'on',
      i18n: collectI18n(f, TRANSLATABLE.map((x) => x.name), loaded?.trip?.i18n),
    };

    let id = tripId;
    if (tripId) {
      const { error } = await sb.from('trips').update(fields).eq('id', tripId);
      if (error) { setErr(explain(error.message)); setBusy(false); return; }
    } else {
      const { data: trip, error } = await sb.from('trips').insert({
        ...fields, organizer_id: user.id, status: 'draft',
        slug: `${slugify(g('title')).slice(0, 60)}-${Math.random().toString(36).slice(2, 6)}`,
      }).select('id').single();
      if (error || !trip) { setErr(explain(error?.message)); setBusy(false); return; }
      id = trip.id;
    }

    // Programme : une ligne par jour « Titre : étape 1, étape 2 » (remplacé en entier)
    const days = g('days').split('\n').map((l) => l.trim()).filter(Boolean).map((l, i) => {
      const [title, stops = ''] = l.split(':');
      const tr = Object.fromEntries(PREFIXED_LOCALES.map((l) => [l, lines(f.get(`days_tr:${l}`))[i]]).filter(([, v]) => v).map(([l, v]) => [l, { title: v }]));
      return { trip_id: id, day_number: i + 1, title: title.trim(), stops: stops.split(',').map((s) => s.trim()).filter(Boolean), i18n: tr };
    });
    // Formules : une ligne par formule « Nom | prix | inclus 1, inclus 2 »
    const packages = g('packages').split('\n').map((l) => l.trim()).filter(Boolean).map((l, i) => {
      const [name, price, inc = ''] = l.split('|').map((x) => x.trim());
      const code = (['essentielle', 'confort', 'premium', 'vip'] as const).find((c) => name.toLowerCase().includes(c)) ?? 'custom';
      const tr = Object.fromEntries(PREFIXED_LOCALES.map((l) => [l, lines(f.get(`packages_tr:${l}`))[i]]).filter(([, v]) => v).map(([l, v]) => [l, { name: v }]));
      return { trip_id: id, code, name, price_xof: Number(price), position: i, includes: inc.split(',').map((s) => s.trim()).filter(Boolean), is_active: true, i18n: tr };
    });

    const errors: string[] = [];
    if (tripId) {
      const r = await sb.from('trip_itineraries').delete().eq('trip_id', id);
      if (r.error) errors.push(r.error.message);
      const names = new Set(packages.map((p) => p.name));
      const gone = (loaded?.existingPackages ?? []).filter((p) => !names.has(p.name)).map((p) => p.id);
      if (gone.length) { const r2 = await sb.from('trip_packages').update({ is_active: false }).in('id', gone); if (r2.error) errors.push(r2.error.message); }
    }
    if (days.length) { const r = await sb.from('trip_itineraries').insert(days); if (r.error) errors.push(r.error.message); }
    if (packages.length) { const r = await sb.from('trip_packages').upsert(packages, { onConflict: 'trip_id,name' }); if (r.error) errors.push(r.error.message); }
    setBusy(false);
    if (errors.length) { setErr(`Voyage enregistré, mais programme/formules refusés : ${errors[0]}`); return; }
    onSaved();
  }

  if (loading) return <p className="p-6 text-center text-neutral-500">Chargement…</p>;
  const t = loaded?.trip ?? {};
  const v = (k: string) => (t[k] ?? '') as string | number;
  const hhmm = (x?: string | null) => (x ? x.slice(0, 5) : '');

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5 text-white">
      <div className="flex flex-wrap gap-2">
        {(['national', 'international'] as const).map((s) => (
          <button type="button" key={s} onClick={() => setScope(s)} disabled={!!tripId}
            className={`rounded-full border px-4 py-1.5 text-xs font-bold disabled:opacity-60 ${scope === s ? 'border-primary-500 bg-primary-500/15 text-primary-400' : 'border-neutral-800 text-neutral-400'}`}>
            {s === 'national' ? '🇨🇮 National' : '🌍 International'}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-xs text-neutral-300"><input type="checkbox" name="is_circuit" defaultChecked={!!t.is_circuit} /> Circuit multi-destinations</label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={`${lbl} sm:col-span-2`}>Titre *<input name="title" required maxLength={200} defaultValue={v('title')} className={input} /></label>
        <label className={`${lbl} sm:col-span-2`}>Résumé<input name="summary" maxLength={500} defaultValue={v('summary')} className={input} /></label>
        <label className={lbl}>Ville / destination<input name="city" defaultValue={v('city')} className={input} /></label>
        <ImageField name="cover_url" label="Image de couverture — requise pour soumettre" defaultValue={v('cover_url') as string} className="sm:col-span-2" />
        {scope === 'international' && (<>
          <label className={lbl}>Pays *<input name="country" required defaultValue={v('country')} className={input} /></label>
          <label className={lbl}>Code pays (2 lettres) *<input name="country_code" required pattern="[A-Za-z]{2}" maxLength={2} defaultValue={v('country_code')} className={input} /></label>
          <label className={lbl}>Continent *<select name="continent" required defaultValue={v('continent') as string} className={input}>{CONTINENTS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></label>
        </>)}
        <label className={lbl}>Début *<input name="starts_on" type="date" required defaultValue={v('starts_on')} className={input} /></label>
        <label className={lbl}>Fin *<input name="ends_on" type="date" required defaultValue={v('ends_on')} className={input} /></label>
        <label className={lbl}>Prix de base (XOF) *<input name="base_price_xof" type="number" min={0} required defaultValue={v('base_price_xof')} className={input} /></label>
        <label className={lbl}>Places *<input name="seats_total" type="number" min={1} required defaultValue={v('seats_total')} className={input} /></label>
        <label className={lbl}>Acompte (% du total, 100 = pas d'acompte)<input name="deposit_pct" type="number" min={10} max={100} defaultValue={t.deposit_pct ?? 100} className={input} /></label>
        <label className={lbl}>Point de départ<input name="departure_point" defaultValue={v('departure_point')} className={input} /></label>
        <label className={lbl}>Heure de départ<input name="departure_time" type="time" defaultValue={hhmm(t.departure_time)} className={input} /></label>
        <label className={lbl}>Heure de retour<input name="return_time" type="time" defaultValue={hhmm(t.return_time)} className={input} /></label>
        <label className={lbl}>Transport<input name="transport" defaultValue={v('transport')} className={input} /></label>
        <label className={lbl}>Hébergement<input name="lodging" defaultValue={v('lodging')} className={input} /></label>
        <label className={lbl}>Repas<input name="meals" defaultValue={v('meals')} className={input} /></label>
        {scope === 'international' && (<>
          <label className={lbl}>Vol<input name="flight_info" defaultValue={v('flight_info')} className={input} /></label>
          <label className={lbl}>Hôtel<input name="hotel_info" defaultValue={v('hotel_info')} className={input} /></label>
          <label className={lbl}>Visa<input name="visa_info" defaultValue={v('visa_info')} className={input} /></label>
          <label className={lbl}>Assurance<input name="insurance_info" defaultValue={v('insurance_info')} className={input} /></label>
        </>)}
        <label className={`${lbl} sm:col-span-2`}>Description<textarea name="description" rows={3} defaultValue={v('description')} className={input} /></label>
        <label className={lbl}>Activités (virgule ou ligne)<textarea name="activities" rows={2} defaultValue={(t.activities ?? []).join('\n')} className={input} /></label>
        <label className={lbl}>Inclus<textarea name="inclusions" rows={2} defaultValue={(t.inclusions ?? []).join('\n')} className={input} /></label>
        <label className={lbl}>Non inclus<textarea name="exclusions" rows={2} defaultValue={(t.exclusions ?? []).join('\n')} className={input} /></label>
        <label className={lbl}>Conditions<textarea name="conditions" rows={2} defaultValue={v('conditions')} className={input} /></label>
        <label className={`${lbl} sm:col-span-2`}>Programme (une ligne par jour : « Titre : étape 1, étape 2 »)<textarea name="days" rows={3} defaultValue={loaded?.days ?? ''} className={input} placeholder="Abidjan → Grand-Bassam : Abidjan, Grand-Bassam" /></label>
        <label className={`${lbl} sm:col-span-2`}>Formules (une ligne : « Nom | prix XOF | inclus 1, inclus 2 »)<textarea name="packages" rows={3} defaultValue={loaded?.packages ?? ''} className={input} placeholder="Formule Confort | 65000 | Transport, Hébergement" /></label>
        <label className={lbl}>Téléphone contact<input name="contact_phone" defaultValue={v('contact_phone')} className={input} /></label>
        <label className={lbl}>WhatsApp contact<input name="contact_whatsapp" defaultValue={v('contact_whatsapp')} className={input} /></label>
        <TranslationFields fields={TRANSLATABLE} defaults={t.i18n}>
          {PREFIXED_LOCALES.map((l) => (
            <div key={l} className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
              <label className={lbl}>Programme — titres des jours (une ligne par jour, même ordre)<textarea name={`days_tr:${l}`} rows={3} defaultValue={loaded?.daysTr?.[l] ?? ''} className={input} /></label>
              <label className={lbl}>Formules — noms (une ligne par formule, même ordre)<textarea name={`packages_tr:${l}`} rows={3} defaultValue={loaded?.packagesTr?.[l] ?? ''} className={input} /></label>
            </div>
          ))}
        </TranslationFields>
      </div>
      {err && <p role="alert" className="text-sm text-red-400">{err}</p>}
      <div className="flex items-center gap-3">
        <button disabled={busy} className="rounded-lg bg-primary-500 px-5 py-2 text-sm font-bold text-night disabled:opacity-60">{busy ? 'Enregistrement…' : tripId ? 'Enregistrer' : 'Créer le brouillon'}</button>
        {onCancel && <button type="button" onClick={onCancel} className="text-sm text-neutral-400 underline">Annuler</button>}
        <p className="text-xs text-neutral-500">{tripId ? 'Un brouillon modifié doit être soumis de nouveau.' : 'Créé en brouillon : à soumettre ensuite pour validation.'}</p>
      </div>
    </form>
  );
}

function explain(msg?: string) {
  if (!msg) return 'Enregistrement impossible.';
  if (msg.includes('TRIP_LOCKED')) return 'Ce voyage est publié : il ne peut plus être modifié par son organisateur. Contactez l’administration.';
  if (msg.includes('row-level security')) return 'Droits insuffisants : votre compte doit avoir le statut organisateur.';
  return msg;
}
