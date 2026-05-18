'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser, isSupabaseConfigured } from '@/lib/supabase';
import { phoneSchema, otpSchema } from '@soutra/shared';

type Step = 'phone' | 'otp' | 'done';

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('+225');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function sendOtp() {
    setError(null);
    const parsed = phoneSchema.safeParse(phone);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    try {
      // Client créé ici (et non dans le corps du composant) pour ne pas
      // l'instancier au prerender SSR de `next build`.
      const { error: authError } = await supabaseBrowser().auth.signInWithOtp({ phone });
      if (authError) setError(authError.message);
      else setStep('otp');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inattendue.');
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    setError(null);
    const parsed = otpSchema.safeParse(otp);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    try {
      const { error: authError } = await supabaseBrowser().auth.verifyOtp({
        phone,
        token: otp,
        type: 'sms',
      });
      if (authError) {
        setError(authError.message);
      } else {
        setStep('done');
        router.push('/pro');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inattendue.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-500 to-primary-700 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-2xl">
        <h1 className="font-display text-3xl font-bold">
          <span>Soutra</span>
          <span className="text-primary-500">-Paiya</span>
        </h1>
        <p className="mt-2 text-neutral-600">
          {step === 'phone' && 'Connecte-toi avec ton numéro Ivoirien'}
          {step === 'otp' && `Entre le code reçu au ${phone}`}
          {step === 'done' && 'Connecté ✅'}
        </p>

        {!isSupabaseConfigured && (
          <div className="mt-4 rounded-md bg-warning/15 p-3 text-sm text-yellow-800">
            ⚠️ Supabase non configuré. Renseigne <code>NEXT_PUBLIC_SUPABASE_URL</code> et{' '}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> dans <code>apps/web/.env.local</code>.
          </div>
        )}

        {step === 'phone' && (
          <div className="mt-6 space-y-4">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-4 py-3 font-mono text-lg focus:border-primary-500 focus:outline-none"
              placeholder="+225XXXXXXXXXX"
            />
            <button
              onClick={sendOtp}
              disabled={loading}
              className="btn-primary w-full disabled:opacity-50"
            >
              {loading ? 'Envoi…' : 'Recevoir le code'}
            </button>
          </div>
        )}

        {step === 'otp' && (
          <div className="mt-6 space-y-4">
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              className="w-full rounded-md border border-neutral-300 px-4 py-3 text-center font-mono text-2xl tracking-widest focus:border-primary-500 focus:outline-none"
              placeholder="000000"
            />
            <button
              onClick={verifyOtp}
              disabled={loading}
              className="btn-primary w-full disabled:opacity-50"
            >
              {loading ? 'Vérification…' : 'Valider'}
            </button>
            <button
              onClick={() => setStep('phone')}
              className="block w-full text-center text-sm text-neutral-500 hover:underline"
            >
              ← Changer de numéro
            </button>
          </div>
        )}

        {step === 'done' && (
          <div className="mt-6 rounded-md bg-secondary-50 p-4 text-center text-secondary-700">
            🎉 Bienvenue ! Redirection vers ton dashboard…
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-danger">{error}</div>
        )}

        <p className="mt-6 text-center text-xs text-neutral-500">
          En continuant, tu acceptes nos{' '}
          <a href="/cgu" className="underline">
            CGU
          </a>{' '}
          et notre{' '}
          <a href="/privacy" className="underline">
            politique de confidentialité
          </a>
          .
        </p>
      </div>
    </main>
  );
}
