// ============================================================================
// Recherche en langage naturel via Edge Function `search-nl`.
// ============================================================================
import { invokeEdge } from './edge';

export interface NLIntent {
  category: string | null;
  max_price_xof: number | null;
  max_distance_km: number | null;
  open_now: boolean | null;
  commune: string | null;
  ambiance_keywords: string[] | null;
  summary: string;
}

export interface NLVenueResult {
  id: string;
  name: string;
  slug: string;
  category: string;
  cover_url: string | null;
  district: string | null;
  city: string | null;
  avg_price_xof: number | null;
  rating_avg: number | null;
  rating_count: number | null;
  lat: number | null;
  lng: number | null;
  distance_km: number | null;
  is_open_now: boolean | null;
}

export interface NLSearchResponse {
  interpretation: NLIntent;
  results: NLVenueResult[];
  raw_query: string;
  used_lat: number;
  used_lng: number;
  used_radius_km: number;
  model: string;
}

/** Lance une recherche IA. lat/lng optionnels (fallback Abidjan centre côté serveur). */
export async function searchNL(params: {
  query: string;
  lat?: number;
  lng?: number;
}): Promise<NLSearchResponse> {
  return invokeEdge<NLSearchResponse>('search-nl', {
    query: params.query.trim(),
    lat: params.lat,
    lng: params.lng,
  });
}
