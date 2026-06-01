'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabase';
import { phoneSchema, passwordSchema } from '@soutra/shared';
import { DevLoginPanel } from '@/components/DevLoginPanel';
import { IS_DEV } from '@/lib/dev-auth';
import { Button, Input } from '@/components/ui';
import { IconButton } from '@/components/ui/IconButton';

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
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-dark px-4 py-10">
      {/* Background glow */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-[30%] left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-primary-500/20 blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] h-[400px] w-[400px] rounded-full bg-secondary-500/15 blur-[100px]" />
      </div>

      <div className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
        {/* Brand */}
        <Link href="/" className="inline-flex items-center gap-2.5">
          <span
            aria-hidden
            className="flex h-10 w-10 items-center justify-center rounded-xl text-sm font-extrabold text-white shadow-md"
            style={{ background: 'linear-gradient(135deg,#FF6B1A,#E5500D)' }}
          >
            SP
          </span>
          <span className="text-xl font-extrabold tracking-tight">
            <span className="text-dark">Soutra</span>
            <span className="text-primary-500">-Playce</span>
          </span>
        </Link>

        <h1 className="mt-6 text-2xl font-bold text-dark">
          {mode === 'login' ? 'Bon retour 👋' : 'Crée ton compte'}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          {mode === 'login'
            ? 'Connecte-toi avec ton numéro et ton mot de passe.'
            : 'Renseigne tes infos pour démarrer.'}
        </p>

        {/* Form */}
        <form onSubmit={submit} className="mt-6 space-y-3">
          {mode === 'register' && (
            <Input
              type="text"
              autoComplete="name"
              placeholder="Nom complet"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={loading}
              leftIcon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              }
            />
          )}
          <Input
            type="tel"
            autoComplete="tel"
            placeholder="+225XXXXXXXXXX"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={loading}
            inputMode="tel"
            className="font-mono text-lg"
            leftIcon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />
              </svg>
            }
          />
          <Input
            type={showPassword ? 'text' : 'password'}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            placeholder="Mot de passe (8 car. min.)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            leftIcon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            }
            rightAdornment={
              <IconButton
                aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                size="sm"
                variant="ghost"
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </IconButton>
            }
          />

          <Button type="submit" loading={loading} fullWidth size="lg">
            {mode === 'login' ? 'Se connecter' : 'Créer mon compte'}
          </Button>
        </form>

        <button
          type="button"
          onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}
          className="mt-4 block w-full text-center text-sm font-medium text-neutral-500 transition hover:text-dark"
        >
          {mode === 'login'
            ? "Pas encore de compte ? S'inscrire"
            : 'Déjà un compte ? Se connecter'}
        </button>

        {error && (
          <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-danger">
            {error}
          </div>
        )}

        {IS_DEV && <DevLoginPanel />}

        <p className="mt-6 text-center text-xs text-neutral-400">
          En continuant, tu acceptes nos{' '}
          <a href="/cgu" className="underline hover:text-neutral-600">CGU</a> et notre{' '}
          <a href="/privacy" className="underline hover:text-neutral-600">politique de confidentialité</a>.
        </p>
      </div>
    </main>
  );
}
