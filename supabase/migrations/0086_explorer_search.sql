-- ============================================================================
-- SOUTRA PLAYCE V2 — Migration 0086 : moteur de recherche avancé « Explorer »
-- ============================================================================
-- Une seule RPC, filtrée / triée / paginée côté serveur (index existants :
-- idx_venues_location GIST, idx_venues_city_status, idx_venues_commune_active).
-- security invoker : la RLS de venues s'applique (lecture des venues actifs).
--
-- Filtres : texte, ville, commune, quartier, catégories, prix, note,
-- services (liste fermée), ouvert maintenant, paiement en ligne, disponibilité
-- hôtelière (dates), distance (rayon autour d'un point GPS).
-- Tri : pertinence (note), prix, nouveautés, distance.
-- « Région » n'existe pas dans le modèle de venues : couverte via ville/commune.
-- ============================================================================

-- Services filtrables → motifs (regex insensibles à la casse/accents usuels).
-- Liste fermée : aucune valeur utilisateur n'est jamais interprétée comme regex.
create or replace function public.explorer_amenity_pattern(p_key text)
returns text
language sql
immutable
as $$
  select case lower(p_key)
    when 'wifi'          then 'wi[- ]?fi'
    when 'parking'       then 'parking'
    when 'climatisation' then 'clim'
    when 'piscine'       then 'piscine|pool'
    when 'restaurant'    then 'restaurant'
    when 'bar'           then '(^|[^a-z])bar([^a-z]|$)'
    when 'vue_mer'       then 'vue.{0,6}(mer|oc[ée]an|lagune)'
    when 'petit_dej'     then 'petit.{0,3}d[ée]j'
    when 'accessible'    then 'accessib|pmr|handicap|fauteuil'
    when 'animaux'       then 'animaux|pets?|chien'
    else null
  end;
$$;

create or replace function public.search_venues_explorer(
  p_q              text default null,
  p_city           text default null,
  p_commune        text default null,
  p_district       text default null,
  p_categories     text[] default null,
  p_min_price      integer default null,
  p_max_price      integer default null,
  p_min_rating     numeric default null,
  p_amenities      text[] default null,
  p_open_now       boolean default false,
  p_online_payment boolean default false,
  p_check_in       date default null,
  p_check_out      date default null,
  p_lat            double precision default null,
  p_lng            double precision default null,
  p_radius_km      double precision default null,
  p_sort           text default 'rating',
  p_limit          integer default 24,
  p_offset         integer default 0
)
returns table (
  id            uuid,
  name          text,
  slug          text,
  category      text,
  cover_url     text,
  district      text,
  commune       text,
  city          text,
  avg_price_xof integer,
  rating_avg    numeric,
  rating_count  integer,
  amenities     text[],
  lat           double precision,
  lng           double precision,
  distance_km   double precision,
  is_open_now   boolean,
  total_count   bigint
)
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
declare
  v_origin geography;
  v_pat    text[];
  v_key    text;
  v_p      text;
  v_q      text := nullif(trim(p_q), '');
  v_limit  integer := greatest(1, least(coalesce(p_limit, 24), 100));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
begin
  if p_lat is not null and p_lng is not null then
    if p_lat not between -90 and 90 or p_lng not between -180 and 180 then
      raise exception 'INVALID_COORDINATES';
    end if;
    v_origin := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;
  end if;
  if p_sort = 'distance' and v_origin is null then
    p_sort := 'rating';
  end if;
  if (p_check_in is null) <> (p_check_out is null)
     or (p_check_in is not null and p_check_out <= p_check_in) then
    raise exception 'INVALID_DATES';
  end if;

  -- Services : clés inconnues ignorées (jamais de regex fournie par le client).
  if p_amenities is not null then
    foreach v_key in array p_amenities loop
      v_p := public.explorer_amenity_pattern(v_key);
      if v_p is not null then v_pat := array_append(v_pat, v_p); end if;
    end loop;
  end if;

  return query
  select s.id, s.name, s.slug, s.category, s.cover_url, s.district, s.commune, s.city,
         s.avg_price_xof, s.rating_avg, s.rating_count, s.amenities, s.lat, s.lng,
         s.distance_km, s.is_open_now, s.total_count
  from (
    select
      v.id, v.name, v.slug, v.category::text, v.cover_url, v.district, v.commune, v.city,
      v.avg_price_xof, v.rating_avg, v.rating_count, v.amenities,
      st_y(v.location::geometry)::double precision as lat,
      st_x(v.location::geometry)::double precision as lng,
      case when v_origin is not null and v.location is not null
           then (st_distance(v.location, v_origin) / 1000.0)::double precision end as distance_km,
      public.is_venue_open(v.opening_hours, now()) as is_open_now,
      count(*) over () as total_count,
      v.created_at
    from public.venues v
    where v.status = 'active'
      and (v_q is null or v.name ilike '%' || replace(replace(v_q, '%', ''), '_', ' ') || '%'
                       or v.district ilike '%' || replace(replace(v_q, '%', ''), '_', ' ') || '%'
                       or v.description ilike '%' || replace(replace(v_q, '%', ''), '_', ' ') || '%')
      and (p_city is null or v.city ilike p_city)
      and (p_commune is null or v.commune ilike p_commune)
      and (p_district is null or v.district ilike p_district)
      and (p_categories is null or cardinality(p_categories) = 0 or v.category::text = any (p_categories))
      and (p_min_price is null or v.avg_price_xof >= p_min_price)
      and (p_max_price is null or v.avg_price_xof <= p_max_price)
      and (p_min_rating is null or (v.rating_count > 0 and v.rating_avg >= p_min_rating))
      and (not coalesce(p_open_now, false) or public.is_venue_open(v.opening_hours, now()) is true)
      and (not coalesce(p_online_payment, false) or cardinality(v.payment_methods) > 0)
      and (v_pat is null or not exists (
            select 1 from unnest(v_pat) pt
             where not exists (select 1 from unnest(v.amenities) a where a ~* pt)))
      and (v_origin is null or p_radius_km is null
           or (v.location is not null and st_dwithin(v.location, v_origin, p_radius_km * 1000)))
      -- Disponibilité : au moins une chambre active libre sur toute la période.
      and (p_check_in is null or exists (
            select 1 from public.rooms r
             where r.venue_id = v.id and r.status = 'active'
               and not exists (
                 select 1 from public.room_bookings b
                  where b.room_id = r.id
                    and b.status in ('pending','confirmed','checked_in')
                    and b.check_in_date < p_check_out and b.check_out_date > p_check_in)))
  ) s
  order by
    case when p_sort = 'distance'   then s.distance_km end asc nulls last,
    case when p_sort = 'price_asc'  then s.avg_price_xof end asc nulls last,
    case when p_sort = 'price_desc' then s.avg_price_xof end desc nulls last,
    case when p_sort = 'new'        then s.created_at end desc,
    s.rating_avg desc nulls last, s.rating_count desc nulls last, s.name asc
  limit v_limit offset v_offset;
end; $$;

revoke execute on function public.search_venues_explorer(text,text,text,text,text[],integer,integer,numeric,text[],boolean,boolean,date,date,double precision,double precision,double precision,text,integer,integer) from public;
grant execute on function public.search_venues_explorer(text,text,text,text,text[],integer,integer,numeric,text[],boolean,boolean,date,date,double precision,double precision,double precision,text,integer,integer) to anon, authenticated;
grant execute on function public.explorer_amenity_pattern(text) to anon, authenticated;

comment on function public.search_venues_explorer is
  'Recherche Explorer : filtres multiples, tri, pagination serveur, distance GPS, disponibilité hôtelière. total_count = total avant pagination.';

-- Performance : recherche texte « contient » sur plusieurs milliers de lieux.
create extension if not exists pg_trgm with schema extensions;
create index if not exists idx_venues_name_trgm
  on public.venues using gin (name extensions.gin_trgm_ops) where status = 'active';
create index if not exists idx_venues_district_trgm
  on public.venues using gin (district extensions.gin_trgm_ops) where status = 'active';
