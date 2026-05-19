'use client';

import { useEffect, useState } from 'react';

// Page de retour après un paiement Paystack. Elle redirige immédiatement vers
// l'application mobile via le deep link soutrapaiya://, ce qui referme le
// navigateur in-app ouvert par expo-web-browser. L'UI ci-dessous n'est qu'un
// filet de sécurité si la redirection automatique n'aboutit pas.
export default function PaystackCallbackPage() {
  const [deepLink, setDeepLink] = useState('soutrapaiya://paystack');

  useEffect(() => {
    const target = `soutrapaiya://paystack${window.location.search}`;
    setDeepLink(target);
    window.location.href = target;
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-light px-6 text-center">
      <div className="w-full max-w-sm rounded-lg bg-white p-8 shadow-lg">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-primary-50 text-3xl">
          ✅
        </div>
        <h1 className="font-display text-xl font-bold text-dark">
          Paiement terminé
        </h1>
        <p className="mt-2 text-sm text-neutral-600">
          Tu peux retourner dans l&apos;application Soutra-Paiya. Si rien ne se
          passe automatiquement, touche le bouton ci-dessous.
        </p>
        <a
          href={deepLink}
          className="mt-6 inline-block w-full rounded-lg bg-primary-500 px-4 py-3 font-semibold text-white"
        >
          Rouvrir l&apos;application
        </a>
      </div>
    </main>
  );
}
