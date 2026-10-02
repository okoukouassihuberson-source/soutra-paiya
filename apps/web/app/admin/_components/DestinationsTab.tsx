'use client';

import { useCallback, useEffect, useState } from 'react';
import { slugify, type DestinationKind } from '@soutra/shared';
import { ImageField, GalleryField } from '@/components/tourism/ImageUpload';
import { supabaseBrowser } from '@/lib/supabase';
import { TranslationFields, collectI18n } from '@/components/tourism/TranslationFields';

const TRANSLATABLE = [
  { name: 'name', label: 'Nom' }, { name: 'tagline', label: 'Accroche' },
  { name: 'description', label: 'Description', multiline: true }, { name: 'history', label: 'Histoire', multiline: true },
];

interface Row {
  id: string; slug: string; name: string; kind: DestinationKind; country_code: string; tagline: string | null;
  cover_url: string | null; is_featured: boolean; is_published: boolean; venue_city: string | null;
}
const KINDS: { value: DestinationKind; label: string }[] = [
  { value: 'country', label: 'Pays' }, { value: 'region', label: 'Région' }, { value: 'city', label: 'Ville' },
  { value: 'commune', label: 'Commune' }, { value: 'site', label: 'Site touristique' },
];
const input = 'w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white placeholder:text-neutral-600';

export function DestinationsTab() {
  const sb = supabaseBrowser() as any;
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await sb.from('destinations').select('id, slug, name, kind, country_code, tagline, cover_url, is_featured, is_published, venue_city').order('name').limit(500);
    if (error) console.error('[admin-destinations]', error);
    setRows((data as Row[]) ?? []);
    setLoading(false);
  }, [sb]);
  useEffect(() => { load(); }, [load]);

  async function toggle(id: string, patch: Partial<Row>) {
    setErr(null);
    const { error } = await sb.from('destinations').update(patch).eq('id', id);
    if (error) setErr(error.message); else load();
  }

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const g = (k: string) => String(f.get(k) ?? '').trim();
    const num = (k: string) => (g(k) === '' ? null : Number(g(k)));
    setBusy(true); setErr(null);
    const name = g('name');
    const { error } = await sb.from('destinations').insert({
      slug: g('slug') || slugify(name), name, kind: g('kind'), country_code: (g('country_code') || 'CI').toUpperCase(),
      tagline: g('tagline') || null, description: g('description') || null, history: g('history') || null,
      cover_url: g('cover_url') || null, venue_city: g('venue_city') || null,
      gallery_urls: g('gallery').split('\n').map((x) => x.trim()).filter(Boolean),
      latitude: num('latitude'), longitude: num('longitude'), is_featured: f.get('is_featured') === 'on', is_published: true,
      i18n: collectI18n(f, TRANSLATABLE.map((x) => x.name)),
    });
    setBusy(false);
    if (error) { setErr(error.code === '23505' ? 'Ce slug existe déjà.' : error.message); return; }
    (e.target as HTMLFormElement).reset(); setShow(false); load();
  }

  const lbl = 'block text-xs font-semibold text-neutral-400';
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-400">{rows.length} destination(s)</p>
        <button onClick={() => setShow((v) => !v)} className="rounded-full bg-primary-500 px-4 py-1.5 text-xs font-bold text-white">{show ? 'Fermer' : '+ Nouvelle destination'}</button>
      </div>

      {show && (
        <form onSubmit={create} className="space-y-3 rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={lbl}>Nom *<input name="name" required maxLength={200} className={input} /></label>
            <label className={lbl}>Slug (auto si vide)<input name="slug" pattern="[a-z0-9]+(-[a-z0-9]+)*" className={input} /></label>
            <label className={lbl}>Type<select name="kind" defaultValue="city" className={input}>{KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</select></label>
            <label className={lbl}>Code pays (2 lettres)<input name="country_code" defaultValue="CI" maxLength={2} pattern="[A-Za-z]{2}" className={input} /></label>
            <label className={`${lbl} sm:col-span-2`}>Accroche<input name="tagline" maxLength={200} className={input} /></label>
            <label className={lbl}>Ville telle qu'écrite dans les établissements<input name="venue_city" placeholder="ex. Assinie" className={input} /></label>
            <ImageField name="cover_url" label="Photo principale" />
            <label className={lbl}>Latitude<input name="latitude" type="number" step="any" min={-90} max={90} className={input} /></label>
            <label className={lbl}>Longitude<input name="longitude" type="number" step="any" min={-180} max={180} className={input} /></label>
            <label className={`${lbl} sm:col-span-2`}>Description<textarea name="description" rows={3} className={input} /></label>
            <label className={`${lbl} sm:col-span-2`}>Histoire<textarea name="history" rows={3} className={input} /></label>
            <GalleryField name="gallery" label="Galerie (une URL par ligne)" className="sm:col-span-2" />
            <TranslationFields fields={TRANSLATABLE} />
            <label className="flex items-center gap-2 text-xs text-neutral-300"><input type="checkbox" name="is_featured" /> Mettre à la une (accueil)</label>
          </div>
          <button disabled={busy} className="rounded-lg bg-primary-500 px-5 py-2 text-sm font-bold text-white disabled:opacity-60">{busy ? 'Création…' : 'Créer'}</button>
        </form>
      )}
      {err && <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-400">{err}</p>}

      {loading ? <p className="p-8 text-center text-neutral-500">Chargement…</p> : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {rows.map((d) => (
            <li key={d.id} className="flex items-center gap-3 rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-3">
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-neutral-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {d.cover_url && <img src={d.cover_url} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-white">{d.name} <span className="text-[10px] font-normal uppercase text-neutral-500">{KINDS.find((k) => k.value === d.kind)?.label} · {d.country_code}</span></p>
                <p className="truncate text-xs text-neutral-500">{d.tagline ?? '—'}</p>
                <div className="mt-1 flex gap-3 text-[11px]">
                  <button onClick={() => toggle(d.id, { is_featured: !d.is_featured })} className={d.is_featured ? 'font-bold text-amber-400' : 'text-neutral-500'}>★ À la une</button>
                  <button onClick={() => toggle(d.id, { is_published: !d.is_published })} className={d.is_published ? 'font-bold text-emerald-400' : 'text-neutral-500'}>{d.is_published ? 'Publiée' : 'Masquée'}</button>
                  {d.is_published && <a href={`/destinations/${d.slug}`} target="_blank" rel="noreferrer" className="text-primary-400 underline">Voir</a>}
                </div>
              </div>
            </li>
          ))}
          {rows.length === 0 && <li className="rounded-2xl border border-neutral-800/50 p-8 text-center text-sm text-neutral-500 sm:col-span-2">Aucune destination.</li>}
        </ul>
      )}
    </div>
  );
}
