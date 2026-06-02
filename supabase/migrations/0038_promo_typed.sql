-- ============================================================================
-- SOUTRA-PAIYA — Migration 0038 : promos typées (PR 7/10 Découverte)
-- ============================================================================
-- Ajoute une colonne `kind` sur `promo_codes` pour distinguer les différents
-- types de promotions (réduction standard / happy hour / couple / groupe /
-- week-end / étudiant). Met à jour la RPC `get_active_promotions` (0037)
-- pour exposer ce kind aux clients.
--
-- Strictement non-cassant :
--   • Toutes les promos existantes héritent du kind 'discount' (par défaut)
--   • La signature de promo_codes reste backward-compatible
--   • La RPC get_active_promotions ajoute juste une colonne kind à la fin
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Enum des types de promo
-- ----------------------------------------------------------------------------
do $$ begin
  create type promo_kind as enum (
    'discount',        -- réduction standard (valeur par défaut)
    'happy_hour',      -- happy hour (créneau horaire ponctuel)
    'couple',          -- offre couple (2 personnes)
    'group',           -- offre groupe (≥ N personnes)
    'weekend',         -- offre week-end (vendredi/samedi/dimanche)
    'student'          -- offre étudiante (ID requis)
  );
exception when duplicate_object then null;
end $$;

-- ----------------------------------------------------------------------------
-- 2) Colonne `kind` sur promo_codes
--    DEFAULT 'discount' -> les promos existantes deviennent automatiquement
--    des réductions standard. Aucune migration de données n'est nécessaire.
-- ----------------------------------------------------------------------------
alter table public.promo_codes
  add column if not exists kind promo_kind not null default 'discount';

-- Index partiel utile pour les filtres mobile par kind sur les actives.
create index if not exists idx_promo_codes_kind_active
  on public.promo_codes(kind)
  where active = true;

-- ----------------------------------------------------------------------------
-- 3) Update : get_active_promotions expose désormais `kind`
--    Postgres ne permet pas de modifier les colonnes de retour d'une fonction
--    via CREATE OR REPLACE → on DROP puis on recrée avec la nouvelle signature.
--    Les clients existants qui appellent via nommage (Supabase-js) continuent
--    de fonctionner — le nouveau param `p_kind` a default null.
-- ----------------------------------------------------------------------------
drop function if exists public.get_active_promotions(integer, double precision, double precision, double precision);

create or replace function public.get_active_promotions(
  p_limit     integer default 50,
  p_lat       double precision default null,
  p_lng       double precision default null,
  p_radius_km double precision default 50,
  -- Nouveau paramètre optionnel : filtrer par type. NULL = tous les types.
  p_kind      text default null
)
returns table (
  promo_id          uuid,
  code              text,
  discount_pct      smallint,
  valid_until       timestamptz,
  uses_count        integer,
  max_uses          integer,
  venue_id          uuid,
  venue_name        text,
  venue_slug        text,
  venue_category    text,
  venue_cover       text,
  venue_district    text,
  venue_city        text,
  venue_rating_avg  numeric,
  lat               double precision,
  lng               double precision,
  distance_km       double precision,
  is_open_now       boolean,
  kind              text
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with origin as (
    select case
      when p_lat is not null and p_lng is not null
      then st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
      else null
    end as g
  )
  select
    p.id, p.code, p.discount_pct, p.valid_until, p.uses_count, p.max_uses,
    v.id, v.name, v.slug, v.category::text, v.cover_url, v.district, v.city, v.rating_avg,
    st_y(v.location::geometry)::double precision as lat,
    st_x(v.location::geometry)::double precision as lng,
    case
      when o.g is not null and v.location is not null
      then (st_distance(v.location, o.g) / 1000.0)::double precision
      else null
    end as distance_km,
    public.is_venue_open(v.opening_hours, now()) as is_open_now,
    p.kind::text
  from public.promo_codes p
  join public.venues v on v.id = p.venue_id
  cross join origin o
  where p.active = true
    and v.status = 'active'
    and (p.valid_until is null or p.valid_until > now())
    and (p.max_uses is null or p.uses_count < p.max_uses)
    and (p_kind is null or p_kind = 'all' or p.kind::text = p_kind)
    and (
      o.g is null or v.location is null
      or st_dwithin(v.location, o.g, coalesce(p_radius_km, 50) * 1000)
    )
  order by p.discount_pct desc, p.valid_until asc nulls last
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

grant execute on function public.get_active_promotions(integer, double precision, double precision, double precision, text)
  to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4) Commentaires
-- ----------------------------------------------------------------------------
comment on column public.promo_codes.kind is
  'Type de promo (discount/happy_hour/couple/group/weekend/student). Default discount → rétro-compat avec les promos pré-migration.';
comment on function public.get_active_promotions is
  'Liste les codes promo actifs avec join venue. Filtre rayon + kind optionnels. Inclut kind dans la sortie.';
