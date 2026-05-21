-- ============================================================================
-- SOUTRA-PAIYA — Migration 0021 : recherche géographique des venues
-- ============================================================================
-- RPC qui combine :
-- - filtre par rayon (ST_DWithin sur la géography)
-- - filtre par catégorie (optionnel)
-- - filtre « ouvert maintenant » (lecture de venues.opening_hours)
-- - tri par distance ascendante
-- - distance retournée en km
--
-- Tout côté serveur -> pas de boucle JS sur tous les venues, scale propre
-- même avec des milliers de lieux grâce à l'index GIST déjà présent sur
-- `venues.location` (`idx_venues_location`).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helper : check si une venue est ouverte à un instant donné, à partir
-- du jsonb `opening_hours` au format {mon: ["12:00","02:00"], ...}.
--
-- Gère le wrap après minuit ("02:00" < "12:00") en bouclant proprement.
-- Heure de référence : Abidjan = UTC+0, on lit donc l'heure UTC directement.
-- ----------------------------------------------------------------------------
create or replace function public.is_venue_open(p_hours jsonb, p_at timestamptz default now())
returns boolean
language plpgsql
immutable
as $$
declare
  v_dow   text;
  v_window jsonb;
  v_open  text;
  v_close text;
  v_now   time;
begin
  if p_hours is null or jsonb_typeof(p_hours) <> 'object' then
    return null; -- pas de données -> on ne sait pas dire
  end if;

  v_dow := lower(to_char(p_at at time zone 'UTC', 'dy'));
  v_window := p_hours -> v_dow;

  if v_window is null
     or jsonb_typeof(v_window) <> 'array'
     or jsonb_array_length(v_window) < 2 then
    return false;
  end if;

  v_open  := v_window ->> 0;
  v_close := v_window ->> 1;
  if v_open is null or v_open = '' or v_close is null or v_close = '' then
    return false;
  end if;

  v_now := (p_at at time zone 'UTC')::time;

  -- Cas standard sans wrap
  if v_open <= v_close then
    return v_now >= v_open::time and v_now < v_close::time;
  end if;

  -- Cas avec wrap après minuit (ex. ouvert 19:00 -> 02:00)
  return v_now >= v_open::time or v_now < v_close::time;
end;
$$;

grant execute on function public.is_venue_open(jsonb, timestamptz) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Recherche géographique principale.
-- Renvoie les venues actifs dans le rayon demandé, triés par distance,
-- avec distance_km et is_open_now calculés côté serveur.
-- ----------------------------------------------------------------------------
create or replace function public.search_venues_nearby(
  p_lat        double precision,
  p_lng        double precision,
  p_radius_km  double precision default 50,
  p_category   text default null,
  p_open_now   boolean default false
)
returns table (
  id            uuid,
  name          text,
  slug          text,
  category      text,
  cover_url     text,
  district      text,
  city          text,
  avg_price_xof int,
  rating_avg    numeric,
  rating_count  int,
  lat           double precision,
  lng           double precision,
  distance_km   double precision,
  is_open_now   boolean
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with origin as (
    select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as g
  )
  select
    v.id,
    v.name,
    v.slug,
    v.category::text,
    v.cover_url,
    v.district,
    v.city,
    v.avg_price_xof,
    v.rating_avg,
    v.rating_count,
    st_y(v.location::geometry)::double precision as lat,
    st_x(v.location::geometry)::double precision as lng,
    (st_distance(v.location, origin.g) / 1000.0)::double precision as distance_km,
    public.is_venue_open(v.opening_hours, now()) as is_open_now
  from public.venues v, origin
  where v.status = 'active'
    and v.location is not null
    and st_dwithin(v.location, origin.g, p_radius_km * 1000)
    and (p_category is null or v.category::text = p_category)
    and (not p_open_now or public.is_venue_open(v.opening_hours, now()) is true)
  order by st_distance(v.location, origin.g) asc;
$$;

grant execute on function public.search_venues_nearby(double precision, double precision, double precision, text, boolean)
  to anon, authenticated;

comment on function public.search_venues_nearby is
  'Recherche les venues actifs autour d''une position GPS. Utilise ST_DWithin '
  '+ index GIST sur location -> scale propre. Tri par distance ascendante.';
