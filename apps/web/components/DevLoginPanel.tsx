'use client';

/**
 * Panneau de connexion DÉVELOPPEMENT — confirmation de numéro sans SMS.
 * Rendu uniquement lorsque `IS_DEV` est vrai : en production, `IS_DEV` est la
 * constante `false`, ce composant retourne `null` et le bundler élimine son
 * contenu du bundle de production.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { IS_DEV, DEV_ACCOUNTS, devSignIn, type DevAccount } from '@/lib/dev-auth';
import { supabaseBrowser } from '@/lib/supabase';

export function DevLoginPanel() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Verrou 1 : inerte hors développement.
  if (!IS_DEV) return null;

  async function loginAs(account: DevAccount) {
    setError(null);
    setBusy(account.phone);
    try {
      const { user } = await devSignIn(account);

      // Redirection selon le rôle réel du profil (comme la connexion normale).
      let destination = '/pro';
      if (user) {
        const { data: profile } = await (supabaseBrowser() as any)
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();
        if (profile?.role === 'admin') destination = '/admin';
      }
      router.push(destination);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-6 rounded-xl border-2 border-dashed border-amber-400 bg-amber-50 p-4">
      <div className="flex items-center gap-2">
        <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-950">
          Dev
        </span>
        <span className="text-sm font-semibold text-amber-900">
          Connexion rapide — sans SMS
        </span>
      </div>
      <p className="mt-1 text-xs text-amber-700">
        Visible uniquement en développement. Nécessite le Supabase local
        (<code>supabase start</code>).
      </p>

      <div className="mt-3 space-y-2">
        {DEV_ACCOUNTS.map((account) => (
          <button
            key={account.phone}
            type="button"
            onClick={() => loginAs(account)}
            disabled={busy !== null}
            className="flex w-full items-center justify-between rounded-lg bg-white px-3 py-2 text-left text-sm ring-1 ring-amber-200 transition hover:ring-amber-400 disabled:opacity-50"
          >
            <span className="font-medium text-dark">{account.label}</span>
            <span className="font-mono text-xs text-neutral-500">
              {busy === account.phone ? 'Connexion…' : account.phone}
            </span>
          </button>
        ))}
      </div>

      {error && (
        <div className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-danger">{error}</div>
      )}
    </div>
  );
}
