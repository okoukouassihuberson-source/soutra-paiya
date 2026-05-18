'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabase';
import { phoneSchema, otpSchema } from '@soutra/shared';

type Step = 'phone' | 'otp' | 'done';

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('+225');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const supabase = supabaseBrowser();

  async function sendOtp() {
    setError(null);
    const parsed = phoneSchema.safeParse(phone);
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ phone });
    setLoading(false);
    if (error) setError(error.message); else setStep('otp');
  }

  async function verifyOtp() {
    setError(null);
    const parsed = otpSchema.safeParse(otp);
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    setLoading(true);
    const { error, data } = await supabase.auth.verifyOtp({ phone, token: otp, type: 'sms' });
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setStep('done');
      const userId = data.user?.id;
      if (userId) {
        const { data: profile } = await (supabase as any)
          .from('profiles')
          .select('role')
          .eq('id', userId)
          .single();
        if (profile?.role === 'admin') {
          router.push('/admin');
          return;
        }
      }
      router.push('/pro');
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
          {step === 'phone' && 'Connecte-toi avec ton numéro ivoirien'}
          {step === 'otp' && `Entre le code reçu au ${phone}`}
          {step === 'done' && 'Connexion réussie'}
        </p>

        {step === 'phone' && (
          <div className="mt-6 space-y-4">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-xl border border-neutral-200 px-4 py-3 font-mono text-lg transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
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
              className="w-full rounded-xl border border-neutral-200 px-4 py-3 text-center font-mono text-2xl tracking-[0.3em] transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
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
              onClick={() => { setStep('phone'); setOtp(''); setError(null); }}
              className="block w-full text-center text-sm text-neutral-400 transition hover:text-neutral-600"
            >
              ← Changer de numéro
            </button>
          </div>
        )}

        {step === 'done' && (
          <div className="mt-6 space-y-4">
            <div className="rounded-xl bg-secondary-50 p-4 text-center text-secondary-700">
              Connexion réussie — redirection en cours…
            </div>
            <button
              onClick={() => router.push('/pro')}
              className="btn-primary w-full"
            >
              Aller au dashboard
            </button>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-danger">{error}</div>
        )}

        <p className="mt-6 text-center text-xs text-neutral-400">
          En continuant, tu acceptes nos{' '}
          <a href="/cgu" className="underline">CGU</a> et notre{' '}
          <a href="/privacy" className="underline">politique de confidentialité</a>.
        </p>
      </div>
    </main>
  );
}
