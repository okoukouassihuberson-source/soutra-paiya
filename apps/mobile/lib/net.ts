import { useEffect, useState } from 'react';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

/** Délai maximal d'une requête réseau (réseaux 3G instables : on préfère échouer proprement qu'attendre sans fin). */
export const REQUEST_TIMEOUT_MS = 20_000;

/**
 * fetch avec délai d'attente. Respecte un signal d'annulation éventuel (démontage d'écran) et le combine
 * avec le délai : la requête s'arrête dans les deux cas.
 */
export const fetchWithTimeout: typeof fetch = async (input, init) => {
  const ctl = new AbortController();
  const outer = init?.signal;
  const onAbort = () => ctl.abort();
  if (outer) { if (outer.aborted) ctl.abort(); else outer.addEventListener('abort', onAbort, { once: true }); }
  const timer = setTimeout(() => ctl.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener('abort', onAbort);
  }
};

export type Connectivity = 'online' | 'weak' | 'offline';

/** 2G, ou connexion « en ligne » sans accès Internet confirmé → connexion faible. */
export function connectivityOf(s: NetInfoState): Connectivity {
  if (s.isConnected === false || s.isInternetReachable === false) return 'offline';
  if (s.type === 'cellular' && (s.details as any)?.cellularGeneration === '2g') return 'weak';
  return 'online';
}

type Listener = () => void;
const reconnectListeners = new Set<Listener>();
/** Appelle `fn` chaque fois que la connexion revient (hors ligne → en ligne). Renvoie la fonction de désabonnement. */
export const onReconnect = (fn: Listener) => { reconnectListeners.add(fn); return () => { reconnectListeners.delete(fn); }; };

let started = false;
let last: Connectivity = 'online';
let listeners = new Set<(c: Connectivity) => void>();
function start() {
  if (started) return; started = true;
  NetInfo.addEventListener((s) => {
    const next = connectivityOf(s);
    if (last === 'offline' && next !== 'offline') reconnectListeners.forEach((f) => { try { f(); } catch { /* un écouteur ne doit jamais casser les autres */ } });
    last = next; listeners.forEach((f) => f(next));
  });
}

/** État de connexion courant (se met à jour tout seul). */
export function useConnectivity(): Connectivity {
  const [c, setC] = useState<Connectivity>(last);
  useEffect(() => { start(); listeners.add(setC); setC(last); return () => { listeners.delete(setC); }; }, []);
  return c;
}
