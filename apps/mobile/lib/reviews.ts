// ============================================================================
// Système d'avis (migration 0076) — soumission, édition, suppression, tri,
// vote "utile", signalement.
// ============================================================================
import { supabase } from './supabase';

export type ReviewSourceType = 'reservation' | 'room_booking' | 'order';
export type ReviewSort = 'recent' | 'helpful' | 'rating_high' | 'rating_low';

export interface ReviewableVisit {
  sourceType: ReviewSourceType;
  sourceId: string;
  label: string;
  occurredAt: string | null;
}

export interface Review {
  id: string;
  userId: string;
  fullName: string | null;
  avatarUrl: string | null;
  rating: number;
  body: string | null;
  photos: string[];
  createdAt: string;
  helpfulCount: number;
  iVotedHelpful: boolean;
  isMine: boolean;
}

export interface ReviewStats {
  ratingAvg: number;
  ratingCount: number;
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
}

function normalizeError(error: { message?: string } | null, fallback: string): never {
  const raw = error?.message ?? '';
  if (raw.includes('23505')) throw new Error('ALREADY_REVIEWED');
  const knownCodes = [
    'NOT_AUTHENTICATED', 'INVALID_RATING', 'TOO_MANY_PHOTOS',
    'EXACTLY_ONE_SOURCE_REQUIRED', 'INELIGIBLE_RESERVATION',
    'INELIGIBLE_BOOKING', 'INELIGIBLE_ORDER', 'NOT_FOUND_OR_FORBIDDEN',
    'REVIEW_REQUIRED', 'INVALID_KIND',
  ];
  for (const code of knownCodes) {
    if (raw.includes(code)) throw new Error(code);
  }
  throw new Error(raw || fallback);
}

export async function listMyReviewableVisits(venueId: string): Promise<ReviewableVisit[]> {
  const { data, error } = await (supabase.rpc as any)('list_my_reviewable_visits', {
    p_venue_id: venueId,
  });
  if (error) normalizeError(error, 'VISITS_FAILED');
  return ((data ?? []) as any[]).map((r) => ({
    sourceType: r.source_type,
    sourceId: r.source_id,
    label: r.label,
    occurredAt: r.occurred_at,
  }));
}

export async function submitReview(params: {
  venueId: string;
  rating: number;
  body?: string;
  photos?: string[];
  sourceType: ReviewSourceType;
  sourceId: string;
}): Promise<string> {
  const { data, error } = await (supabase.rpc as any)('submit_review', {
    p_venue_id: params.venueId,
    p_rating: params.rating,
    p_body: params.body ?? null,
    p_photos: params.photos ?? [],
    p_reservation_id: params.sourceType === 'reservation' ? params.sourceId : null,
    p_room_booking_id: params.sourceType === 'room_booking' ? params.sourceId : null,
    p_order_id: params.sourceType === 'order' ? params.sourceId : null,
  });
  if (error) normalizeError(error, 'SUBMIT_FAILED');
  return data as string;
}

export async function updateReview(reviewId: string, params: {
  rating: number;
  body?: string;
  photos?: string[];
}): Promise<void> {
  const { error } = await (supabase.rpc as any)('update_review', {
    p_review_id: reviewId,
    p_rating: params.rating,
    p_body: params.body ?? null,
    p_photos: params.photos ?? [],
  });
  if (error) normalizeError(error, 'UPDATE_FAILED');
}

export async function deleteReview(reviewId: string): Promise<void> {
  const { error } = await (supabase.rpc as any)('delete_review', { p_review_id: reviewId });
  if (error) normalizeError(error, 'DELETE_FAILED');
}

export async function getVenueReviewStats(venueId: string): Promise<ReviewStats> {
  const { data, error } = await (supabase.rpc as any)('get_venue_review_stats', {
    p_venue_id: venueId,
  });
  if (error) normalizeError(error, 'STATS_FAILED');
  const raw = (data ?? {}) as { rating_avg?: number; rating_count?: number; distribution?: Record<string, number> };
  const dist = raw.distribution ?? {};
  return {
    ratingAvg: raw.rating_avg ?? 0,
    ratingCount: raw.rating_count ?? 0,
    distribution: {
      '1': dist['1'] ?? 0,
      '2': dist['2'] ?? 0,
      '3': dist['3'] ?? 0,
      '4': dist['4'] ?? 0,
      '5': dist['5'] ?? 0,
    },
  };
}

export async function listVenueReviews(
  venueId: string,
  sort: ReviewSort = 'recent',
  limit = 20,
  offset = 0,
): Promise<Review[]> {
  const { data, error } = await (supabase.rpc as any)('list_venue_reviews', {
    p_venue_id: venueId,
    p_sort: sort,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) normalizeError(error, 'LIST_FAILED');
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    userId: r.user_id,
    fullName: r.full_name,
    avatarUrl: r.avatar_url,
    rating: r.rating,
    body: r.body,
    photos: r.photos ?? [],
    createdAt: r.created_at,
    helpfulCount: Number(r.helpful_count ?? 0),
    iVotedHelpful: !!r.i_voted_helpful,
    isMine: !!r.is_mine,
  }));
}

export async function toggleReviewHelpful(reviewId: string): Promise<{ voted: boolean; count: number }> {
  const { data, error } = await (supabase.rpc as any)('toggle_review_helpful', {
    p_review_id: reviewId,
  });
  if (error) normalizeError(error, 'TOGGLE_FAILED');
  const payload = data as { voted: boolean; count: number };
  return { voted: !!payload?.voted, count: Number(payload?.count ?? 0) };
}

export type ReviewReportKind = 'spam' | 'offensive' | 'fake' | 'irrelevant' | 'other';

export const REVIEW_REPORT_KIND_LABELS: Record<ReviewReportKind, { label: string; icon: string; description: string }> = {
  spam:        { label: 'Spam',                  icon: '🚫', description: "Publicité ou contenu non pertinent." },
  offensive:   { label: 'Contenu offensant',     icon: '⚠️', description: 'Langage insultant ou déplacé.' },
  fake:        { label: 'Faux avis',             icon: '🎭', description: "Cet avis ne semble pas authentique." },
  irrelevant:  { label: 'Hors sujet',            icon: '📝', description: "Ne concerne pas cet établissement." },
  other:       { label: 'Autre',                 icon: '📌', description: 'Autre raison — précise dans le champ détail.' },
};

export interface SubmitReportResult {
  ok: boolean;
  report_id: string | null;
  reason: 'ALREADY_REPORTED' | null;
}

export async function submitReviewReport(params: {
  reviewId: string;
  kind: ReviewReportKind;
  details?: string;
}): Promise<SubmitReportResult> {
  const { data, error } = await (supabase.rpc as any)('submit_review_report', {
    p_review_id: params.reviewId,
    p_kind: params.kind,
    p_details: params.details ?? null,
  });
  if (error) normalizeError(error, 'REPORT_FAILED');
  const payload = data as { ok: boolean; report_id?: string; reason?: SubmitReportResult['reason'] };
  return {
    ok: !!payload?.ok,
    report_id: payload?.report_id ?? null,
    reason: payload?.reason ?? null,
  };
}
