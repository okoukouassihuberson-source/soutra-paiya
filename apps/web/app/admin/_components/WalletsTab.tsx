'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase';
import { formatXOF } from '@soutra/shared';

/* ─────────────────────────────────────────────────── *
 *  TYPES — miroir d'admin_search_wallets (migration 0072) *
 * ─────────────────────────────────────────────────── */

interface WalletRow {
  user_id: string;
  full_name: string | null;
  phone: string | null;
  kyc_status: string | null;
  balance_xof: number;
  locked_xof: number;
  daily_limit_xof: number;
  monthly_limit_xof: number;
}

/* ─────────────────────────────────────────────────── *
 *  MAIN COMPONENT                                     *
 * ─────────────────────────────────────────────────── */

export function WalletsTab() {
  const sb = supabaseBrowser();
  const [search, setSearch] = useState('');
  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<WalletRow | null>(null);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    setError(null);
    const { data, error } = await (sb.rpc as any)('admin_search_wallets', {
      p_search: q || null,
      p_limit: 50,
    });
    if (error) {
      setError(error.message || 'Erreur de chargement');
      setWallets([]);
    } else {
      setWallets((data as WalletRow[]) ?? []);
    }
    setLoading(false);
  }, [sb]);

  useEffect(() => { load(search); }, [load, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-display text-lg font-bold">Wallets</p>
          <p className="text-xs text-neutral-500">Recherche et correction manuelle de solde (toujours tracée)</p>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Nom ou téléphone…"
          className="w-64 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white placeholder:text-neutral-600"
        />
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-neutral-800/50 bg-neutral-900/50">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-800/50 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                <th className="px-6 py-3">Utilisateur</th>
                <th className="px-6 py-3">KYC</th>
                <th className="px-6 py-3 text-right">Solde</th>
                <th className="px-6 py-3 text-right">Verrouillé</th>
                <th className="px-6 py-3 text-right">Limite jour</th>
                <th className="px-6 py-3 text-right">Limite mois</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-6 py-12 text-center text-neutral-500">Chargement…</td></tr>
              ) : wallets.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-12 text-center text-neutral-500">Aucun résultat.</td></tr>
              ) : wallets.map((w) => (
                <tr key={w.user_id} className="border-b border-neutral-800/30 transition hover:bg-neutral-800/20">
                  <td className="px-6 py-3">
                    <p className="font-medium">{w.full_name || '— (sans nom)'}</p>
                    <p className="font-mono text-[11px] text-neutral-500">{w.phone || '—'}</p>
                  </td>
                  <td className="px-6 py-3 text-xs text-neutral-400">{w.kyc_status || '—'}</td>
                  <td className="px-6 py-3 text-right font-mono font-bold">{formatXOF(w.balance_xof)}</td>
                  <td className="px-6 py-3 text-right font-mono text-neutral-400">{formatXOF(w.locked_xof)}</td>
                  <td className="px-6 py-3 text-right font-mono text-xs text-neutral-500">{formatXOF(w.daily_limit_xof)}</td>
                  <td className="px-6 py-3 text-right font-mono text-xs text-neutral-500">{formatXOF(w.monthly_limit_xof)}</td>
                  <td className="px-6 py-3 text-right">
                    <button
                      onClick={() => setAdjustTarget(w)}
                      className="rounded-full border border-primary-500/40 bg-primary-500/10 px-3 py-1.5 text-xs font-semibold text-primary-400 transition hover:bg-primary-500/20"
                    >
                      Ajuster
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {adjustTarget && (
        <AdjustModal
          wallet={adjustTarget}
          onClose={() => setAdjustTarget(null)}
          onDone={() => { setAdjustTarget(null); load(search); }}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────── *
 *  MODAL D'AJUSTEMENT                                 *
 * ─────────────────────────────────────────────────── */

function AdjustModal({
  wallet, onClose, onDone,
}: { wallet: WalletRow; onClose: () => void; onDone: () => void }) {
  const sb = supabaseBrowser();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountNum = Number(amount);
  const canSubmit = Number.isFinite(amountNum) && amountNum !== 0 && reason.trim().length >= 3 && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    const { data, error } = await (sb.rpc as any)('admin_adjust_wallet', {
      p_user_id: wallet.user_id,
      p_amount_xof: Math.round(amountNum),
      p_reason: reason.trim(),
    });
    setSubmitting(false);
    if (error || !data?.ok) {
      setError(error?.message || data?.reason || 'Ajustement impossible');
      return;
    }
    onDone();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4"
      onClick={() => !submitting && onClose()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6"
      >
        <h3 className="font-display text-lg font-bold">Ajuster le solde</h3>
        <p className="mt-1 text-sm text-neutral-400">
          {wallet.full_name || wallet.phone} · solde actuel {formatXOF(wallet.balance_xof)}
        </p>

        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Montant (FCFA, négatif pour débiter)
        </label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="ex: 5000 ou -2000"
          className="mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white"
        />

        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Raison (obligatoire, tracée dans le journal d'audit)
        </label>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="ex: compensation incident du 12/03"
          className="mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white"
        />

        {error && <p className="mt-3 text-xs font-semibold text-red-400">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="rounded-full border border-neutral-700 px-4 py-2 text-sm font-semibold text-neutral-300 transition hover:bg-neutral-800 disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="rounded-full bg-primary-500 px-4 py-2 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-40"
          >
            {submitting ? 'Application…' : 'Confirmer'}
          </button>
        </div>
      </div>
    </div>
  );
}
