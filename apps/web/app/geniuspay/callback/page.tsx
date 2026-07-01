'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase';

/**
 * Page de retour après un paiement GeniusPay.
 *
 * Trois flows distincts détectés via le préfixe de la `reference` :
 *   • `sp-…`       → mobile classique (recharge wallet, acompte réservation).
 *     Après verify, redirect vers le deep link soutrapaiya://geniuspay pour
 *     ré-ouvrir l'app.
 *   • `sp-ord-…`   → order boutique (mobile) → verify + deep link vers
 *     soutrapaiya://geniuspay pour ré-ouvrir l'app sur /orders.
 *   • `sp-bkg-…`   → room_booking hôtel (mobile) → verify + deep link.
 *
 * Note : `sp-sub-…` (abonnement) reste sur le callback /paystack/callback
 * jusqu'à PR #3. Si un jour un abonnement transite ici par erreur, on le
 * laisse passer au deep link sans verify (les abonnements n'utilisent pas
 * ce chemin en PR #2).
 */
export default function GeniuspayCallbackPage() {
  return (
    <Suspense>
      <CallbackInner />
    </Suspense>
  );
}

function CallbackInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sb = supabaseBrowser();
  const [stage, setStage] = useState<
    'verifying' | 'success' | 'failed' | 'mobile'
  >('verifying');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [deepLink, setDeepLink] = useState('soutrapaiya://geniuspay');

  useEffect(() => {
    const reference = searchParams?.get('reference');
    const forcedFailed = searchParams?.get('status') === 'failed';

    // Pas de reference → on ferme simplement en deep link (filet de sécurité).
    if (!reference) {
      setStage('mobile');
      const target = `soutrapaiya://geniuspay${window.location.search}`;
      setDeepLink(target);
      window.location.href = target;
      return;
    }

    const isOrder = reference.startsWith('sp-ord-');
    const isBooking = reference.startsWith('sp-bkg-');
    // Tout autre préfixe (sp-…) = mobile classique.

    (async () => {
      try {
        // Si l'error_url a été touchée, GeniusPay a échoué → on skip le verify
        // et on route directement vers failed.
        if (forcedFailed) {
          setStage('failed');
          setErrorMsg(
            'Le paiement a été annulé ou refusé. Tu peux réessayer.',
          );
          window.setTimeout(() => {
            window.location.href = `soutrapaiya://geniuspay${window.location.search}`;
          }, 1500);
          return;
        }

        const { data, error } = await (sb.functions as any).invoke(
          'geniuspay-verify',
          { body: { reference } },
        );
        if (error) {
          setErrorMsg(error.message || 'Erreur de vérification');
          setStage('failed');
          window.setTimeout(() => {
            window.location.href = `soutrapaiya://geniuspay${window.location.search}`;
          }, 1500);
          return;
        }
        const status = (data as { status?: string } | null)?.status;
        const outcome = status === 'success'
          ? 'success'
          : status === 'pending'
            ? 'pending'
            : 'failed';
        setStage(outcome === 'failed' ? 'failed' : 'success');
        window.setTimeout(() => {
          // Pour les orders et bookings sur mobile, le deep-link ré-ouvre l'app
          // qui va rafraîchir ses écrans /orders ou /hotel-bookings.
          void isOrder;
          void isBooking;
          window.location.href = `soutrapaiya://geniuspay${window.location.search}`;
        }, 1200);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Erreur inattendue');
        setStage('failed');
        window.setTimeout(() => {
          window.location.href = `soutrapaiya://geniuspay${window.location.search}`;
        }, 1500);
      }
    })();
    void router; // le router n'est pas utilisé ici mais on le garde par symétrie
  }, [searchParams, sb, router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 px-6 text-center dark:bg-neutral-950">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-8 shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
        {stage === 'verifying' && (
          <>
            <div className="mx-auto mb-5 h-12 w-12 animate-spin rounded-full border-4 border-neutral-200 border-t-primary-500" />
            <h1 className="font-display text-xl font-bold text-neutral-900 dark:text-white">
              Vérification du paiement…
            </h1>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              Quelques secondes seulement.
            </p>
          </>
        )}

        {stage === 'success' && (
          <>
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-3xl text-emerald-500">
              ✓
            </div>
            <h1 className="font-display text-xl font-bold text-neutral-900 dark:text-white">
              Paiement confirmé
            </h1>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              Retour à l&apos;application en cours…
            </p>
          </>
        )}

        {stage === 'failed' && (
          <>
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/15 text-3xl text-red-500">
              ✗
            </div>
            <h1 className="font-display text-xl font-bold text-neutral-900 dark:text-white">
              Paiement non confirmé
            </h1>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              {errorMsg || 'La transaction n\'a pas été validée. Tu peux réessayer.'}
            </p>
          </>
        )}

        {stage === 'mobile' && (
          <>
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-primary-500/15 text-3xl text-primary-500">
              ✓
            </div>
            <h1 className="font-display text-xl font-bold text-neutral-900 dark:text-white">
              Paiement terminé
            </h1>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              Tu peux retourner dans l&apos;application Soutra-Paiya. Si rien ne
              se passe, touche le bouton ci-dessous.
            </p>
            <a
              href={deepLink}
              className="mt-6 inline-block w-full rounded-2xl bg-primary-500 px-4 py-3 font-semibold text-white shadow-lg shadow-primary-500/30"
            >
              Rouvrir l&apos;application
            </a>
          </>
        )}
      </div>
    </main>
  );
}
