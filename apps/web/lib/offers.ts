import { supabaseServer } from './supabase-server';
import type { I18n } from './i18n/t';

const db = () => supabaseServer() as any;

export interface PublicOffer {
  id: string; kind: string; code: string | null; title: string; description: string | null;
  applies_to?: string; discount_type: 'percent' | 'fixed'; discount_value: number; max_discount_xof: number | null;
  min_participants: number; max_participants: number | null; min_days_before: number | null; max_days_before: number | null;
  valid_until: string | null; i18n?: Record<string, Record<string, string>> | null;
  target_kind?: 'trip' | 'activity' | null; target_slug?: string | null; target_title?: string | null;
  target_cover?: string | null; target_i18n?: Record<string, Record<string, string>> | null;
}

export async function listPublicOffers(limit = 30): Promise<PublicOffer[]> {
  const { data, error } = await db().rpc('list_public_offers', { p_limit: limit });
  if (error) { console.error('[offers] list', error); return []; }
  return (data ?? []) as PublicOffer[];
}

export async function listOffersForTarget(kind: 'trip' | 'activity', target: string): Promise<PublicOffer[]> {
  const { data, error } = await db().rpc('list_offers_for_target', { p_kind: kind, p_target: target });
  if (error) { console.error('[offers] target', error); return []; }
  return (data ?? []) as PublicOffer[];
}

/** « −20 % », « −5 000 FCFA ». */
export function offerValue(o: Pick<PublicOffer, 'discount_type' | 'discount_value'>, i: I18n): string {
  return i.t('offer.off', { value: o.discount_type === 'percent' ? `${o.discount_value} %` : i.fmtXOF(o.discount_value) });
}

/** Conditions lisibles, dans la langue courante. */
export function offerConditions(o: PublicOffer, i: I18n): string[] {
  const c: string[] = [];
  if (o.discount_type === 'percent' && o.max_discount_xof) c.push(i.t('offer.cap', { amount: i.fmtXOF(o.max_discount_xof) }));
  if (o.max_participants && o.max_participants === o.min_participants) c.push(i.t('offer.exactPeople', { n: o.min_participants }));
  else {
    if (o.min_participants > 1) c.push(i.t('offer.minPeople', { n: o.min_participants }));
    if (o.max_participants) c.push(i.t('offer.maxPeople', { n: o.max_participants }));
  }
  if (o.min_days_before) c.push(i.t('offer.bookDaysBefore', { n: o.min_days_before }));
  if (o.max_days_before) c.push(i.t('offer.lastMinute', { n: o.max_days_before }));
  if (o.valid_until) c.push(i.t('offer.until', { date: i.fmtDate(o.valid_until) }));
  c.push(o.code ? i.t('offer.code', { code: o.code }) : i.t('offer.autoApplied'));
  return c;
}
