'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase';
import { formatXOF } from '@soutra/shared';

/* ─────────────────────────────────────────────────── *
 *  TYPES — miroir de admin_list_subscribers (0054)    *
 * ─────────────────────────────────────────────────── */

type PlanCode = 'free' | 'standard' | 'pro' | 'premium' | 'soutra_premium';

interface Subscriber {
  user_id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  kyc_status: string | null;
  user_created_at: string;
  sub_id: string | null;
  plan_code: PlanCode | null;
  plan_display_name: string | null;
  plan_cashback_bps: number | null;
  status: 'active' | 'trialing' | 'past_due' | 'cancelled' | 'expired' | null;
  billing_period: 'monthly' | 'yearly' | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  auto_renew: boolean | null;
  last_card_brand: string | null;
  last_card_last4: string | null;
  total_paid_xof: number;
  cashback_received_xof: number;
  ltv_xof: number;
  mrr_xof: number;
  payment_count: number;
  cashback_count: number;
  sub_count: number;
  last_payment_at: string | null;
}

interface ApiResponse {
  rows: Subscriber[];
  total_count: number;
  limit: number;
  offset: number;
  generated_at: string;
}

const PLAN_COLORS: Record<PlanCode, string> = {
  free: '#6b7280',
  standard: '#f97316',
  pro: '#3b82f6',
  premium: '#a855f7',
  soutra_premium: '#f59e0b',
};

const STATUS_META: Record<NonNullable<Subscriber['status']>, { label: string; tone: string }> = {
  active:    { label: 'Actif',         tone: 'bg-emerald-500/15 text-emerald-400' },
  trialing:  { label: 'Essai',         tone: 'bg-blue-500/15 text-blue-400' },
  past_due:  { label: 'Paiement KO',   tone: 'bg-amber-500/15 text-amber-400' },
  cancelled: { label: 'Résilié',       tone: 'bg-neutral-500/15 text-neutral-400' },
  expired:   { label: 'Expiré',        tone: 'bg-red-500/15 text-red-400' },
};

const PAGE_SIZE = 50;

/* ─────────────────────────────────────────────────── *
 *  MAIN COMPONENT                                     *
 * ─────────────────────────────────────────────────── */

export function SubscribersTab() {
  const sb = supabaseBrowser();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | NonNullable<Subscriber['status']>>('all');
  const [planFilter, setPlanFilter] = useState<'all' | PlanCode>('all');
  const [page, setPage] = useState(0);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debounce search (300ms) pour ne pas spam la DB à chaque keypress.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  // Reset page si filtre change
  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, statusFilter, planFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await (sb.rpc as any)('admin_list_subscribers', {
      p_search: debouncedSearch || null,
      p_status_filter: statusFilter,
      p_plan_filter: planFilter,
      p_limit: PAGE_SIZE,
      p_offset: page * PAGE_SIZE,
    });
    if (error) {
      setError(error.message || 'Erreur de chargement');
      setData(null);
    } else {
      setData(data as ApiResponse);
    }
    setLoading(false);
  }, [sb, debouncedSearch, statusFilter, planFilter, page]);

  useEffect(() => { load(); }, [load]);

  const exportCsv = useCallback(() => {
    if (!data?.rows.length) return;
    const headers = [
      'user_id', 'full_name', 'phone', 'email',
      'plan', 'status', 'billing_period',
      'mrr_xof', 'total_paid_xof', 'cashback_received_xof', 'ltv_xof',
      'payment_count', 'cashback_count', 'sub_count',
      'current_period_end', 'last_payment_at', 'auto_renew',
    ];
    const lines = [
      headers.join(','),
      ...data.rows.map((r) => [
        r.user_id,
        csvEscape(r.full_name || ''),
        r.phone || '',
        r.email || '',
        r.plan_code || '',
        r.status || '',
        r.billing_period || '',
        r.mrr_xof,
        r.total_paid_xof,
        r.cashback_received_xof,
        r.ltv_xof,
        r.payment_count,
        r.cashback_count,
        r.sub_count,
        r.current_period_end || '',
        r.last_payment_at || '',
        r.auto_renew ?? '',
      ].join(',')),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `soutra-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data]);

  const totalPages = useMemo(
    () => data ? Math.max(1, Math.ceil(data.total_count / PAGE_SIZE)) : 1,
    [data],
  );

  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6 text-center">
        <p className="text-sm font-medium text-red-400">Erreur : {error}</p>
        <p className="mt-2 text-xs text-neutral-500">
          La migration 0054 (admin_list_subscribers) est-elle appliquée ?
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ═══════════ HEADER + FILTRES ═══════════ */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-display text-lg font-bold">Tous les abonnés</p>
          <p className="text-xs text-neutral-500">
            {data ? `${data.total_count.toLocaleString('fr-FR')} utilisateurs` : '…'}
          </p>
        </div>
        <button
          onClick={exportCsv}
          disabled={!data?.rows.length}
          className="rounded-full border border-neutral-800 bg-neutral-900/50 px-3 py-1.5 text-xs font-semibold text-neutral-300 transition hover:border-primary-500/40 hover:text-primary-400 disabled:opacity-50"
        >
          ⤓ Exporter CSV (page)
        </button>
      </div>

      <div className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr,auto,auto]">
          {/* Search */}
          <div className="relative">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par nom, téléphone, email…"
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 py-2.5 pl-9 pr-4 text-sm text-white placeholder:text-neutral-500 focus:border-primary-500 focus:outline-none"
            />
          </div>
          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-sm text-white focus:border-primary-500 focus:outline-none"
          >
            <option value="all">Tous les statuts</option>
            <option value="active">Actif</option>
            <option value="trialing">Essai</option>
            <option value="past_due">Paiement KO</option>
            <option value="cancelled">Résilié</option>
            <option value="expired">Expiré</option>
          </select>
          {/* Plan filter */}
          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value as any)}
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-sm text-white focus:border-primary-500 focus:outline-none"
          >
            <option value="all">Tous les plans</option>
            <option value="free">Free</option>
            <option value="standard">Standard</option>
            <option value="pro">Pro</option>
            <option value="premium">Premium</option>
            <option value="soutra_premium">Soutra Premium</option>
          </select>
        </div>
      </div>

      {/* ═══════════ TABLE ═══════════ */}
      <div className="overflow-hidden rounded-2xl border border-neutral-800/50 bg-neutral-900/50">
        {loading && !data ? (
          <div className="p-12 text-center text-sm text-neutral-500">
            Chargement…
          </div>
        ) : !data || data.rows.length === 0 ? (
          <div className="p-12 text-center text-sm text-neutral-500">
            Aucun abonné ne correspond aux filtres.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-800/50 text-left text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                  <th className="px-4 py-3">Utilisateur</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3 text-right">MRR</th>
                  <th className="px-4 py-3 text-right">Payé total</th>
                  <th className="px-4 py-3 text-right">Cashback reçu</th>
                  <th className="px-4 py-3 text-right">LTV net</th>
                  <th className="px-4 py-3">Renouv.</th>
                  <th className="px-4 py-3 text-center">Auto</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((s) => (
                  <tr key={s.user_id} className="border-b border-neutral-800/30 transition hover:bg-neutral-800/20">
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold">{s.full_name || '— (sans nom)'}</p>
                      <p className="font-mono text-[10px] text-neutral-500">
                        {s.phone || '—'}
                        {s.email && <> · {s.email}</>}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {s.plan_code ? (
                        <div className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full" style={{ background: PLAN_COLORS[s.plan_code] }} />
                          <span className="text-xs font-semibold">{s.plan_display_name}</span>
                          {s.billing_period && (
                            <span className="text-[10px] text-neutral-500">
                              · {s.billing_period === 'monthly' ? '/mois' : '/an'}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-neutral-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {s.status ? (
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_META[s.status].tone}`}>
                          {STATUS_META[s.status].label}
                        </span>
                      ) : (
                        <span className="text-xs text-neutral-600">—</span>
                      )}
                      {s.cancel_at_period_end && s.status === 'active' && (
                        <p className="mt-0.5 text-[9px] text-amber-500">⚠ résil. programmée</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-mono text-sm ${s.mrr_xof > 0 ? 'font-bold text-emerald-400' : 'text-neutral-600'}`}>
                        {s.mrr_xof > 0 ? formatXOF(s.mrr_xof) : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-mono text-sm font-semibold">{formatXOF(s.total_paid_xof)}</span>
                      <p className="text-[10px] text-neutral-500">{s.payment_count} paiement{s.payment_count > 1 ? 's' : ''}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-mono text-sm text-emerald-400">{formatXOF(s.cashback_received_xof)}</span>
                      <p className="text-[10px] text-neutral-500">{s.cashback_count} crédit{s.cashback_count > 1 ? 's' : ''}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-mono text-sm font-bold ${
                        s.ltv_xof > 0 ? 'text-white' : s.ltv_xof < 0 ? 'text-red-400' : 'text-neutral-500'
                      }`}>
                        {formatXOF(s.ltv_xof)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-400">
                      {s.current_period_end ? formatDate(s.current_period_end) : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {s.auto_renew == null ? (
                        <span className="text-xs text-neutral-600">—</span>
                      ) : s.auto_renew ? (
                        <span className="inline-flex items-center justify-center text-emerald-400" title={s.last_card_brand && s.last_card_last4 ? `${s.last_card_brand} •••• ${s.last_card_last4}` : 'Activé'}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center text-neutral-500" title="Désactivé">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ═══════════ PAGINATION ═══════════ */}
      {data && data.total_count > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-neutral-500">
            Page {page + 1} / {totalPages} · {data.rows.length} sur {data.total_count.toLocaleString('fr-FR')} affichés
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
              className="rounded-full border border-neutral-800 bg-neutral-900/50 px-3 py-1.5 text-xs font-semibold text-neutral-300 transition hover:border-primary-500/40 disabled:opacity-40"
            >
              ← Précédent
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={(page + 1) * PAGE_SIZE >= data.total_count || loading}
              className="rounded-full border border-neutral-800 bg-neutral-900/50 px-3 py-1.5 text-xs font-semibold text-neutral-300 transition hover:border-primary-500/40 disabled:opacity-40"
            >
              Suivant →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────── *
 *  UTILS                                              *
 * ─────────────────────────────────────────────────── */

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function csvEscape(s: string): string {
  if (!s) return '';
  // Si contient virgule, guillemets ou newline → encadrer + échapper guillemets
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
