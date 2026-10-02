'use client';

import { useEffect, useState } from 'react';
import { slugify, ACTIVITY_CATEGORIES } from '@soutra/shared';
import { supabaseBrowser } from '@/lib/supabase';
import { TranslationFields, collectI18n } from './TranslationFields';

const TRANSLATABLE = [
  { name: 'title', label: 'Titre' }, { name: 'summary', label: 'Résumé' }, { name: 'description', label: 'Description', multiline: true },
  { name: 'conditions', label: 'Conditions', multiline: true }, { name: 'includes', label: 'Inclus', list: true }, { name: 'excludes', label: 'Non inclus', list: true },
];

const input = 'w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white placeholder:text-neutral-600';
const lbl = 'block text-xs font-semibold text-neutral-400';

/**
 * Création / modification d'une activité (thème sombre : espace organisateur et admin).
 * Sans `activityId` : crée un BROUILLON. Le contenu d'une activité publiée est
 * verrouillé côté base pour l'organisateur (garde SQL tg_activities_guard).
 */
export function ActivityEditor({ activityId, onSaved, onCancel }: { activityId?: string; onSaved: () => void; onCancel?: () => void }) {
  const sb = supabaseBrowser() as any;
  const [a, setA] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(!!activityId);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!activityId) return;
    (async () => {
      const { data } = await sb.from('activities').select('*').eq('id', activityId).maybeSingle();
      if (!data) setErr('Activité introuvable.');
      setA(data);
      setLoading(false);
    })();
  }, [sb, activityId]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const g = (k: string) => String(f.get(k) ?? '').trim();
    const list = (k: string) => g(k).split(/\n|,/).map((x) => x.trim()).filter(Boolean);
    const num = (k: string) => (g(k) === '' ? null : Number(g(k)));
    setBusy(true); setErr(null);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { setErr('Session expirée.'); setBusy(false); return; }

    const fields = {
      title: g('title'), summary: g('summary') || null, description: g('description') || null, category: g('category'),
      city: g('city') || null, address: g('address') || null, latitude: num('latitude'), longitude: num('longitude'),
      cover_url: g('cover_url') || null, gallery_urls: g('gallery').split('\n').map((x) => x.trim()).filter(Boolean),
      price_xof: Number(g('price_xof')), duration_minutes: Number(g('duration_minutes')), min_age: Number(g('min_age') || 0),
      min_participants: Number(g('min_participants') || 1), max_group_size: Number(g('max_group_size') || 20),
      languages: list('languages'), includes: list('includes'), excludes: list('excludes'), conditions: g('conditions') || null,
      contact_phone: g('contact_phone') || null, contact_whatsapp: g('contact_whatsapp') || null,
      i18n: collectI18n(f, TRANSLATABLE.map((x) => x.name), a?.i18n),
    };
    const { error } = activityId
      ? await sb.from('activities').update(fields).eq('id', activityId)
      : await sb.from('activities').insert({ ...fields, organizer_id: user.id, status: 'draft', slug: `${slugify(g('title')).slice(0, 60)}-${Math.random().toString(36).slice(2, 6)}` });
    setBusy(false);
    if (error) {
      setErr(error.message?.includes('ACTIVITY_LOCKED') ? 'Activité publiée : modification réservée à l’administration.'
        : error.message?.includes('row-level security') ? 'Droits insuffisants : votre compte doit avoir le statut organisateur ou guide.' : error.message);
      return;
    }
    onSaved();
  }

  if (loading) return <p className="p-6 text-center text-neutral-500">Chargement…</p>;
  const v = (k: string) => (a?.[k] ?? '') as string | number;
  const arr = (k: string) => ((a?.[k] ?? []) as string[]).join('\n');

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5 text-white">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={`${lbl} sm:col-span-2`}>Titre *<input name="title" required maxLength={200} defaultValue={v('title')} className={input} /></label>
        <label className={`${lbl} sm:col-span-2`}>Résumé<input name="summary" maxLength={500} defaultValue={v('summary')} className={input} /></label>
        <label className={lbl}>Catégorie *<select name="category" required defaultValue={(a?.category as string) ?? 'excursion'} className={input}>{ACTIVITY_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>)}</select></label>
        <label className={lbl}>Ville<input name="city" defaultValue={v('city')} className={input} /></label>
        <label className={`${lbl} sm:col-span-2`}>Adresse / point de rendez-vous<input name="address" defaultValue={v('address')} className={input} /></label>
        <label className={lbl}>Latitude<input name="latitude" type="number" step="any" min={-90} max={90} defaultValue={v('latitude')} className={input} /></label>
        <label className={lbl}>Longitude<input name="longitude" type="number" step="any" min={-180} max={180} defaultValue={v('longitude')} className={input} /></label>
        <label className={lbl}>Prix par personne (XOF) *<input name="price_xof" type="number" min={0} required defaultValue={v('price_xof')} className={input} /></label>
        <label className={lbl}>Durée (minutes) *<input name="duration_minutes" type="number" min={15} max={20160} required defaultValue={v('duration_minutes')} className={input} /></label>
        <label className={lbl}>Âge minimum<input name="min_age" type="number" min={0} max={99} defaultValue={a?.min_age ?? 0} className={input} /></label>
        <label className={lbl}>Participants minimum (départ garanti)<input name="min_participants" type="number" min={1} defaultValue={a?.min_participants ?? 1} className={input} /></label>
        <label className={lbl}>Taille max. d'une réservation<input name="max_group_size" type="number" min={1} max={50} defaultValue={a?.max_group_size ?? 20} className={input} /></label>
        <label className={lbl}>Langues (virgule)<input name="languages" defaultValue={((a?.languages ?? []) as string[]).join(', ')} className={input} /></label>
        <label className={`${lbl} sm:col-span-2`}>Image de couverture (URL) — requise pour soumettre<input name="cover_url" type="url" defaultValue={v('cover_url')} className={input} /></label>
        <label className={`${lbl} sm:col-span-2`}>Galerie (une URL par ligne)<textarea name="gallery" rows={2} defaultValue={arr('gallery_urls')} className={input} /></label>
        <label className={`${lbl} sm:col-span-2`}>Description<textarea name="description" rows={3} defaultValue={v('description')} className={input} /></label>
        <label className={lbl}>Inclus<textarea name="includes" rows={2} defaultValue={arr('includes')} className={input} /></label>
        <label className={lbl}>Non inclus<textarea name="excludes" rows={2} defaultValue={arr('excludes')} className={input} /></label>
        <label className={`${lbl} sm:col-span-2`}>Conditions<textarea name="conditions" rows={2} defaultValue={v('conditions')} className={input} /></label>
        <label className={lbl}>Téléphone contact<input name="contact_phone" defaultValue={v('contact_phone')} className={input} /></label>
        <label className={lbl}>WhatsApp contact<input name="contact_whatsapp" defaultValue={v('contact_whatsapp')} className={input} /></label>
        <TranslationFields fields={TRANSLATABLE} defaults={a?.i18n} />
      </div>
      {err && <p role="alert" className="text-sm text-red-400">{err}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={busy} className="rounded-lg bg-primary-500 px-5 py-2 text-sm font-bold text-white disabled:opacity-60">{busy ? 'Enregistrement…' : activityId ? 'Enregistrer' : 'Créer le brouillon'}</button>
        {onCancel && <button type="button" onClick={onCancel} className="text-sm text-neutral-400 underline">Annuler</button>}
        <p className="text-xs text-neutral-500">Ajoutez ensuite des créneaux, puis soumettez l’activité pour validation.</p>
      </div>
    </form>
  );
}
