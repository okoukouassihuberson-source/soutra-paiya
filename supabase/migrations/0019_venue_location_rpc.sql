-- ============================================================================
-- SOUTRA-PAIYA — Migration 0019 : RPC pour la géolocalisation des venues
-- ============================================================================
-- La colonne `venues.location` est de type `geography(point, 4326)` (PostGIS,
-- migration 0001). Depuis le navigateur on ne peut pas écrire ce type
-- directement avec supabase-js — il faut passer un WKT et caster. On expose
-- donc une RPC `set_venue_location` qui prend lat/lng + métadonnées
-- (district, ville, adresse), construit le point PostGIS côté serveur,
-- et update la ligne.
--
-- Sécurité : SECURITY INVOKER (respecte la RLS venues_owner_all). Le
-- propriétaire ou un admin peuvent appeler — toute autre tentative passe par
-- la RLS et échoue proprement.
--
-- Garde-fou géographique : la position doit tomber dans une bounding box
-- élargie Côte d'Ivoire (4°-11° N, -9° à -2° W). En cas de coord hors zone,
-- l'appel échoue avec un message clair.
-- ============================================================================

create or replace function public.set_venue_location(
  p_venue_id uuid,
  p_lat      double precision,
  p_lng      double precision,
  p_address  text default null,
  p_district text default null,
  p_city     text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  v_row venues%rowtype;
begin
  -- Validation des bornes : Côte d'Ivoire élargie (avec marge pour les zones
  -- frontalières / lacustres). Hors zone -> on refuse, message clair.
  if p_lat is null or p_lng is null
     or p_lat < 4.0 or p_lat > 11.0
     or p_lng < -9.0 or p_lng > -2.0 then
    raise exception 'OUT_OF_BOUNDS: coordonnées hors Côte d''Ivoire (lat % lng %)', p_lat, p_lng;
  end if;

  -- Update — la RLS venues_owner_all bloque si le caller n'est pas propriétaire
  -- (ou admin via admin_update_venues). Aucune ligne mise à jour -> erreur.
  update public.venues
     set location = st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
         address  = coalesce(nullif(p_address, ''), address),
         district = coalesce(nullif(p_district, ''), district),
         city     = coalesce(nullif(p_city, ''), city),
         updated_at = now()
   where id = p_venue_id
   returning * into v_row;

  if not found then
    raise exception 'NOT_FOUND_OR_FORBIDDEN: venue % introuvable ou non modifiable', p_venue_id;
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'lat', p_lat,
    'lng', p_lng,
    'address', v_row.address,
    'district', v_row.district,
    'city', v_row.city
  );
end;
$$;

grant execute on function public.set_venue_location(uuid, double precision, double precision, text, text, text)
  to authenticated;

-- ----------------------------------------------------------------------------
-- RPC de lecture : récupère lat/lng d'une venue depuis le point PostGIS.
-- (supabase-js sait lire le hex EWKB mais c'est galère côté front — on
-- expose une vue applicative simple.)
-- ----------------------------------------------------------------------------
create or replace function public.get_venue_location(p_venue_id uuid)
returns jsonb
language sql
security invoker
stable
set search_path = public, extensions
as $$
  select case
    when location is null then null
    else jsonb_build_object(
      'lat', st_y(location::geometry),
      'lng', st_x(location::geometry)
    )
  end
  from public.venues
  where id = p_venue_id;
$$;

grant execute on function public.get_venue_location(uuid) to authenticated, anon;
