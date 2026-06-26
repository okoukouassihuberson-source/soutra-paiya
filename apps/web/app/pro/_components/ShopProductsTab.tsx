'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase';
import { formatXOF } from '@soutra/shared';

/* ─────────────────────────────────────────────────── *
 *  TYPES                                              *
 * ─────────────────────────────────────────────────── */

type ProductStatus = 'active' | 'out_of_stock' | 'archived';

interface ProductVariant {
  name: string;          // ex: "Taille"
  values: string[];      // ex: ["S", "M", "L"]
}

interface Product {
  id: string;
  venue_id: string;
  name: string;
  description: string | null;
  price_xof: number;
  stock_quantity: number | null;
  sku: string | null;
  category: string | null;
  photos: string[];
  variants: ProductVariant[];
  status: ProductStatus;
  position: number | null;
  created_at: string;
  updated_at: string;
}

const STATUS_META: Record<ProductStatus, { label: string; bg: string }> = {
  active:       { label: 'Actif',     bg: 'bg-emerald-50 text-emerald-700' },
  out_of_stock: { label: 'Épuisé',    bg: 'bg-amber-50 text-amber-700' },
  archived:     { label: 'Archivé',   bg: 'bg-neutral-100 text-neutral-600' },
};

/**
 * Onglet Pro "Catalogue" — CRUD produits pour les venues catégorie boutique.
 *
 * Rendu uniquement si le venue actif est de catégorie compatible (boutique,
 * mall, supermarche, etc.) — gate côté pro/page.tsx.
 */
export function ShopProductsTab({ venueId }: { venueId: string }) {
  const sb = supabaseBrowser();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const flash = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok });
    window.setTimeout(() => setToast(null), 3000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (sb as any)
      .from('products')
      .select('*')
      .eq('venue_id', venueId)
      .order('status', { ascending: true })
      .order('position', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[shop-products] load:', error);
      setProducts([]);
    } else {
      setProducts((data as Product[]) ?? []);
    }
    setLoading(false);
  }, [sb, venueId]);

  useEffect(() => { load(); }, [load]);

  const handleStatusToggle = useCallback(async (p: Product) => {
    const next: ProductStatus =
      p.status === 'active' ? 'out_of_stock'
      : p.status === 'out_of_stock' ? 'archived'
      : 'active';
    const { error } = await (sb as any)
      .from('products')
      .update({ status: next })
      .eq('id', p.id);
    if (error) flash(error.message, false);
    else { flash(`Produit → ${STATUS_META[next].label}`); load(); }
  }, [sb, flash, load]);

  const handleDelete = useCallback(async (p: Product) => {
    if (!confirm(`Supprimer définitivement "${p.name}" ?`)) return;
    const { error } = await (sb as any).from('products').delete().eq('id', p.id);
    if (error) flash(error.message, false);
    else { flash('Produit supprimé'); load(); }
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
          <h2 className="font-display text-2xl font-bold text-neutral-900">Catalogue produits</h2>
          <p className="text-sm text-neutral-500">
            {products.length} produit{products.length > 1 ? 's' : ''} ·{' '}
            {products.filter((p) => p.status === 'active').length} actif{products.filter((p) => p.status === 'active').length > 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="rounded-full bg-primary-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary-500/30 transition hover:bg-primary-600 active:scale-[0.98]"
        >
          + Ajouter un produit
        </button>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        {loading ? (
          <div className="p-12 text-center text-neutral-500">Chargement…</div>
        ) : products.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm text-neutral-500">Aucun produit pour l&apos;instant.</p>
            <button
              onClick={() => setCreating(true)}
              className="mt-4 rounded-full bg-primary-500 px-5 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-primary-600"
            >
              Créer mon premier produit
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                  <th className="px-4 py-3">Produit</th>
                  <th className="px-4 py-3">Catégorie</th>
                  <th className="px-4 py-3 text-right">Prix</th>
                  <th className="px-4 py-3 text-right">Stock</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className="border-b border-neutral-100 transition hover:bg-neutral-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {p.photos[0] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.photos[0]} alt={p.name} className="h-10 w-10 rounded-lg object-cover" />
                        ) : (
                          <div className="h-10 w-10 rounded-lg bg-neutral-100" />
                        )}
                        <div>
                          <p className="font-semibold text-neutral-900">{p.name}</p>
                          {p.sku && <p className="text-[10px] font-mono text-neutral-400">SKU: {p.sku}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-neutral-600">{p.category || '—'}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">{formatXOF(p.price_xof)}</td>
                    <td className="px-4 py-3 text-right">
                      {p.stock_quantity == null ? (
                        <span className="text-xs text-neutral-500">illimité</span>
                      ) : (
                        <span className={`font-mono ${p.stock_quantity === 0 ? 'text-red-500' : p.stock_quantity < 5 ? 'text-amber-500' : 'text-neutral-700'}`}>
                          {p.stock_quantity}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleStatusToggle(p)}
                        className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${STATUS_META[p.status].bg} hover:opacity-80`}
                        title="Cliquer pour changer le statut"
                      >
                        {STATUS_META[p.status].label}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setEditing(p)}
                          className="rounded-lg px-2.5 py-1 text-xs font-semibold text-primary-600 transition hover:bg-primary-50"
                        >
                          Modifier
                        </button>
                        <button
                          onClick={() => handleDelete(p)}
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

      {/* Modal create/edit */}
      {(creating || editing) && (
        <ProductFormModal
          venueId={venueId}
          product={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); flash('Produit enregistré'); load(); }}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────── *
 *  MODAL FORMULAIRE                                   *
 * ─────────────────────────────────────────────────── */

function ProductFormModal({
  venueId,
  product,
  onClose,
  onSaved,
}: {
  venueId: string;
  product: Product | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const sb = supabaseBrowser();
  const [name, setName] = useState(product?.name || '');
  const [description, setDescription] = useState(product?.description || '');
  const [price, setPrice] = useState<string>(String(product?.price_xof ?? ''));
  const [stock, setStock] = useState<string>(
    product?.stock_quantity == null ? '' : String(product.stock_quantity),
  );
  const [stockUnlimited, setStockUnlimited] = useState<boolean>(product?.stock_quantity == null);
  const [sku, setSku] = useState(product?.sku || '');
  const [category, setCategory] = useState(product?.category || '');
  // Liste de photos (URLs publiques Supabase Storage)
  const [photos, setPhotos] = useState<string[]>(product?.photos ?? []);
  const [variants, setVariants] = useState<ProductVariant[]>(product?.variants ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const priceNum = Number(price);
    if (!name.trim() || !Number.isFinite(priceNum) || priceNum < 0) {
      setError('Nom et prix sont requis');
      return;
    }
    const stockNum = stockUnlimited ? null : Number(stock);
    if (!stockUnlimited && (!Number.isFinite(stockNum) || (stockNum as number) < 0)) {
      setError('Stock invalide');
      return;
    }

    // Nettoie les variants vides (name vide ou pas de values)
    const cleanedVariants = variants
      .map((v) => ({ name: v.name.trim(), values: v.values.map((x) => x.trim()).filter(Boolean) }))
      .filter((v) => v.name && v.values.length > 0);

    const payload = {
      venue_id: venueId,
      name: name.trim(),
      description: description.trim() || null,
      price_xof: Math.round(priceNum),
      stock_quantity: stockNum,
      sku: sku.trim() || null,
      category: category.trim() || null,
      photos,
      variants: cleanedVariants,
    };

    setSaving(true);
    const { error } = product
      ? await (sb as any).from('products').update(payload).eq('id', product.id)
      : await (sb as any).from('products').insert(payload);
    setSaving(false);

    if (error) {
      setError(error.message || 'Erreur');
      return;
    }
    onSaved();
  }, [sb, venueId, product, name, description, price, stock, stockUnlimited, sku, category, photos, variants, onSaved]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[200] flex items-end justify-center overflow-hidden bg-neutral-900/70 backdrop-blur-md sm:items-center sm:p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-slide-up flex max-h-[100dvh] w-full max-w-xl flex-col rounded-t-3xl border border-neutral-200 bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-3xl"
      >
        {/* Header — non scrollable */}
        <div className="flex-shrink-0 px-6 pt-6 sm:px-8 sm:pt-8">
          <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-neutral-300 sm:hidden" />

          <div className="flex items-start justify-between gap-3">
            <h3 className="font-display text-xl font-bold text-neutral-900">
              {product ? 'Modifier le produit' : 'Nouveau produit'}
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
        </div>

        {/* Body scrollable */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5 sm:px-8">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Nom du produit *" className="sm:col-span-2">
              <input
                type="text" value={name} onChange={(e) => setName(e.target.value)}
                maxLength={200} required
                className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm focus:border-primary-500 focus:outline-none"
                placeholder="T-shirt Soutra"
              />
            </Field>
            <Field label="Description" className="sm:col-span-2">
              <textarea
                value={description} onChange={(e) => setDescription(e.target.value)}
                rows={3} maxLength={2000}
                className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm focus:border-primary-500 focus:outline-none"
                placeholder="Description visible aux clients"
              />
            </Field>
            <Field label="Prix unitaire (FCFA) *">
              <input
                type="number" inputMode="numeric" min={0} step={100} required
                value={price} onChange={(e) => setPrice(e.target.value)}
                className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-2.5 font-mono text-sm focus:border-primary-500 focus:outline-none"
                placeholder="5000"
              />
            </Field>
            <Field label="Catégorie">
              <input
                type="text" value={category} onChange={(e) => setCategory(e.target.value)}
                maxLength={60}
                className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm focus:border-primary-500 focus:outline-none"
                placeholder="Vêtements"
              />
            </Field>
            <Field label="Stock">
              <div className="flex items-center gap-2">
                <input
                  type="number" inputMode="numeric" min={0}
                  value={stock} onChange={(e) => setStock(e.target.value)}
                  disabled={stockUnlimited}
                  className="flex-1 rounded-xl border border-neutral-300 bg-white px-4 py-2.5 font-mono text-sm disabled:bg-neutral-100 disabled:text-neutral-400 focus:border-primary-500 focus:outline-none"
                  placeholder="42"
                />
                <label className="flex items-center gap-1.5 text-xs text-neutral-600">
                  <input
                    type="checkbox" checked={stockUnlimited}
                    onChange={(e) => setStockUnlimited(e.target.checked)}
                  />
                  Illimité
                </label>
              </div>
            </Field>
            <Field label="SKU (optionnel)">
              <input
                type="text" value={sku} onChange={(e) => setSku(e.target.value)}
                maxLength={60}
                className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-2.5 font-mono text-sm focus:border-primary-500 focus:outline-none"
                placeholder="TS-RED-M"
              />
            </Field>
            <Field label="Photos" className="sm:col-span-2">
              <PhotosUploader
                venueId={venueId}
                productId={product?.id ?? null}
                photos={photos}
                onChange={setPhotos}
              />
            </Field>

            <Field label="Variantes (taille, couleur, etc.)" className="sm:col-span-2">
              <VariantsEditor variants={variants} onChange={setVariants} />
            </Field>
          </div>
        </div>

        {/* Footer — non scrollable, sticky bottom */}
        <div
          className="flex flex-shrink-0 flex-col-reverse gap-2 border-t border-neutral-100 bg-white px-6 py-4 sm:flex-row sm:justify-end sm:rounded-b-3xl sm:px-8 sm:py-5"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
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
            {saving ? 'Enregistrement…' : product ? 'Enregistrer' : 'Créer le produit'}
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

/* ─────────────────────────────────────────────────── *
 *  PHOTOS UPLOADER (Supabase Storage)                 *
 * ─────────────────────────────────────────────────── */

const MAX_PHOTOS = 5;
const MAX_PHOTO_SIZE_MB = 5;

function PhotosUploader({
  venueId, productId, photos, onChange,
}: {
  venueId: string;
  productId: string | null;
  photos: string[];
  onChange: (next: string[]) => void;
}) {
  const sb = supabaseBrowser();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);

    const remainingSlots = MAX_PHOTOS - photos.length;
    if (remainingSlots <= 0) {
      setError(`Maximum ${MAX_PHOTOS} photos`);
      return;
    }
    const toUpload = Array.from(files).slice(0, remainingSlots);

    // Vérif taille
    for (const file of toUpload) {
      if (file.size > MAX_PHOTO_SIZE_MB * 1024 * 1024) {
        setError(`${file.name} trop volumineux (>${MAX_PHOTO_SIZE_MB} Mo)`);
        return;
      }
      if (!file.type.startsWith('image/')) {
        setError(`${file.name} n'est pas une image`);
        return;
      }
    }

    setUploading(true);
    const uploadedUrls: string[] = [];

    for (const file of toUpload) {
      // Chemin : venue-media/<venue_id>/products/<product_id_or_drafts>/<uuid>.<ext>
      // Si productId null (création), on stocke dans _drafts/<uuid> — le merchant
      // doit créer une fois sans photos puis éditer pour uploader idéalement,
      // mais on tolère le draft (cleanup manuel possible côté admin).
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const uid = crypto.randomUUID();
      const path = `${venueId}/products/${productId ?? '_drafts'}/${uid}.${ext}`;

      const { error: upErr } = await sb.storage
        .from('venue-media')
        .upload(path, file, {
          cacheControl: '31536000',
          upsert: false,
          contentType: file.type,
        });
      if (upErr) {
        console.error('[upload] err:', upErr);
        setError(upErr.message || `Upload de ${file.name} échoué`);
        break;
      }
      const { data: pub } = sb.storage.from('venue-media').getPublicUrl(path);
      uploadedUrls.push(pub.publicUrl);
    }

    setUploading(false);
    if (uploadedUrls.length > 0) {
      onChange([...photos, ...uploadedUrls]);
    }
  }, [sb, venueId, productId, photos, onChange]);

  const handleRemove = useCallback((idx: number) => {
    onChange(photos.filter((_, i) => i !== idx));
  }, [photos, onChange]);

  const handleMoveToFirst = useCallback((idx: number) => {
    if (idx === 0) return;
    const next = [...photos];
    const [moved] = next.splice(idx, 1);
    next.unshift(moved);
    onChange(next);
  }, [photos, onChange]);

  return (
    <div>
      {error && (
        <p className="mb-2 text-xs font-semibold text-red-600">⚠ {error}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {photos.map((url, i) => (
          <div key={url + i} className="group relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`Photo ${i + 1}`}
              className={`h-24 w-24 rounded-xl object-cover ring-2 ${
                i === 0 ? 'ring-primary-500' : 'ring-neutral-200'
              }`}
            />
            {i === 0 && (
              <span className="absolute left-1 top-1 rounded-full bg-primary-500 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white shadow">
                Principale
              </span>
            )}
            <div className="absolute inset-0 flex items-center justify-center gap-1 rounded-xl bg-black/60 opacity-0 transition group-hover:opacity-100">
              {i !== 0 && (
                <button
                  type="button"
                  onClick={() => handleMoveToFirst(i)}
                  title="Mettre en principale"
                  className="rounded-full bg-white/90 p-1.5 text-neutral-900 transition hover:bg-white"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                </button>
              )}
              <button
                type="button"
                onClick={() => handleRemove(i)}
                title="Supprimer"
                className="rounded-full bg-red-500 p-1.5 text-white transition hover:bg-red-600"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>
        ))}

        {photos.length < MAX_PHOTOS && (
          <label className={`flex h-24 w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed transition ${
            uploading
              ? 'border-primary-400 bg-primary-50'
              : 'border-neutral-300 bg-neutral-50 hover:border-primary-400 hover:bg-primary-50'
          }`}>
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={uploading}
              onChange={(e) => { handleUpload(e.target.files); e.target.value = ''; }}
              className="sr-only"
            />
            {uploading ? (
              <>
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-300 border-t-primary-500" />
                <span className="text-[10px] text-primary-600">Upload…</span>
              </>
            ) : (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-500">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <span className="text-[10px] font-semibold text-neutral-600">+ Photo</span>
              </>
            )}
          </label>
        )}
      </div>
      <p className="mt-2 text-[11px] text-neutral-500">
        {photos.length}/{MAX_PHOTOS} photos · max {MAX_PHOTO_SIZE_MB} Mo/image · la 1<sup>re</sup> est la photo principale (cliquer ⭐ pour la changer)
      </p>
      {!productId && photos.length > 0 && (
        <p className="mt-1 text-[11px] text-amber-600">
          ⚠ Photos uploadées avant création — elles seront rattachées au produit à l&apos;enregistrement.
        </p>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────── *
 *  VARIANTS EDITOR                                    *
 * ─────────────────────────────────────────────────── */

function VariantsEditor({
  variants, onChange,
}: {
  variants: ProductVariant[];
  onChange: (next: ProductVariant[]) => void;
}) {
  const addVariant = () => {
    if (variants.length >= 3) return;
    onChange([...variants, { name: '', values: [] }]);
  };
  const updateVariant = (idx: number, patch: Partial<ProductVariant>) => {
    onChange(variants.map((v, i) => (i === idx ? { ...v, ...patch } : v)));
  };
  const removeVariant = (idx: number) => {
    onChange(variants.filter((_, i) => i !== idx));
  };

  return (
    <div>
      {variants.length === 0 ? (
        <button
          type="button"
          onClick={addVariant}
          className="w-full rounded-xl border-2 border-dashed border-neutral-300 bg-neutral-50 px-4 py-3 text-sm font-semibold text-neutral-600 transition hover:border-primary-400 hover:bg-primary-50 hover:text-primary-700"
        >
          + Ajouter une variante (Taille, Couleur, …)
        </button>
      ) : (
        <div className="space-y-2">
          {variants.map((v, i) => (
            <div key={i} className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-3">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={v.name}
                  onChange={(e) => updateVariant(i, { name: e.target.value })}
                  placeholder="Nom (ex: Taille)"
                  className="w-32 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none"
                  maxLength={30}
                />
                <input
                  type="text"
                  value={v.values.join(', ')}
                  onChange={(e) => updateVariant(i, {
                    values: e.target.value.split(',').map((x) => x.trim()).filter(Boolean),
                  })}
                  placeholder="Valeurs séparées par virgule (S, M, L)"
                  className="flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => removeVariant(i)}
                  className="rounded-lg p-1.5 text-red-600 transition hover:bg-red-50"
                  title="Supprimer cette variante"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
                  </svg>
                </button>
              </div>
              {v.values.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {v.values.map((val) => (
                    <span key={val} className="rounded-full bg-primary-100 px-2 py-0.5 text-[11px] font-semibold text-primary-700">
                      {val}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
          {variants.length < 3 && (
            <button
              type="button"
              onClick={addVariant}
              className="w-full rounded-lg border border-dashed border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-600 transition hover:border-primary-400 hover:text-primary-700"
            >
              + Ajouter une autre variante
            </button>
          )}
        </div>
      )}
      <p className="mt-2 text-[11px] text-neutral-500">
        Max 3 variantes par produit. Le client pourra choisir une valeur de chaque sur la fiche produit.
      </p>
    </div>
  );
}
