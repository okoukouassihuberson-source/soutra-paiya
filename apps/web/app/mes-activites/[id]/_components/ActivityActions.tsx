'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatXOF } from '@soutra/shared';
import { supabaseBrowser } from '@/lib/supabase';

type Props = { mode: 'pay'; bookingId: string; total: number; expiresAt: string | null } | { mode: 'review'; bookingId: string };

export function ActivityActions(props: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');

  async function pay() {
    setBusy('pay'); setErr(null);
    const { data, error } = await (supabaseBrowser().functions as any).invoke('geniuspay-pay-activity', { body: { booking_id: props.bookingId } });
    if (error || !data?.checkout_url) {
      setErr(data?.reason === 'EXPIRED' ? 'Cette réservation a expiré.' : 'Impossible de démarrer le paiement. Réessayez.');
      setBusy(null);
      return;
    }
    window.location.href = data.checkout_url;
  }

  async function cancel() {
    if (!window.confirm('Annuler cette réservation ?')) return;
    setBusy('cancel'); setErr(null);
    const { error } = await (supabaseBrowser() as any).rpc('cancel_activity_booking', { p_booking_id: props.bookingId });
    setBusy(null);
    if (error) { setErr(error.message?.includes('REFUND_REQUIRED') ? 'Un montant a déjà été payé : contactez l’organisateur pour l’annulation et le remboursement.' : 'Annulation impossible.'); return; }
    router.refresh();
  }

  async function review(e: React.FormEvent) {
    e.preventDefault();
    setBusy('review'); setErr(null);
    const { error } = await (supabaseBrowser() as any).rpc('submit_activity_review', { p_booking_id: props.bookingId, p_rating: rating, p_comment: comment || null });
    setBusy(null);
    if (error) { setErr(error.message?.includes('ALREADY_REVIEWED') ? 'Vous avez déjà donné votre avis.' : 'Avis impossible pour le moment.'); return; }
    router.refresh();
  }

  if (props.mode === 'pay') {
    return (
      <section className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="font-display text-lg font-bold">Paiement</h2>
        <button disabled={!!busy} onClick={pay} className="w-full rounded-xl bg-primary-500 py-3 font-semibold text-white hover:bg-primary-600 disabled:opacity-60">
          {busy === 'pay' ? 'Redirection…' : `Payer ${formatXOF(props.total)}`}
        </button>
        <p className="text-xs text-neutral-500">Paiement sécurisé : Orange Money, MTN, Moov, Wave ou carte.{props.expiresAt ? ` À régler avant ${new Date(props.expiresAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Abidjan' })}.` : ''}</p>
        <button disabled={!!busy} onClick={cancel} className="w-full text-sm font-medium text-neutral-500 underline">Annuler la réservation</button>
        {err && <p role="alert" className="text-sm text-danger">{err}</p>}
      </section>
    );
  }
  return (
    <form onSubmit={review} className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="font-display text-lg font-bold">Donnez votre avis</h2>
      <div role="radiogroup" aria-label="Note" className="flex gap-1 text-3xl">
        {[1, 2, 3, 4, 5].map((n) => (
          <button type="button" key={n} role="radio" aria-checked={rating === n} aria-label={`${n} sur 5`} onClick={() => setRating(n)} className={n <= rating ? 'text-amber-500' : 'text-neutral-300'}>★</button>
        ))}
      </div>
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} rows={3} placeholder="Racontez votre expérience (optionnel)" className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm" />
      <button disabled={!!busy} className="rounded-xl bg-dark px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">{busy === 'review' ? 'Envoi…' : 'Publier mon avis'}</button>
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
    </form>
  );
}
