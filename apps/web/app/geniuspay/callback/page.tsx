'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

/**
 * Page de retour après un paiement GeniusPay.
 *
 * En PR #2 tous les flows GeniusPay sont initiés depuis le MOBILE (recharge,
 * acompte réservation, order boutique, room_booking hôtel). Le browser in-app
 * ouvert par expo-web-browser n'a pas la session utilisateur du navigateur
 * système — impossible d'invoquer geniuspay-verify depuis ce contexte
 * (retournerait 401).
 *
 * Cette page se contente donc de :
 *   1. Afficher une confirmation visuelle brève
 *   2. Deep-linker vers soutrapaiya://geniuspay
 *   3. Laisser le mobile faire son propre appel à geniuspay-verify depuis
 *      un contexte authentifié (via payWithGeniuspay dans lib/geniuspay.ts).
 *
 * Le webhook GeniusPay reste la source de vérité côté serveur — verify n'est
 * qu'un chemin rapide UX. En cas d'error_url (paiement échoué), on affiche
 * l'état "failed" avant de deep-linker.
 *
 * Note : quand PR #3 basculera l'abonnement (flow web pur) sur GeniusPay,
 * il faudra ré-introduire un appel verify conditionnel sur préfixe sp-sub-.
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
  const [stage, setStage] = useState<'success' | 'failed' | 'mobile'>('success');
  const [deepLink, setDeepLink] = useState('soutrapaiya://geniuspay');

  useEffect(() => {
    const reference = searchParams?.get('reference');
    const forcedFailed = searchParams?.get('status') === 'failed';

    const target = `soutrapaiya://geniuspay${window.location.search}`;
    setDeepLink(target);

    if (!reference) {
      setStage('mobile');
    } else if (forcedFailed) {
      setStage('failed');
    } else {
      setStage('success');
    }

    // Petit délai visuel avant de déclencher le deep link, pour que
    // l'utilisateur voie la confirmation.
    window.setTimeout(() => {
      window.location.href = target;
    }, 800);

    void router; // pas utilisé ici, gardé par symétrie
  }, [searchParams, router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 px-6 text-center dark:bg-neutral-950">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-8 shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
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
