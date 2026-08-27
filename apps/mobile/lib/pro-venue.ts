// ============================================================================
// Pro Venue — création et gestion d'établissement depuis l'appli mobile.
//
// Miroir du flow web (apps/web/app/pro/page.tsx) :
//   - Création : RPC pro_create_venue (migration 0061) → activation immédiate
//     (status='active' direct, defaults intelligents par businessType). Pas
//     de validation admin préalable — décision produit déjà en place.
//   - Édition : UPDATE direct sur `venues` (policy venues_owner_all, 0001).
//   - Médias : bucket Storage `venue-media`, chemin "<venue_id>/<kind>-<ts>.ext"
//     (même convention que le web — RLS vérifie la propriété du venue via
//     storage.foldername, migrations 0016-0018).
// ============================================================================
import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';
import { listMyProVenues, type ProVenue } from './pro-revenue';

export { listMyProVenues };
export type { ProVenue };

export interface CreateVenueInput {
  name: string;
  category: string;
  address: string;
  city?: string;
  phone?: string;
  whatsapp?: string;
  description?: string;
  district?: string;
  lat?: number;
  lng?: number;
}

export interface CreateVenueResult {
  ok: boolean;
  reason?: string;
  venue_id?: string;
}

/**
 * Crée l'établissement du prestataire connecté. Activation immédiate
 * (status='active') — aucune validation admin préalable.
 *
 * @throws Error avec l'un des codes renvoyés par la RPC : NAME_REQUIRED,
 *   NAME_TOO_LONG, ADDRESS_REQUIRED, INVALID_CATEGORY, NOT_AUTHENTICATED.
 */
export async function createProVenue(input: CreateVenueInput): Promise<CreateVenueResult> {
  const { data, error } = await (supabase.rpc as any)('pro_create_venue', {
    p_name: input.name.trim(),
    p_category: input.category,
    p_address: input.address.trim(),
    p_city: input.city?.trim() || 'Abidjan',
    p_phone: input.phone?.trim() || null,
    p_whatsapp: input.whatsapp?.trim() || null,
    p_description: input.description?.trim() || null,
    p_district: input.district?.trim() || null,
    p_lat: input.lat ?? null,
    p_lng: input.lng ?? null,
  });
  if (error) throw new Error(error.message || 'CREATE_FAILED');
  return data as CreateVenueResult;
}

/** Détail complet d'un venue pour l'écran de gestion (au-delà des colonnes de ProVenue). */
export interface VenueDetail {
  id: string;
  owner_id: string;
  name: string;
  category: string;
  subcategory: string | null;
  description: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  city: string | null;
  district: string | null;
  address: string;
  opening_hours: Record<string, [string, string]> | null;
  logo_url: string | null;
  cover_url: string | null;
  gallery_urls: string[];
  status: string;
}

const VENUE_DETAIL_COLUMNS =
  'id, owner_id, name, category, subcategory, description, phone, whatsapp, email, ' +
  'city, district, address, opening_hours, logo_url, cover_url, gallery_urls, status';

export async function getVenueDetail(venueId: string): Promise<VenueDetail> {
  const { data, error } = await (supabase as any)
    .from('venues')
    .select(VENUE_DETAIL_COLUMNS)
    .eq('id', venueId)
    .single();
  if (error) throw new Error(error.message || 'VENUE_NOT_FOUND');
  return data as VenueDetail;
}

export interface UpdateVenueInput {
  name?: string;
  category?: string;
  subcategory?: string | null;
  description?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  city?: string;
  district?: string | null;
  address?: string;
  opening_hours?: Record<string, [string, string]>;
}

export async function updateProVenue(venueId: string, patch: UpdateVenueInput): Promise<void> {
  const { error } = await (supabase as any).from('venues').update(patch).eq('id', venueId);
  if (error) throw new Error(error.message || 'UPDATE_FAILED');
}

export type VenueMediaKind = 'logo' | 'cover' | 'gallery';

/**
 * Upload une image vers le bucket `venue-media` puis met à jour la colonne
 * correspondante sur `venues` (logo_url / cover_url / append à gallery_urls).
 */
export async function uploadVenueMedia(
  venueId: string,
  kind: VenueMediaKind,
  base64: string,
  currentGallery: string[] = [],
): Promise<string> {
  const path = `${venueId}/${kind}-${Date.now()}.jpg`;
  const { error: upErr } = await supabase.storage
    .from('venue-media')
    .upload(path, decode(base64), { contentType: 'image/jpeg', upsert: false });
  if (upErr) throw new Error(upErr.message || 'UPLOAD_FAILED');

  const url = supabase.storage.from('venue-media').getPublicUrl(path).data.publicUrl;

  const patch =
    kind === 'logo' ? { logo_url: url }
    : kind === 'cover' ? { cover_url: url }
    : { gallery_urls: [...currentGallery, url] };

  const { error: updErr } = await (supabase as any).from('venues').update(patch).eq('id', venueId);
  if (updErr) throw new Error(updErr.message || 'UPDATE_FAILED');

  return url;
}
