// ============================================================================
// Contributions communautaires : nouveaux venues proposés par les users
// (migration 0040). RPCs : submit / list_my.
// ============================================================================
import { supabase } from './supabase';

export type SubmissionStatus =
  | 'pending'
  | 'reviewing'
  | 'approved'
  | 'rejected'
  | 'duplicate';

export const SUBMISSION_STATUS_META: Record<SubmissionStatus, { label: string; color: string; icon: string }> = {
  pending:   { label: 'En attente', color: '#F59E0B', icon: '⏳' },
  reviewing: { label: 'En examen',  color: '#3B82F6', icon: '🔎' },
  approved:  { label: 'Approuvée',  color: '#10B981', icon: '✅' },
  rejected:  { label: 'Refusée',    color: '#EF4444', icon: '❌' },
  duplicate: { label: 'Doublon',    color: '#A855F7', icon: '👯' },
};

export interface SubmitVenueParams {
  name: string;
  category: string;
  address: string;
  subcategory?: string;
  description?: string;
  city?: string;
  district?: string;
  commune?: string;
  lat?: number;
  lng?: number;
  phone?: string;
  whatsapp?: string;
  email?: string;
  website?: string;
  coverUrl?: string;
  galleryUrls?: string[];
}

export interface SubmitVenueResult {
  ok: boolean;
  submissionId: string | null;
  reason: 'ALREADY_SUBMITTED' | null;
}

/**
 * Soumet un nouveau lieu à la modération admin.
 *
 * @throws Error('NOT_AUTHENTICATED' | 'NAME_REQUIRED' | 'ADDRESS_REQUIRED' | 'INVALID_CATEGORY')
 */
export async function submitVenueSubmission(params: SubmitVenueParams): Promise<SubmitVenueResult> {
  const { data, error } = await (supabase.rpc as any)('submit_venue_submission', {
    p_name: params.name,
    p_category: params.category,
    p_address: params.address,
    p_subcategory: params.subcategory ?? null,
    p_description: params.description ?? null,
    p_city: params.city ?? 'Abidjan',
    p_district: params.district ?? null,
    p_commune: params.commune ?? null,
    p_lat: params.lat ?? null,
    p_lng: params.lng ?? null,
    p_phone: params.phone ?? null,
    p_whatsapp: params.whatsapp ?? null,
    p_email: params.email ?? null,
    p_website: params.website ?? null,
    p_cover_url: params.coverUrl ?? null,
    p_gallery_urls: params.galleryUrls ?? [],
  });
  if (error) {
    const raw = error.message ?? '';
    if (raw.includes('NOT_AUTHENTICATED')) throw new Error('NOT_AUTHENTICATED');
    if (raw.includes('NAME_REQUIRED')) throw new Error('NAME_REQUIRED');
    if (raw.includes('ADDRESS_REQUIRED')) throw new Error('ADDRESS_REQUIRED');
    if (raw.includes('INVALID_CATEGORY')) throw new Error('INVALID_CATEGORY');
    throw new Error(raw || 'SUBMIT_FAILED');
  }
  const payload = data as { ok?: boolean; submission_id?: string; reason?: SubmitVenueResult['reason'] };
  return {
    ok: !!payload?.ok,
    submissionId: payload?.submission_id ?? null,
    reason: payload?.reason ?? null,
  };
}

export interface MySubmission {
  id: string;
  name: string;
  category: string;
  address: string;
  status: SubmissionStatus;
  created_venue_id: string | null;
  decision_note: string | null;
  created_at: string;
  decided_at: string | null;
}

export async function listMyVenueSubmissions(limit: number = 50): Promise<MySubmission[]> {
  const { data, error } = await (supabase.rpc as any)('list_my_venue_submissions', {
    p_limit: limit,
  });
  if (error) throw new Error(error.message ?? 'LIST_FAILED');
  return (data ?? []) as MySubmission[];
}
