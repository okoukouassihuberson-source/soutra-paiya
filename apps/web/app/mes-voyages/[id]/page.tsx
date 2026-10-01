import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import QRCode from 'qrcode';
import { formatTripDates, formatXOF } from '@soutra/shared';
import { supabaseServer } from '@/lib/supabase-server';
import { getMyTripBooking, BOOKING_STATUS_LABEL, QR_PREFIX } from '@/lib/trip-bookings';
import { TourismNav } from '@/components/tourism/TourismNav';
import { BookingActions } from './_components/BookingActions';

export const metadata: Metadata = { title: 'Ma réservation', robots: { index: false } };
export const dynamic = 'force-dynamic';

const KIND_LABEL: Record<string, string> = { deposit: 'Acompte', balance: 'Solde', full: 'Paiement intégral' };

export default async function BookingPage({ params, searchParams }: { params: { id: string }; searchParams: { status?: string } }) {
  const { data: { user } } = await supabaseServer().auth.getUser();
  if (!user) redirect('/login');
  const r = await getMyTripBooking(user.id, params.id);
  if (!r) notFound();
  const { booking: b, payments } = r;
  const t = b.trips;

  const ticketReady = b.status === 'paid' || b.status === 'confirmed' || b.status === 'used';
  // QR généré localement (le jeton de scan est un secret : jamais envoyé à un service tiers).
  const qr = ticketReady
    ? await QRCode.toDataURL(`${QR_PREFIX}${b.qr_token}`, { margin: 1, width: 280, errorCorrectionLevel: 'M' })
    : null;
  const due = b.total_xof - b.paid_xof;
  const depositPct = t?.deposit_pct ?? 100;
  const depositAmount = Math.ceil((b.total_xof * depositPct) / 100);
  const expired = b.status === 'pending' && b.paid_xof === 0 && b.expires_at && new Date(b.expires_at) < new Date();

  const banner = searchParams.status === 'success' ? { ok: true, t: 'Paiement confirmé. Votre billet est disponible ci-dessous.' }
    : searchParams.status === 'pending' ? { ok: true, t: 'Paiement en cours de confirmation. Actualisez dans quelques instants.' }
    : searchParams.status === 'failed' ? { ok: false, t: 'Le paiement a échoué ou a été annulé.' } : null;

  return (
    <>
      <TourismNav />
      <main className="mx-auto max-w-2xl space-y-6 px-4 pb-28 pt-8 sm:px-6">
        <Link href="/mes-voyages" className="text-sm font-medium text-primary-600">← Mes voyages</Link>
        {banner && <p role="status" className={`rounded-xl p-3 text-sm ${banner.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{banner.t}</p>}

        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-primary-600">{BOOKING_STATUS_LABEL[b.status] ?? b.status}</p>
          <h1 className="mt-1 font-display text-2xl font-bold">{t?.title ?? 'Voyage'}</h1>
          {t && <p className="text-neutral-600">{formatTripDates(t.starts_on, t.ends_on)} · {[t.city, t.country].filter(Boolean).join(', ')}</p>}
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-neutral-500">N° de réservation</dt><dd className="font-mono font-semibold">{b.reference}</dd></div>
            <div><dt className="text-neutral-500">Participants</dt><dd className="font-semibold">{b.participants}</dd></div>
            {t?.departure_point && <div><dt className="text-neutral-500">Départ</dt><dd className="font-semibold">{t.departure_point}{t.departure_time ? ` à ${t.departure_time.slice(0, 5)}` : ''}</dd></div>}
            <div><dt className="text-neutral-500">Montant payé</dt><dd className="font-semibold">{formatXOF(b.paid_xof)} / {formatXOF(b.total_xof)}</dd></div>
          </dl>
          {t && <Link className="mt-3 inline-block text-sm font-semibold text-primary-600 underline" href={`/voyages/${t.slug}`}>Voir le voyage</Link>}
        </section>

        {qr && (
          <section className="rounded-2xl border border-neutral-200 bg-white p-5 text-center shadow-sm">
            <h2 className="font-display text-lg font-bold">Votre billet</h2>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="QR code du billet" width={240} height={240} className="mx-auto my-3" />
            <p className="text-sm text-neutral-600">{b.status === 'used' ? `Billet utilisé le ${new Date(b.used_at!).toLocaleString('fr-FR')}` : 'Présentez ce QR code à l’organisateur au départ.'}</p>
            {due > 0 && <p className="mt-2 text-sm font-semibold text-amber-700">Solde restant à payer : {formatXOF(due)}</p>}
          </section>
        )}

        {b.status !== 'cancelled' && b.status !== 'used' && !expired && due > 0 && (
          <BookingActions bookingId={b.id} due={due} paid={b.paid_xof} depositAmount={depositAmount} depositPct={depositPct} total={b.total_xof} />
        )}
        {expired && <p className="rounded-xl bg-neutral-100 p-4 text-sm">Cette réservation a expiré faute de paiement dans les 24 h. Vous pouvez en créer une nouvelle.</p>}

        {payments.length > 0 && (
          <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <h2 className="font-display text-lg font-bold">Paiements et reçus</h2>
            <ul className="mt-3 divide-y text-sm">
              {payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2">
                  <span>{KIND_LABEL[p.kind] ?? p.kind}<br /><span className="font-mono text-xs text-neutral-500">{p.receipt_number} · {new Date(p.created_at).toLocaleDateString('fr-FR')}</span></span>
                  <b>{formatXOF(p.amount_xof)}</b>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}
