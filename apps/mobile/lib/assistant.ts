/**
 * Module Assistant — accès à la fonction Edge `chatbot` (Claude + tool use).
 *
 * Phase 2 : le Edge function orchestre les tools côté serveur et peut renvoyer
 * des `actions` à exécuter côté client (navigate, etc.). On expose une fonction
 * `runAction` pour que les écrans puissent les appliquer uniformément.
 */

import { invokeEdge } from './edge';
import type { Router } from 'expo-router';

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

/** Action retournée par le serveur, exécutée côté client. */
export type AssistantAction =
  | { type: 'navigate'; route: string; reason?: string }
  | {
      type: 'authenticate_and_pay';
      reservation_id: string;
      amount_xof: number;
      venue_name?: string;
      reason?: string;
    };

/** Résultat du paiement vocal — speak côté client après réception. */
export interface PayReservationResult {
  ok: true;
  reservation_id: string;
  transaction_id: string;
  amount_paid_xof: number;
  new_balance_xof: number;
}

/**
 * Règle l'acompte d'une résa depuis le wallet. Appelée par le mobile après
 * que l'utilisateur ait validé sa biométrie/PIN. La RPC pay_reservation_from_wallet
 * (migration 0046) valide tout côté serveur (PIN bcrypt, ownership, solde, statut).
 */
export async function payReservationFromWallet(
  reservationId: string,
  pin: string,
): Promise<PayReservationResult> {
  return invokeEdge<PayReservationResult>('pay-reservation', {
    reservation_id: reservationId,
    pin,
  });
}

/**
 * Langue détectée par le serveur sur la réponse de Sia.
 * - 'fr' / 'nouchi' → TTS fr-FR (le nouchi est compris comme du français)
 * - 'en' → TTS en-US
 */
export type DetectedLanguage = 'fr' | 'en' | 'nouchi';

export type AssistantReply = {
  reply: string;
  actions?: AssistantAction[];
  detected_language?: DetectedLanguage;
  iterations?: number;
  usage?: { input_tokens: number; output_tokens: number } | null;
  model?: string;
};

/** Map la langue détectée vers une locale BCP-47 utilisable par expo-speech. */
export function localeForLanguage(lang?: DetectedLanguage): 'fr-FR' | 'en-US' {
  return lang === 'en' ? 'en-US' : 'fr-FR';
}

export interface AskAssistantOptions {
  /** Position utilisateur en lat/lng (passée au chatbot pour search_venues). */
  lat?: number;
  lng?: number;
}

/**
 * Appelle l'assistant. Si `opts.lat`/`opts.lng` sont fournis, l'agent peut
 * faire des recherches géographiques précises ; sinon il tombe sur le centre
 * d'Abidjan côté serveur.
 */
export async function askAssistant(
  messages: ChatMessage[],
  opts: AskAssistantOptions = {},
): Promise<AssistantReply> {
  return invokeEdge<AssistantReply>('chatbot', {
    messages,
    lat: opts.lat,
    lng: opts.lng,
  });
}

/**
 * Exécute une action côté client. Pour l'instant : navigate. Les futures
 * phases pourront ajouter d'autres types (show_modal, scroll_to, etc.).
 *
 * Retourne true si l'action a été exécutée, false sinon (route invalide,
 * type inconnu, etc.).
 */
export function runAction(action: AssistantAction, router: Router): boolean {
  try {
    if (action.type === 'navigate') {
      const route = action.route;
      if (!route || !route.startsWith('/')) return false;
      // expo-router accepte des string paths ; on cast en `any` car les types
      // typés générés par expo-router ne couvrent pas les routes dynamiques.
      router.push(route as any);
      return true;
    }
    return false;
  } catch (err) {
    console.warn('[assistant] runAction failed:', err);
    return false;
  }
}
