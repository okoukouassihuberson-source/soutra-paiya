import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from './supabase';
import { registerForPush, unregisterForPush } from './notifications';
import { onReconnect } from './net';

/** checking : restauration de la session en cours · error : impossible de la vérifier (réseau) — l'app reste utilisable. */
export type AuthStatus = 'checking' | 'authenticated' | 'unauthenticated' | 'error';

interface AuthCtx {
  session: Session | null;
  user: User | null;
  status: AuthStatus;
  /** Conservé pour compatibilité : vrai tant que la session est en cours de vérification. */
  loading: boolean;
  signOut: () => Promise<void>;
  /** Relance la vérification de session (bouton « Réessayer », retour du réseau). */
  retry: () => void;
  /** Quitte l'état « error » en continuant sans session (l'écran de connexion s'affiche). */
  continueWithoutSession: () => void;
}

const Ctx = createContext<AuthCtx>({
  session: null, user: null, status: 'checking', loading: true,
  signOut: async () => {}, retry: () => {}, continueWithoutSession: () => {},
});
export const useAuth = () => useContext(Ctx);

const SESSION_TIMEOUT_MS = 8000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>('checking');
  const mounted = useRef(true);
  const attempt = useRef(0);
  const statusRef = useRef<AuthStatus>('checking');
  useEffect(() => { statusRef.current = status; }, [status]);

  const check = useCallback(async () => {
    if (!supabaseConfigured) { setStatus('unauthenticated'); return; }
    const mine = ++attempt.current;
    setStatus('checking');
    try {
      // getSession lit le stockage local mais peut tenter un rafraîchissement réseau : on borne l'attente.
      const { data } = await Promise.race([
        supabase.auth.getSession(),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('session-timeout')), SESSION_TIMEOUT_MS)),
      ]);
      if (!mounted.current || mine !== attempt.current) return;
      setSession(data.session);
      setStatus(data.session ? 'authenticated' : 'unauthenticated');
    } catch (err) {
      if (__DEV__) console.warn('[auth] getSession :', (err as Error)?.message);
      if (mounted.current && mine === attempt.current) setStatus('error');
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    check();
    if (!supabaseConfigured) return () => { mounted.current = false; };

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!mounted.current) return;
      attempt.current++;                                   // un événement d'auth fait foi sur une vérification en cours
      setSession(newSession);
      setStatus(newSession ? 'authenticated' : 'unauthenticated');
      // Notifications push : enregistre le token au login, le retire au logout (jamais bloquant).
      if (event === 'SIGNED_IN' && newSession) {
        registerForPush().then((r) => { if (!r.ok && __DEV__) console.warn('[auth] push ignoré :', r.reason); }).catch(() => {});
      } else if (event === 'SIGNED_OUT') {
        unregisterForPush().catch(() => { /* au mieux */ });
      }
    });

    // Rafraîchissement du jeton uniquement quand l'app est au premier plan (économie de batterie et de données).
    const appState = AppState.addEventListener('change', (s) => {
      if (s === 'active') supabase.auth.startAutoRefresh(); else supabase.auth.stopAutoRefresh();
    });
    const offReconnect = onReconnect(() => { if (statusRef.current === 'error') check(); });

    return () => { mounted.current = false; sub.subscription.unsubscribe(); appState.remove(); offReconnect(); };
  }, [check]);

  const signOut = useCallback(async () => {
    try { await supabase.auth.signOut(); } catch (err) {
      if (__DEV__) console.warn('[auth] signOut :', (err as Error)?.message);
      // Même si le réseau échoue, on retire la session localement : l'utilisateur doit pouvoir se déconnecter.
      try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* noop */ }
      setSession(null); setStatus('unauthenticated');
    }
  }, []);

  const value = useMemo<AuthCtx>(() => ({
    session, user: session?.user ?? null, status, loading: status === 'checking',
    signOut, retry: check, continueWithoutSession: () => setStatus('unauthenticated'),
  }), [session, status, signOut, check]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
