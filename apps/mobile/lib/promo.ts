/**
 * Module Promo — validation des codes promo pour le flux réservation.
 *
 * La consommation effective du code (incrément `uses_count` + insertion
 * dans `promo_redemptions`) est faite côté serveur par un trigger sur
 * `reservations` au passage en `confirmed` (migration 0028). Le client
 * fait juste la validation et stocke `promo_code_id` sur la réservation
 * créée.
 */

import { supabase } from './supabase';
import { tr, type TKey } from './i18n';

export type PromoValidation =
  | { ok: true; promo_id: string; code: string; discount_pct: number }
  | { ok: false; reason: 'CODE_VIDE' | 'CODE_INTROUVABLE' | 'CODE_DESACTIVE' | 'CODE_EXPIRE' | 'CODE_EPUISE' | string };

const REASONS = ['CODE_VIDE', 'CODE_INTROUVABLE', 'CODE_DESACTIVE', 'CODE_EXPIRE', 'CODE_EPUISE'];

/** Message localisé pour un motif de refus de code promo (réservation de table). */
export function reasonLabel(reason: string): string {
  return REASONS.includes(reason) ? tr(`resa.reason.${reason}` as TKey) : tr('resa.reason.unknown', { reason });
}

export async function validatePromoCode(venueId: string, code: string): Promise<PromoValidation> {
  const { data, error } = await (supabase as any).rpc('validate_promo_code', {
    p_venue_id: venueId,
    p_code: code,
  });
  if (error) {
    // Sur erreur réseau / SQL on remonte un faux ok=false avec la raison brute
    // -> l'UI affichera un message lisible via reasonLabel.
    return { ok: false, reason: error.message || 'ERREUR_RESEAU' };
  }
  return data as PromoValidation;
}

/** Calcule un montant après application d'une remise en pourcentage. Arrondi au FCFA. */
export function applyDiscount(amountXof: number, discountPct: number): number {
  const discounted = amountXof * (1 - Math.max(0, Math.min(100, discountPct)) / 100);
  return Math.max(0, Math.round(discounted));
}
