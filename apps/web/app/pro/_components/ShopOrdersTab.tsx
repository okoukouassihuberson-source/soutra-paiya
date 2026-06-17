'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase';
import { formatXOF } from '@soutra/shared';

/* ─────────────────────────────────────────────────── *
 *  TYPES                                              *
 * ─────────────────────────────────────────────────── */

type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled' | 'refunded';
type DeliveryMethod = 'pickup' | 'delivery';
type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

interface OrderItem {
  product_id: string;
  name: string;
  unit_price_xof: number;
  qty: number;
  variant: Record<string, string> | null;
  subtotal_xof: number;
}

interface Order {
  id: string;
  order_number: string;
  user_id: string;
  venue_id: string;
  items: OrderItem[];
  items_count: number;
  subtotal_xof: number;
  delivery_fee_xof: number;
  total_xof: number;
  status: OrderStatus;
  delivery_method: DeliveryMethod;
  delivery_address: string | null;
  delivery_notes: string | null;
  contact_phone: string | null;
  contact_name: string | null;
  payment_status: PaymentStatus;
  created_at: string;
  confirmed_at: string | null;
  ready_at: string | null;
  delivered_at: string | null;
}

const STATUS_META: Record<OrderStatus, { label: string; tone: string }> = {
  pending:   { label: 'En attente paiement', tone: 'bg-amber-50 text-amber-700 border-amber-200' },
  confirmed: { label: 'Payée',               tone: 'bg-blue-50 text-blue-700 border-blue-200' },
  preparing: { label: 'En préparation',      tone: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  ready:     { label: 'Prête',               tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  delivered: { label: 'Livrée',              tone: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  cancelled: { label: 'Annulée',             tone: 'bg-neutral-100 text-neutral-600 border-neutral-300' },
  refunded:  { label: 'Remboursée',          tone: 'bg-purple-50 text-purple-700 border-purple-200' },
};

const NEXT_STATUS: Partial<Record<OrderStatus, { next: OrderStatus; label: string }>> = {
  confirmed: { next: 'preparing', label: 'Démarrer préparation' },
  preparing: { next: 'ready',     label: 'Marquer comme prête' },
  ready:     { next: 'delivered', label: 'Marquer comme livrée' },
};

/**
 * Onglet Pro "Commandes reçues" — workflow merchant.
 * Affiche les orders du venue avec changement de statut.
 */
export function ShopOrdersTab({ venueId }: { venueId: string }) {
  const sb = supabaseBrowser();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | OrderStatus>('all');
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
      .from('orders')
      .select('*')
      .eq('venue_id', venueId)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) {
      console.error('[shop-orders] load:', error);
      setOrders([]);
    } else {
      setOrders((data as Order[]) ?? []);
    }
    setLoading(false);
  }, [sb, venueId]);

  useEffect(() => { load(); }, [load]);

  const handleStatusChange = useCallback(async (orderId: string, status: OrderStatus, reason?: string) => {
    setActionLoading(orderId);
    const { error } = await (sb.rpc as any)('update_order_status', {
      p_order_id: orderId,
      p_status: status,
      p_reason: reason || null,
    });
    setActionLoading(null);
    if (error) flash(error.message, false);
    else { flash(`Statut → ${STATUS_META[status].label}`); load(); }
  }, [sb, flash, load]);

  const handleCancel = useCallback(async (orderId: string) => {
    const reason = window.prompt('Raison de l\'annulation (optionnel) :');
    if (reason === null) return; // user cancelled prompt
    handleStatusChange(orderId, 'cancelled', reason);
  }, [handleStatusChange]);

  const filtered = useMemo(() => {
    if (filter === 'all') return orders;
    return orders.filter((o) => o.status === filter);
  }, [orders, filter]);

  const counts = useMemo(() => {
    const c: Record<OrderStatus | 'all', number> = {
      all: orders.length,
      pending: 0, confirmed: 0, preparing: 0, ready: 0, delivered: 0, cancelled: 0, refunded: 0,
    };
    orders.forEach((o) => { c[o.status]++; });
    return c;
  }, [orders]);

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
        <h2 className="font-display text-2xl font-bold text-neutral-900">Commandes reçues</h2>
        <p className="text-sm text-neutral-500">
          {orders.length} commande{orders.length > 1 ? 's' : ''} ·{' '}
          {counts.confirmed + counts.preparing + counts.ready} à traiter
        </p>
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2">
        {(['all', 'pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'] as const).map((s) => (
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

      {/* List */}
      {loading ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-12 text-center text-neutral-500">
          Chargement…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-12 text-center">
          <p className="text-sm text-neutral-500">Aucune commande dans ce filtre.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((o) => {
            const isOpen = expandedId === o.id;
            const next = NEXT_STATUS[o.status];
            const canCancel = ['pending', 'confirmed', 'preparing'].includes(o.status);
            return (
              <li key={o.id} className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                {/* Header (always visible) */}
                <button
                  onClick={() => setExpandedId(isOpen ? null : o.id)}
                  className="flex w-full items-start gap-3 p-4 text-left transition hover:bg-neutral-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-neutral-700">{o.order_number}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS_META[o.status].tone}`}>
                        {STATUS_META[o.status].label}
                      </span>
                      {o.delivery_method === 'delivery' && (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">🚚 Livraison</span>
                      )}
                      {o.delivery_method === 'pickup' && (
                        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-600">🏪 Retrait</span>
                      )}
                    </div>
                    <p className="mt-1.5 text-sm font-semibold text-neutral-900">
                      {o.contact_name || 'Client'}
                      {o.contact_phone && <span className="ml-1 font-mono text-xs text-neutral-500">· {o.contact_phone}</span>}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {o.items_count} article{o.items_count > 1 ? 's' : ''} · {formatRelativeTime(o.created_at)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-bold text-neutral-900">{formatXOF(o.total_xof)}</p>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`mt-1 ml-auto text-neutral-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}>
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                </button>

                {/* Expanded */}
                {isOpen && (
                  <div className="border-t border-neutral-100 bg-neutral-50/50 p-4">
                    {/* Items */}
                    <p className="mb-2 text-xs font-bold uppercase tracking-wider text-neutral-500">Articles</p>
                    <ul className="mb-4 space-y-1.5">
                      {o.items.map((it, i) => (
                        <li key={i} className="flex items-start gap-3 text-sm">
                          <span className="rounded-md bg-white px-2 py-0.5 font-mono text-xs font-bold text-neutral-700">×{it.qty}</span>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium">{it.name}</p>
                            {it.variant && (
                              <p className="text-xs text-neutral-500">
                                {Object.entries(it.variant).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                              </p>
                            )}
                          </div>
                          <span className="font-mono text-sm text-neutral-700">{formatXOF(it.subtotal_xof)}</span>
                        </li>
                      ))}
                    </ul>

                    {/* Totals */}
                    <div className="mb-4 space-y-1 border-t border-neutral-200 pt-3 text-sm">
                      <Row label="Sous-total" value={formatXOF(o.subtotal_xof)} />
                      {o.delivery_fee_xof > 0 && (
                        <Row label="Livraison" value={formatXOF(o.delivery_fee_xof)} />
                      )}
                      <Row label="Total" value={formatXOF(o.total_xof)} bold />
                      <Row
                        label="Paiement"
                        value={
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            o.payment_status === 'paid' ? 'bg-emerald-50 text-emerald-700'
                            : o.payment_status === 'pending' ? 'bg-amber-50 text-amber-700'
                            : 'bg-red-50 text-red-700'
                          }`}>
                            {o.payment_status === 'paid' ? 'Payé'
                             : o.payment_status === 'pending' ? 'En attente'
                             : o.payment_status === 'failed' ? 'Échec'
                             : 'Remboursé'}
                          </span>
                        }
                      />
                    </div>

                    {/* Delivery */}
                    {o.delivery_method === 'delivery' && o.delivery_address && (
                      <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm">
                        <p className="text-xs font-bold uppercase text-blue-700">Adresse livraison</p>
                        <p className="mt-1 text-neutral-900">{o.delivery_address}</p>
                        {o.delivery_notes && (
                          <p className="mt-1 text-xs text-neutral-600">📝 {o.delivery_notes}</p>
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2">
                      {next && (
                        <button
                          onClick={() => handleStatusChange(o.id, next.next)}
                          disabled={actionLoading === o.id}
                          className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-600 disabled:opacity-50"
                        >
                          → {next.label}
                        </button>
                      )}
                      {canCancel && (
                        <button
                          onClick={() => handleCancel(o.id)}
                          disabled={actionLoading === o.id}
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

function Row({ label, value, bold = false }: { label: string; value: React.ReactNode; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={bold ? 'font-bold text-neutral-900' : 'text-neutral-600'}>{label}</span>
      <span className={bold ? 'font-mono font-bold text-neutral-900' : 'font-mono text-neutral-700'}>{value}</span>
    </div>
  );
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const day = Math.round(h / 24);
  if (day < 7) return `il y a ${day} j`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}
