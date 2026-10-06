'use client';

import { useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase';

const MAX_SIDE = 1600;
const input = 'w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-dark placeholder:text-neutral-600';

/** Redimensionne (côté max 1600 px) et recompresse en JPEG pour économiser la bande passante mobile. */
async function shrink(file: File): Promise<Blob> {
  if (file.type === 'image/png' && file.size < 400_000) return file;           // petit PNG (logo, pictogramme) : conservé
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) throw new Error('IMAGE_UNREADABLE');
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return await new Promise<Blob>((ok, ko) => c.toBlob((b) => (b ? ok(b) : ko(new Error('IMAGE_UNREADABLE'))), 'image/jpeg', 0.85));
}

async function upload(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('IMAGE_TYPE');
  if (file.size > 15 * 1024 * 1024) throw new Error('IMAGE_TOO_BIG');
  const sb = supabaseBrowser() as any;
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error('NOT_AUTHENTICATED');
  const blob = await shrink(file);
  if (blob.size > 5 * 1024 * 1024) throw new Error('IMAGE_TOO_BIG');
  const ext = blob.type === 'image/png' ? 'png' : 'jpg';
  const path = `${user.id}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await sb.storage.from('tourism-media').upload(path, blob, { contentType: blob.type, cacheControl: '31536000' });
  if (error) throw error;
  return sb.storage.from('tourism-media').getPublicUrl(path).data.publicUrl as string;
}

const MSG: Record<string, string> = {
  IMAGE_TYPE: 'Format non pris en charge (JPEG, PNG ou WebP).', IMAGE_TOO_BIG: 'Image trop lourde (5 Mo maximum).',
  IMAGE_UNREADABLE: 'Image illisible.', NOT_AUTHENTICATED: 'Session expirée.',
};
const explain = (e: any) => MSG[e?.message] ?? (String(e?.message ?? '').includes('row-level security') ? 'Droits insuffisants pour téléverser.' : 'Téléversement impossible, réessayez.');

function Picker({ label, multiple, onUrls }: { label: string; multiple?: boolean; onUrls: (urls: string[]) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="mt-1">
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" multiple={multiple} className="sr-only" tabIndex={-1}
             onChange={async (e) => {
               const files = [...(e.target.files ?? [])].slice(0, 10);
               if (files.length === 0) return;
               setBusy(true); setErr(null);
               const urls: string[] = [];
               for (const f of files) { try { urls.push(await upload(f)); } catch (x) { setErr(explain(x)); } }
               setBusy(false); if (ref.current) ref.current.value = '';
               if (urls.length) onUrls(urls);
             }} />
      <button type="button" disabled={busy} onClick={() => ref.current?.click()}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-900 hover:bg-neutral-100 disabled:opacity-60">
        {busy ? 'Téléversement…' : `📷 ${label}`}
      </button>
      {err && <span role="alert" className="ml-2 text-xs text-red-700">{err}</span>}
    </div>
  );
}

/** Champ image unique : URL libre ou téléversement ; garde `name` pour les formulaires FormData. */
export function ImageField({ name, label, defaultValue, className = '' }: { name: string; label: string; defaultValue?: string | null; className?: string }) {
  const [url, setUrl] = useState(defaultValue ?? '');
  return (
    <div className={`block text-xs font-semibold text-neutral-700 ${className}`}>
      <label>{label}<input name={name} type="url" value={url} onChange={(e) => setUrl(e.target.value)} className={`${input} mt-1`} /></label>
      <div className="flex items-center gap-3">
        <Picker label="Téléverser une image" onUrls={(u) => setUrl(u[0])} />
        {url && /* eslint-disable-next-line @next/next/no-img-element */ <img src={url} alt="" className="mt-1 h-10 w-14 rounded object-cover" />}
      </div>
    </div>
  );
}

/** Galerie : une URL par ligne ; le téléversement ajoute des lignes. */
export function GalleryField({ name, label, defaultValue, className = '' }: { name: string; label: string; defaultValue?: string[] | null; className?: string }) {
  const [text, setText] = useState((defaultValue ?? []).join('\n'));
  return (
    <div className={`block text-xs font-semibold text-neutral-700 ${className}`}>
      <label>{label}<textarea name={name} rows={3} value={text} onChange={(e) => setText(e.target.value)} className={`${input} mt-1`} /></label>
      <Picker label="Ajouter des images" multiple onUrls={(u) => setText((t) => [...t.split('\n').map((x) => x.trim()).filter(Boolean), ...u].join('\n'))} />
    </div>
  );
}
