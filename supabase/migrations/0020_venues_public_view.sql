-- ============================================================================
-- SOUTRA-PAIYA — Migration 0020 : vue publique des venues avec lat/lng
-- ============================================================================
-- supabase-js ne sait pas lire proprement le hex EWKB du type
-- `geography(point, 4326)` côté front. On expose donc une vue qui projette
-- `location` en deux colonnes `lat` et `lng` (doubles), filtrée aux venues
-- actifs uniquement.
--
-- Cette vue est la SOURCE DE VÉRITÉ pour la carte publique mobile et web :
-- elle remplace les dicts de coordonnées hardcodés côté client (anti-pattern
-- qui ne survit pas à la création d'une venue par un pro autonome).
-- ============================================================================

create or replace view public.venues_public as
  select
    v.id,
    v.owner_id,
    v.name,
    v.slug,
    v.category,
    v.description,
    v.cover_url,
    v.logo_url,
    v.gallery_urls,
    v.address,
    v.city,
    v.district,
    v.phone,
    v.whatsapp,
    v.email,
    v.opening_hours,
    v.avg_price_xof,
    v.amenities,
    v.ambiance,
    v.socials,
    v.rating_avg,
    v.rating_count,
    v.status,
    v.created_at,
    -- PostGIS : geography -> geometry -> coords flottantes.
    -- `st_x` = longitude, `st_y` = latitude (convention OGC).
    st_x(v.location::geometry) as lng,
    st_y(v.location::geometry) as lat
  from public.venues v
  where v.status = 'active';

-- Les vues respectent la RLS de la table sous-jacente : `venues_select_active`
-- autorise déjà la lecture des venues actifs par tous (auth + anon). Pas de
-- politique additionnelle requise sur la vue.

-- Accessible aux clients anon et authentifiés.
grant select on public.venues_public to anon, authenticated;

comment on view public.venues_public is
  'Vue publique des venues actifs avec coordonnées GPS projetées (lat/lng). '
  'Source de vérité pour la carte mobile et web. Filtrée à status = active.';
