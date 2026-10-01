'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatXOF } from '@soutra/shared';
import { supabaseBrowser } from '@/lib/supabase';

const ERR: Record<string, string> = {
  REFUND_REQUIRED: 'Un montant a déjà été payé : contactez l’organisateur pour l’annulation et le remboursement.',
  EXPIRED: 'Cette réservation a expiré.',
};

export function BookingActions({ bookingId, due, paid, total, depositAmount, depositPct }: {
  bookingId: string; due: number; paid: number; total: number; depositAmount: number; depositPct: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function pay(kind: 'deposit' | 'balance' | 'full') {
    setBusy(kind); setErr(null);
    const { data, error } = await (supabaseBrowser().functions as any).invoke('geniuspay-pay-trip', { body: { booking_id: bookingId, kind } });
    if (error || !data?.checkout_url) {
      setErr(ERR[data?.reason] ?? 'Impossible de démarrer le paiement. Réessayez.');
      setBusy(null);
      return;
    }
    window.location.href = data.checkout_url;
  }

  async function cancel() {
    if (!window.confirm('Annuler cette réservation ?')) return;
    setBusy('cancel'); setErr(null);
    const { error } = await (supabaseBrowser() as any).rpc('cancel_trip_booking', { p_booking_id: bookingId });
    setBusy(null);
    if (error) { setErr(Object.entries(ERR).find(([k]) => error.message?.includes(k))?.[1] ?? 'Annulation impossible.'); return; }
    router.refresh();
  }

  const btn = 'w-full rounded-xl py-3 font-semibold disabled:opacity-60';
  return (
    <section className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="font-display text-lg font-bold">Paiement</h2>
      {paid === 0 ? (
        <>
          <button disabled={!!busy} onClick={() => pay('full')} className={`${btn} bg-primary-500 text-white hover:bg-primary-600`}>
            {busy === 'full' ? 'Redirection…' : `Payer la totalité (${formatXOF(total)})`}
          </button>
          {depositPct < 100 && (
            <button disabled={!!busy} onClick={() => pay('deposit')} className={`${btn} border border-primary-500 text-primary-600`}>
              {busy === 'deposit' ? 'Redirection…' : `Verser l’acompte de ${depositPct} % (${formatXOF(depositAmount)})`}
            </button>
          )}
        </>
      ) : (
        <button disabled={!!busy} onClick={() => pay('balance')} className={`${btn} bg-primary-500 text-white hover:bg-primary-600`}>
          {busy === 'balance' ? 'Redirection…' : `Payer le solde (${formatXOF(due)})`}
        </button>
      )}
      <p className="text-xs text-neutral-500">Paiement sécurisé : Orange Money, MTN, Moov, Wave ou carte.</p>
      {paid === 0 && <button disabled={!!busy} onClick={cancel} className="w-full text-sm font-medium text-neutral-500 underline">Annuler la réservation</button>}
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
    </section>
  );
}
