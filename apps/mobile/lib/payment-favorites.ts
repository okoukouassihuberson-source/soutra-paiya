// ============================================================================
// Favoris de paiement (bénéficiaires de transfert récurrents).
// ============================================================================
import { supabase } from './supabase';

export interface PaymentFavorite {
  favorite_user_id: string;
  label: string | null;        // alias custom
  display_name: string;        // label > full_name > phone
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  position: number | null;
  created_at: string;
}

interface RawFav {
  favorite_user_id: string;
  label: string | null;
  position: number | null;
  created_at: string;
}

interface RawProfile {
  id: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
}

// On scinde en 2 requêtes : `payment_favorites` a deux FK vers `profiles`
// (user_id + favorite_user_id), donc la jointure embed PostgREST est ambiguë
// sans nom de contrainte explicite. Deux SELECTs simples sont plus robustes
// et restent peu coûteux (RLS + tri côté serveur sur le 1er).
export async function listPaymentFavorites(): Promise<PaymentFavorite[]> {
  const { data: favs, error: favErr } = await (supabase as any)
    .from('payment_favorites')
    .select('favorite_user_id, label, position, created_at')
    .order('position', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });
  if (favErr) throw new Error(favErr.message);
  const rows = (favs as RawFav[]) ?? [];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.favorite_user_id);
  const { data: profs, error: profErr } = await (supabase as any)
    .from('profiles')
    .select('id, full_name, phone, avatar_url')
    .in('id', ids);
  if (profErr) throw new Error(profErr.message);
  const byId = new Map<string, RawProfile>(
    ((profs as RawProfile[]) ?? []).map((p) => [p.id, p]),
  );

  return rows.map((r) => {
    const p = byId.get(r.favorite_user_id);
    return {
      favorite_user_id: r.favorite_user_id,
      label: r.label,
      full_name: p?.full_name ?? null,
      phone: p?.phone ?? null,
      avatar_url: p?.avatar_url ?? null,
      position: r.position,
      created_at: r.created_at,
      display_name: r.label || p?.full_name || p?.phone || 'Bénéficiaire',
    };
  });
}

export async function addPaymentFavoriteByPhone(phone: string, label?: string): Promise<void> {
  const { error } = await (supabase.rpc as any)('add_payment_favorite', {
    p_phone: phone,
    p_label: label ?? null,
  });
  if (error) {
    const raw = error.message ?? '';
    if (raw.includes('RECIPIENT_NOT_FOUND')) throw new Error('RECIPIENT_NOT_FOUND');
    if (raw.includes('SELF_FAVORITE')) throw new Error('SELF_FAVORITE');
    if (raw.includes('INVALID_PHONE')) throw new Error('INVALID_PHONE');
    throw new Error(raw || 'ADD_FAVORITE_FAILED');
  }
}

/** Ajout direct par uuid (utilisé depuis l'écran transaction-detail). */
export async function addPaymentFavoriteById(
  favoriteUserId: string,
  label?: string | null,
): Promise<void> {
  const { error } = await (supabase as any)
    .from('payment_favorites')
    .upsert(
      { favorite_user_id: favoriteUserId, label: label ?? null },
      { onConflict: 'user_id,favorite_user_id' },
    );
  if (error) throw new Error(error.message);
}

export async function removePaymentFavorite(favoriteUserId: string): Promise<void> {
  const { error } = await (supabase as any)
    .from('payment_favorites')
    .delete()
    .eq('favorite_user_id', favoriteUserId);
  if (error) throw new Error(error.message);
}

export async function renamePaymentFavorite(favoriteUserId: string, label: string): Promise<void> {
  const { error } = await (supabase.rpc as any)('rename_payment_favorite', {
    p_favorite_user_id: favoriteUserId,
    p_label: label,
  });
  if (error) throw new Error(error.message);
}

export async function isPaymentFavorite(favoriteUserId: string): Promise<boolean> {
  const { data, error } = await (supabase as any)
    .from('payment_favorites')
    .select('favorite_user_id')
    .eq('favorite_user_id', favoriteUserId)
    .maybeSingle();
  if (error) return false;
  return !!data;
}
