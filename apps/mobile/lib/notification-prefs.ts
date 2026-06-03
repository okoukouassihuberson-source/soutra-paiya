// ============================================================================
// Notification preferences (migration 0045) — wrappers RPC.
//
// Les 4 events PRO consultent ces préférences dans send-push avant d'envoyer.
// Les 6 events USER historiques (messages, transferts, matches…) ne sont pas
// filtrés — comportement inchangé pour rétro-compatibilité.
// ============================================================================
import { supabase } from './supabase';

export interface NotificationPreferences {
  user_id: string;
  new_reservation: boolean;
  payment_received: boolean;
  payout_settled: boolean;
  revenue_milestone: boolean;
  updated_at: string;
}

export type NotificationPrefKey =
  | 'new_reservation'
  | 'payment_received'
  | 'payout_settled'
  | 'revenue_milestone';

export const NOTIFICATION_PREF_META: Record<
  NotificationPrefKey,
  { label: string; description: string; emoji: string }
> = {
  new_reservation: {
    label: 'Nouvelles réservations',
    description: 'Reçois une alerte dès qu\'un client réserve dans ton établissement.',
    emoji: '📅',
  },
  payment_received: {
    label: 'Paiements reçus',
    description: 'Sois prévenu quand un client paie via l\'app (acompte, addition).',
    emoji: '💳',
  },
  payout_settled: {
    label: 'Retraits réglés',
    description: 'Confirmation succès / échec de tes virements mobile money.',
    emoji: '💸',
  },
  revenue_milestone: {
    label: 'Jalons de revenus',
    description: '50 k, 250 k, 1 M XOF franchis dans le mois courant.',
    emoji: '🎉',
  },
};

/**
 * Récupère les préférences du caller (auto-créées avec défauts à true si absente).
 */
export async function getMyNotificationPreferences(): Promise<NotificationPreferences> {
  const { data, error } = await (supabase.rpc as any)('get_my_notification_preferences');
  if (error) {
    const raw = error.message ?? '';
    if (raw.includes('NOT_AUTHENTICATED')) throw new Error('NOT_AUTHENTICATED');
    throw new Error(raw || 'GET_PREFS_FAILED');
  }
  return data as NotificationPreferences;
}

/**
 * Patch partiel des préférences. Les clés manquantes restent inchangées.
 */
export async function updateNotificationPreferences(
  patch: Partial<Pick<NotificationPreferences, NotificationPrefKey>>,
): Promise<NotificationPreferences> {
  const { data, error } = await (supabase.rpc as any)('update_notification_preferences', {
    p_prefs: patch,
  });
  if (error) {
    const raw = error.message ?? '';
    if (raw.includes('NOT_AUTHENTICATED')) throw new Error('NOT_AUTHENTICATED');
    if (raw.includes('INVALID_PAYLOAD')) throw new Error('INVALID_PAYLOAD');
    throw new Error(raw || 'UPDATE_PREFS_FAILED');
  }
  return data as NotificationPreferences;
}
