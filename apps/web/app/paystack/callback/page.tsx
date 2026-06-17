'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase';

/**
 * Page de retour après un paiement Paystack.
 *
 * Deux flows distincts détectés via le préfixe de la `reference` :
 *   • `sp-sub-…`   → paiement d'un abonnement depuis /subscribe (web).
 *     On appelle paystack-verify pour finaliser, puis redirect vers
 *     /subscribe?status=success|failed avec toast.
 *   • toute autre → paiement mobile (recharge wallet, acompte réservation).
 *     On redirige vers le deep link soutrapaiya:// pour ré-ouvrir l'app.
 */
export default function PaystackCallbackPage() {
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
  const [stage, setStage] = useState<'verifying' | 'success' | 'failed' | 'mobile'>(
    'verifying',
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [deepLink, setDeepLink] = useState('soutrapaiya://paystack');

  useEffect(() => {
    const reference = searchParams?.get('reference') || searchParams?.get('trxref');

    // Pas de reference → on traite comme mobile (filet de sécurité).
    if (!reference) {
      setStage('mobile');
      const target = `soutrapaiya://paystack${window.location.search}`;
      setDeepLink(target);
      window.location.href = target;
      return;
    }

    // Détection du type de paiement par préfixe de référence :
    //   • sp-sub-…  → subscription web → redirect /subscribe?status=…
    //   • sp-ord-…  → order boutique → redirect /orders?status=… si
    //                 navigateur web ; sinon deep-link mobile vers
    //                 soutrapaiya:// pour réouvrir l'app sur l'écran orders
    //   • autres    → flow mobile historique (recharge wallet, acompte
    //                 réservation) → deep-link soutrapaiya://
    const isSub = reference.startsWith('sp-sub-');
    const isOrder = reference.startsWith('sp-ord-');
    const isBooking = reference.startsWith('sp-bkg-');

    if (isSub || isOrder || isBooking) {
      const targetRoute = isSub ? '/subscribe' : isOrder ? '/orders' : '/room-bookings';
      (async () => {
        try {
          const { data, error } = await (sb.functions as any).invoke('paystack-verify', {
            body: { reference },
          });
          if (error) {
            setErrorMsg(error.message || 'Erreur de vérification');
            setStage('failed');
            window.setTimeout(() => {
              // Pour les orders mobiles, tente deep-link soutrapaiya://
              // pour ré-ouvrir l'app sur /orders. Le filet web reste si
              // l'utilisateur est dans un navigateur classique.
              if (isOrder) {
                window.location.href = `soutrapaiya://paystack${window.location.search}`;
              }
              router.replace(`${targetRoute}?status=failed`);
            }, 1500);
            return;
          }
          const status = (data as any)?.status;
          const outcome = status === 'success' ? 'success' : status === 'pending' ? 'pending' : 'failed';
          setStage(outcome === 'failed' ? 'failed' : 'success');
          window.setTimeout(() => {
            if (isOrder) {
              // Tente d'abord le deep-link mobile (silencieux si pas mobile)
              window.location.href = `soutrapaiya://paystack${window.location.search}`;
            }
            router.replace(`${targetRoute}?status=${outcome}`);
          }, 1200);
        } catch (err) {
          setErrorMsg(err instanceof Error ? err.message : 'Erreur inattendue');
          setStage('failed');
          window.setTimeout(() => router.replace(`${targetRoute}?status=failed`), 1500);
        }
      })();
      return;
    }

    // Sinon : flow mobile classique → deep link.
    setStage('mobile');
    const target = `soutrapaiya://paystack${window.location.search}`;
    setDeepLink(target);
    window.location.href = target;
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
              Ton abonnement est activé. Redirection en cours…
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
              Tu peux retourner dans l&apos;application Soutra-Playce. Si rien ne
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
