'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase';
import { formatXOF } from '@soutra/shared';

// ============================================================================
// VenuePayoutPanel — section "Payouts gérant" de l'onglet Finances.
//
// Affiche le solde payable d'un venue + permet d'en demander un virement
// vers un compte mobile money (MTN / Orange / Wave). RPCs/Edge function de
// la migration 0044 (table venue_payouts + venue-payout-initiate).
// ============================================================================

interface PayableBalance {
  gross_xof: number;
  commission_xof: number;
  net_xof: number;
  pending_xof: number;
  paid_xof: number;
  payable_xof: number;
}

interface PayoutRow {
  id: string;
  amount_xof: number;
  provider: string;
  phone: string;
  status: 'pending' | 'success' | 'failed' | 'reversed';
  paystack_reference: string;
  failure_reason: string | null;
  requested_at: string;
  completed_at: string | null;
}

type Provider = 'mtn' | 'orange' | 'wave';

const PROVIDERS: { id: Provider; label: string; color: string }[] = [
  { id: 'orange', label: 'Orange Money', color: 'bg-orange-500' },
  { id: 'mtn',    label: 'MTN MoMo',     color: 'bg-yellow-500' },
  { id: 'wave',   label: 'Wave',         color: 'bg-blue-500' },
];

const STATUS_META: Record<PayoutRow['status'], { label: string; classes: string }> = {
  pending:  { label: 'En cours', classes: 'bg-amber-50 text-amber-700 ring-amber-200' },
  success:  { label: 'Réussi',   classes: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  failed:   { label: 'Échec',    classes: 'bg-red-50 text-red-700 ring-red-200' },
  reversed: { label: 'Annulé',   classes: 'bg-neutral-100 text-neutral-700 ring-neutral-200' },
};

const MIN_XOF = 1000;
const MAX_XOF = 2_000_000;
const PHONE_RE = /^\+225[0-9]{10}$/;

interface VenuePayoutPanelProps {
  venueId: string | null;
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function VenuePayoutPanel({ venueId }: VenuePayoutPanelProps) {
  const sb = supabaseBrowser();
  const [balance, setBalance] = useState<PayableBalance | null>(null);
  const [history, setHistory] = useState<PayoutRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ownerKycVerified, setOwnerKycVerified] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [provider, setProvider] = useState<Provider | null>(null);
  const [phone, setPhone] = useState('+225');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!venueId) return;
    setLoading(true);
    setError(null);
    try {
      const { data: sessionData } = await sb.auth.getSession();
      const userId = sessionData.session?.user?.id;
      const [balRes, listRes, profileRes] = await Promise.all([
        (sb.rpc as any)('get_venue_payable_balance', { p_venue_id: venueId }),
        (sb.rpc as any)('list_venue_payouts', { p_venue_id: venueId, p_limit: 20 }),
        userId
          ? sb.from('profiles').select('kyc_status').eq('id', userId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (balRes.error) {
        const raw = balRes.error.message ?? '';
        if (raw.includes('NOT_OWNER')) setError("Tu n'es pas le propriétaire de ce lieu.");
        else setError(raw || 'Impossible de charger le solde payable.');
        setBalance(null);
      } else {
        setBalance(balRes.data as PayableBalance);
      }
      if (!listRes.error) setHistory((listRes.data as PayoutRow[]) ?? []);
      setOwnerKycVerified((profileRes.data as any)?.kyc_status === 'verified');
    } finally {
      setLoading(false);
    }
  }, [sb, venueId]);

  useEffect(() => { void load(); }, [load]);

  const amountNum = parseInt(amount || '0', 10);
  const payable = balance?.payable_xof ?? 0;
  const amountValid =
    amountNum >= MIN_XOF && amountNum <= Math.min(MAX_XOF, payable);
  const phoneValid = PHONE_RE.test(phone);
  const canSubmit =
    ownerKycVerified && amountValid && phoneValid && !!provider && !submitting && payable > 0;

  const openModal = () => {
    setAmount('');
    setProvider(null);
    setPhone('+225');
    setSubmitError(null);
    setSubmitSuccess(null);
    setModalOpen(true);
  };

  const submitPayout = async () => {
    if (!venueId || !provider || !amountValid || !phoneValid) return;
    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);
    try {
      const { data, error: invokeErr } = await sb.functions.invoke<{
        status?: 'success' | 'pending';
        reference?: string;
        error?: string;
      }>('venue-payout-initiate', {
        body: {
          venue_id: venueId,
          amount_xof: amountNum,
          provider,
          phone,
        },
      });
      if (invokeErr) {
        // L'erreur HTTP arrive ici ; on essaie d'extraire le message JSON.
        let message = invokeErr.message || 'Erreur réseau';
        const ctx = (invokeErr as any).context;
        if (ctx && typeof ctx.json === 'function') {
          try {
            const payload = await ctx.json();
            if (payload?.error) message = String(payload.error);
          } catch { /* corps non-JSON */ }
        }
        setSubmitError(message);
        return;
      }
      if (data?.error) {
        setSubmitError(data.error);
        return;
      }
      setSubmitSuccess(
        data?.status === 'success'
          ? `${formatXOF(amountNum)} ont été envoyés vers ton compte ${provider.toUpperCase()}.`
          : `Ton retrait de ${formatXOF(amountNum)} est en cours de traitement.`,
      );
      // Re-fetch balance et historique.
      await load();
      // Auto-close après 2.5s
      setTimeout(() => setModalOpen(false), 2500);
    } catch (err: any) {
      setSubmitError(err?.message ?? 'Erreur inconnue');
    } finally {
      setSubmitting(false);
    }
  };

  if (!venueId) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Payouts gérant</p>
      </div>

      {/* Balance card */}
      <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Solde payable</p>
            <p className="mt-1 font-display text-3xl font-extrabold text-emerald-900">
              {loading ? '…' : formatXOF(payable)}
            </p>
            <p className="mt-1 text-xs text-emerald-700/80">
              Net : {formatXOF(balance?.net_xof ?? 0)}
              {balance && balance.pending_xof > 0 && ` · ${formatXOF(balance.pending_xof)} en cours`}
              {balance && balance.paid_xof > 0 && ` · ${formatXOF(balance.paid_xof)} déjà payés`}
            </p>
          </div>
          <button
            onClick={openModal}
            disabled={!ownerKycVerified || payable < MIN_XOF || loading}
            className="rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
            title={
              !ownerKycVerified
                ? 'KYC requis pour retirer'
                : payable < MIN_XOF
                  ? `Solde minimum ${formatXOF(MIN_XOF)}`
                  : 'Demander un retrait mobile money'
            }
          >
            💸 Demander un retrait
          </button>
        </div>
        {!ownerKycVerified && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            ⚠️ Vérification d'identité (KYC) requise pour retirer tes revenus.
          </p>
        )}
        {error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">{error}</p>
        )}
      </div>

      {/* Historique des retraits */}
      <div className="rounded-2xl border border-neutral-200 bg-white">
        <div className="border-b border-neutral-100 px-6 py-4">
          <h3 className="font-display text-base font-bold text-dark">Historique des retraits</h3>
        </div>
        {history.length === 0 ? (
          <div className="py-10 text-center text-sm text-neutral-400">
            {loading ? 'Chargement…' : 'Aucun retrait pour le moment'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-100 text-left text-xs font-semibold uppercase tracking-wider text-neutral-400">
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Montant</th>
                  <th className="px-6 py-3">Opérateur</th>
                  <th className="px-6 py-3">Numéro</th>
                  <th className="px-6 py-3">Statut</th>
                </tr>
              </thead>
              <tbody>
                {history.map((p) => {
                  const meta = STATUS_META[p.status] ?? STATUS_META.pending;
                  return (
                    <tr key={p.id} className="border-b border-neutral-50 hover:bg-neutral-50/50">
                      <td className="px-6 py-3 text-xs text-neutral-500">{formatDateTime(p.requested_at)}</td>
                      <td className="px-6 py-3 font-mono font-medium">{formatXOF(p.amount_xof)}</td>
                      <td className="px-6 py-3 text-xs uppercase">{p.provider}</td>
                      <td className="px-6 py-3 font-mono text-xs text-neutral-600">{p.phone}</td>
                      <td className="px-6 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${meta.classes}`}>
                          {meta.label}
                        </span>
                        {p.failure_reason && (
                          <p className="mt-1 max-w-[280px] truncate text-[10px] text-red-600" title={p.failure_reason}>
                            {p.failure_reason}
                          </p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de demande de retrait */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => { if (e.target === e.currentTarget && !submitting) setModalOpen(false); }}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-dark">Retrait mobile money</h3>
              <button
                onClick={() => setModalOpen(false)}
                disabled={submitting}
                className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100"
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>

            <div className="mb-4 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">
              Solde payable : <strong>{formatXOF(payable)}</strong>
            </div>

            <label className="mb-4 block">
              <span className="mb-1 block text-xs font-semibold text-neutral-700">Montant (FCFA)</span>
              <input
                type="text"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="0"
                disabled={submitting}
                className={`w-full rounded-lg border px-3 py-2 text-base font-medium focus:outline-none focus:ring-2 ${
                  amount.length > 0 && !amountValid
                    ? 'border-red-300 focus:ring-red-200'
                    : 'border-neutral-200 focus:ring-emerald-200'
                }`}
              />
              {amount.length > 0 && !amountValid && (
                <p className="mt-1 text-xs text-red-600">
                  {amountNum > payable
                    ? `Solde payable insuffisant (${formatXOF(payable)}).`
                    : amountNum > MAX_XOF
                      ? `Maximum ${formatXOF(MAX_XOF)} par opération.`
                      : `Minimum ${formatXOF(MIN_XOF)}.`}
                </p>
              )}
            </label>

            <div className="mb-4">
              <span className="mb-1 block text-xs font-semibold text-neutral-700">Opérateur</span>
              <div className="flex flex-wrap gap-2">
                {PROVIDERS.map((p) => {
                  const active = provider === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setProvider(p.id)}
                      disabled={submitting}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                        active
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                          : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300'
                      }`}
                    >
                      <span className={`h-2.5 w-2.5 rounded-full ${p.color}`} />
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="mb-4 block">
              <span className="mb-1 block text-xs font-semibold text-neutral-700">Numéro mobile money</span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^0-9+]/g, ''))}
                placeholder="+225XXXXXXXXXX"
                disabled={submitting}
                maxLength={14}
                className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                  phone.length > 4 && !phoneValid
                    ? 'border-red-300 focus:ring-red-200'
                    : 'border-neutral-200 focus:ring-emerald-200'
                }`}
              />
              {phone.length > 4 && !phoneValid && (
                <p className="mt-1 text-xs text-red-600">Format attendu : +225 suivi de 10 chiffres.</p>
              )}
            </label>

            {submitError && (
              <div className="mb-3 rounded-lg bg-red-50 p-3 text-xs text-red-800">{submitError}</div>
            )}
            {submitSuccess && (
              <div className="mb-3 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">✓ {submitSuccess}</div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setModalOpen(false)}
                disabled={submitting}
                className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={submitPayout}
                disabled={!canSubmit}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
              >
                {submitting
                  ? 'Envoi en cours…'
                  : amountValid
                    ? `Retirer ${formatXOF(amountNum)}`
                    : 'Demander le retrait'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
