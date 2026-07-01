'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase';

/**
 * Page de retour après un paiement GeniusPay.
 *
 * Deux flows dispatchés via le préfixe de la reference :
 *
 * 1. `sp-sub-…` — souscription abonnement (flow WEB, PR #3).
 *    L'utilisateur EST authentifié dans le navigateur (session Next.js
 *    active sur soutra-playce.com), donc on peut invoquer geniuspay-verify
 *    depuis le client. Après verify → redirect vers /subscribe?status=…
 *    pour que le toast de SubscribeView affiche le résultat.
 *
 * 2. Tout autre préfixe (`sp-`, `sp-ord-`, `sp-bkg-`) — flows MOBILE.
 *    Le browser in-app expo-web-browser ne partage pas les cookies avec le
 *    navigateur système, donc geniuspay-verify retournerait 401. On se
 *    contente donc de deep-linker vers soutrapaiya://geniuspay et le
 *    mobile fait son propre appel à verify depuis un contexte authentifié
 *    (payWithGeniuspay + variants dans orders.tsx / hotel-bookings.tsx).
 *
 * Le webhook GeniusPay reste la source de vérité côté serveur — verify
 * n'est qu'un chemin rapide UX.
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
  >('success');
  const [deepLink, setDeepLink] = useState('soutrapaiya://geniuspay');

  useEffect(() => {
    const reference = searchParams?.get('reference');
    const forcedFailed = searchParams?.get('status') === 'failed';

    // Cas 1 : souscription web (sp-sub-…) → verify + redirect /subscribe.
    if (reference && reference.startsWith('sp-sub-')) {
      setStage('verifying');
      (async () => {
        try {
          if (forcedFailed) {
            router.replace('/subscribe?status=failed');
            return;
          }
          const { data, error } = await (sb.functions as any).invoke(
            'geniuspay-verify',
            { body: { reference } },
          );
          if (error) {
            console.error('[gp-callback] verify sub:', error);
            router.replace('/subscribe?status=failed');
            return;
          }
          const status = (data as { status?: string } | null)?.status;
          const outcome = status === 'success'
            ? 'success'
            : status === 'pending'
              ? 'pending'
              : 'failed';
          router.replace(`/subscribe?status=${outcome}`);
        } catch (err) {
          console.error('[gp-callback] verify sub fatal:', err);
          router.replace('/subscribe?status=failed');
        }
      })();
      return;
    }

    // Cas 2 : flows mobile → deep-link (voir doc en tête de fichier).
    const target = `soutrapaiya://geniuspay${window.location.search}`;
    setDeepLink(target);

    if (!reference) {
      setStage('mobile');
    } else if (forcedFailed) {
      setStage('failed');
    } else {
      setStage('success');
    }

    window.setTimeout(() => {
      window.location.href = target;
    }, 800);
  }, [searchParams, router, sb]);

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
              Activation de ton abonnement en cours.
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
              La transaction n&apos;a pas été validée. Tu peux réessayer.
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
