// ============================================================================
// Proactive suggestions — wrapper REST de l'Edge function (Phase 7).
//
// Récupère jusqu'à 3 suggestions contextuelles pour l'utilisateur courant.
// Sources serveur : payable balance gérant, promo flash proche, event 24h
// proche, résa à renouveler. Échec silencieux → tableau vide (les
// suggestions sont du nice-to-have, pas du bloquant).
// ============================================================================
import { invokeEdge } from './edge';

export type ProactiveAction =
  | { type: 'navigate'; route: string }
  | { type: 'ask_sia'; prompt: string };

export type ProactiveKind = 'payout' | 'promo' | 'event' | 'renewal';

export interface ProactiveSuggestion {
  id: string;
  kind: ProactiveKind;
  icon: string;
  title: string;
  body: string;
  action: ProactiveAction;
  priority: number;
}

interface FetchOpts {
  lat?: number;
  lng?: number;
}

export async function fetchProactiveSuggestions(
  opts: FetchOpts = {},
): Promise<ProactiveSuggestion[]> {
  try {
    const res = await invokeEdge<{ count: number; suggestions: ProactiveSuggestion[] }>(
      'proactive-suggestions',
      { lat: opts.lat, lng: opts.lng },
    );
    return Array.isArray(res?.suggestions) ? res.suggestions : [];
  } catch (err) {
    // Best-effort : si l'Edge function échoue (pas configurée, réseau, etc.),
    // on retourne vide plutôt que de polluer l'UI avec une erreur.
    console.warn('[proactive] fetch failed:', err);
    return [];
  }
}
