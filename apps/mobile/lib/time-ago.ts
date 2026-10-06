import { tr, trn, intlLocale } from '@/lib/i18n';

/**
 * Temps relatif localisé (« il y a 5 min » / « 5 min ago »).
 *  - prefix : avec « il y a » / « ago » (sinon forme courte « 5 min »)
 *  - until  : 'hours' → jamais de jours ; 'days' → jours puis date au-delà de 7 j ; 'daysOnly' → jours sans limite
 */
export function timeAgo(iso: string, opts: { prefix?: boolean; until?: 'hours' | 'days' | 'daysOnly' } = {}): string {
  const { prefix = true, until = 'days' } = opts;
  const d = new Date(iso);
  const m = Math.floor(Math.max(0, Date.now() - d.getTime()) / 60000);
  if (m < 1) return tr('ago.now');
  if (m < 60) return tr(prefix ? 'ago.min' : 'ago.minS', { n: m });
  const h = Math.floor(m / 60);
  if (h < 24 || until === 'hours') return tr(prefix ? 'ago.h' : 'ago.hS', { n: h });
  const days = Math.floor(h / 24);
  if (days < 7 || until === 'daysOnly') return tr(prefix ? 'ago.d' : 'ago.dS', { n: days });
  return d.toLocaleDateString(intlLocale(), { day: 'numeric', month: 'short' });
}
