// ============================================================================
// Niveaux du programme de fidélité Soutra-Playce.
//
// Source unique pour mobile + web — miroir du seed de la migration
// supabase/migrations/0068_loyalty_engine.sql (table loyalty_levels).
// 100 FCFA dépensés = 1 point. Le niveau est calculé sur le cumul lifetime
// (qui ne baisse jamais), pas sur le solde dépensable.
// ============================================================================

export type LoyaltyLevel = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';

export interface LoyaltyLevelMeta {
  code: LoyaltyLevel;
  label: string;
  minPoints: number;
  color: string;
  emoji: string;
}

export const LOYALTY_LEVELS: LoyaltyLevelMeta[] = [
  { code: 'bronze',   label: 'Bronze',  minPoints: 0,     color: '#B87333', emoji: '🥉' },
  { code: 'silver',   label: 'Argent',  minPoints: 1000,  color: '#9CA3AF', emoji: '🥈' },
  { code: 'gold',     label: 'Or',      minPoints: 5000,  color: '#D4AF37', emoji: '🥇' },
  { code: 'platinum', label: 'Platine', minPoints: 20000, color: '#6E8898', emoji: '💎' },
  { code: 'diamond',  label: 'Diamant', minPoints: 60000, color: '#5BCFFA', emoji: '✨' },
];

export const LOYALTY_LEVEL_BY_CODE: Record<LoyaltyLevel, LoyaltyLevelMeta> = LOYALTY_LEVELS.reduce(
  (acc, lvl) => {
    acc[lvl.code] = lvl;
    return acc;
  },
  {} as Record<LoyaltyLevel, LoyaltyLevelMeta>,
);

/** Niveau atteint pour un cumul de points lifetime donné (fallback client, en attendant le round-trip serveur). */
export function loyaltyLevelForPoints(pointsLifetime: number): LoyaltyLevelMeta {
  let current = LOYALTY_LEVELS[0];
  for (const lvl of LOYALTY_LEVELS) {
    if (pointsLifetime >= lvl.minPoints) current = lvl;
  }
  return current;
}

/** Prochain niveau à débloquer (null si niveau maximum déjà atteint). */
export function loyaltyNextLevel(pointsLifetime: number): LoyaltyLevelMeta | null {
  return LOYALTY_LEVELS.find((lvl) => lvl.minPoints > pointsLifetime) ?? null;
}
