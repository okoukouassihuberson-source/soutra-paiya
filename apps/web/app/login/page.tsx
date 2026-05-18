'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabase';
import { phoneSchema, passwordSchema } from '@soutra/shared';
import { DevLoginPanel } from '@/components/DevLoginPanel';
import { IS_DEV } from '@/lib/dev-auth';

type Mode = 'login' | 'register';

/** Traduit les messages d'erreur Supabase en français lisible. */
function frenchError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Numéro ou mot de passe incorrect.';
  if (m.includes('already registered') || m.includes('already been registered'))
    return 'Ce numéro a déjà un compte — connecte-toi.';
  if (m.includes('password')) return 'Mot de passe invalide (8 caractères minimum).';
  if (m.includes('rate') || m.includes('too many') || m.includes('seconds'))
    return 'Trop de tentatives. Réessaie dans quelques minutes.';
  if (m.includes('phone')) return 'Numéro de téléphone invalide ou non autorisé.';
  return message;
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('login');
  const [phone, setPhone] = useState('+225');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const supabase = supabaseBrowser();

  async function redirectByRole(userId?: string) {
    let destination = '/pro';
    if (userId) {
      const { data: profile } = await (supabase as any)
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();
      if (profile?.role === 'admin') destination = '/admin';
    }
    router.push(destination);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const phoneCheck = phoneSchema.safeParse(phone);
    if (!phoneCheck.success) { setError(phoneCheck.error.issues[0].message); return; }
    const passwordCheck = passwordSchema.safeParse(password);
    if (!passwordCheck.success) { setError(passwordCheck.error.issues[0].message); return; }
    if (mode === 'register' && fullName.trim().length < 2) {
      setError('Indique ton nom complet.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        const { data, error } = await supabase.auth.signInWithPassword({ phone, password });
        if (error) { setError(frenchError(error.message)); return; }
        await redirectByRole(data.user?.id);
      } else {
        const { data, error } = await supabase.auth.signUp({
          phone,
          password,
          options: { data: { full_name: fullName.trim() } },
        });
        if (error) { setError(frenchError(error.message)); return; }
        if (!data.session) {
          setError(
            'Compte créé, mais la confirmation du numéro est activée côté Supabase. ' +
              'Désactive « Confirm phone » dans Authentication → Providers → Phone.',
          );
          return;
        }
        await redirectByRole(data.user?.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inattendue.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-dark px-4">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-[30%] left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-primary-500/15 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <Link href="/" className="font-display text-2xl font-bold">
          <span className="text-dark">Soutra</span>
          <span className="text-primary-500">-Paiya</span>
        </Link>
        <p className="mt-2 text-neutral-500">
          {mode === 'login'
            ? 'Connecte-toi avec ton numéro et ton mot de passe'
            : 'Crée ton compte — numéro et mot de passe'}
        </p>

        <form onSubmit={submit} className="mt-6 space-y-3">
          {mode === 'register' && (
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-xl border border-neutral-200 px-4 py-3 text-base transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              placeholder="Nom complet"
              autoComplete="name"
            />
          )}
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-xl border border-neutral-200 px-4 py-3 font-mono text-lg transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            placeholder="+225XXXXXXXXXX"
            autoComplete="tel"
          />
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-neutral-200 px-4 py-3 pr-16 text-base transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              placeholder="Mot de passe (8 caractères min.)"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-neutral-400 transition hover:text-neutral-600"
            >
              {showPassword ? 'Cacher' : 'Voir'}
            </button>
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-50">
            {loading
              ? 'Veuillez patienter…'
              : mode === 'login'
                ? 'Se connecter'
                : 'Créer mon compte'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}
          className="mt-3 block w-full text-center text-sm text-neutral-500 transition hover:text-neutral-700"
        >
          {mode === 'login'
            ? "Pas encore de compte ? S'inscrire"
            : 'Déjà un compte ? Se connecter'}
        </button>

        {error && (
          <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-danger">{error}</div>
        )}

        {IS_DEV && <DevLoginPanel />}

        <p className="mt-6 text-center text-xs text-neutral-400">
          En continuant, tu acceptes nos{' '}
          <a href="/cgu" className="underline">CGU</a> et notre{' '}
          <a href="/privacy" className="underline">politique de confidentialité</a>.
        </p>
      </div>
    </main>
  );
}
