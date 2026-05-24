import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { registerForPush, unregisterForPush } from './notifications';

interface AuthCtx {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setSession(data.session);
        setLoading(false);
      })
      .catch((err) => {
        console.error('[auth] getSession error:', err);
        if (mounted) setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (mounted) setSession(newSession);
      // Push notifications : enregistre le token au login, désenregistre au logout.
      // En cas d'échec on log juste -- pas bloquant pour l'app.
      if (event === 'SIGNED_IN' && newSession) {
        registerForPush().then((r) => {
          if (!r.ok) console.warn('[auth] push register skipped:', r.reason);
        });
      } else if (event === 'SIGNED_OUT') {
        unregisterForPush().catch(() => { /* best effort */ });
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('[auth] signOut error:', err);
    }
  };

  return (
    <Ctx.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        signOut,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
