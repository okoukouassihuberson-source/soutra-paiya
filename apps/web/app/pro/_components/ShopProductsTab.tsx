'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase';
import { formatXOF } from '@soutra/shared';

/* ─────────────────────────────────────────────────── *
 *  TYPES                                              *
 * ─────────────────────────────────────────────────── */

type ProductStatus = 'active' | 'out_of_stock' | 'archived';

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
  variants: any[];
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
  const [photoUrl, setPhotoUrl] = useState(product?.photos?.[0] || '');
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

    const payload = {
      venue_id: venueId,
      name: name.trim(),
      description: description.trim() || null,
      price_xof: Math.round(priceNum),
      stock_quantity: stockNum,
      sku: sku.trim() || null,
      category: category.trim() || null,
      photos: photoUrl.trim() ? [photoUrl.trim()] : [],
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
  }, [sb, venueId, product, name, description, price, stock, stockUnlimited, sku, category, photoUrl, onSaved]);

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

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          <Field label="Photo principale (URL)" className="sm:col-span-2">
            <input
              type="url" value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)}
              className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm focus:border-primary-500 focus:outline-none"
              placeholder="https://…"
            />
            <p className="mt-1 text-[11px] text-neutral-500">
              Pour l&apos;instant : copier-coller l&apos;URL d&apos;une image. Upload Supabase Storage à venir.
            </p>
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
