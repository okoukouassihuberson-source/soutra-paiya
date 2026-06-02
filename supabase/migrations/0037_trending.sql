-- ============================================================================
-- SOUTRA-PAIYA — Migration 0037 : module « Ça bouge maintenant »
-- ============================================================================
-- 3 RPCs publiques (anon + auth) qui alimentent l'écran trending mobile :
--
--   get_trending_venues(limit, lat?, lng?, radius_km?)
--   get_active_promotions(limit, lat?, lng?, radius_km?)
--   get_current_events(limit)
--
-- Calcule un `trend_score` = activité 24h normalisée par activité 30j,
-- avec un boost si le lieu est ouvert maintenant. Combine également les
-- promos actives et événements en cours pour signaler les venues
-- « animés en ce moment ».
--
-- Données sources (déjà en place) :
--   • venue_events_log (migration 0035)
--   • venues.popularity_score (migration 0036)
--   • venues.is_venue_open(opening_hours, now) (migration 0021)
--   • promo_codes (migration 0015)
--   • events (migration 0001)
--
-- Non-cassant : 0 modification de table existante.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) RPC : get_trending_venues
--    Tendance = activité dernières 24h normalisée + boost ouvert + popularity.
--
--    Formule trend_score (0-100) :
--      a24 = vues + clics + 5 * réservations sur 24h
--      a30 = vues + clics + 5 * réservations sur 30j (moyenne quotidienne)
--      lift = a24 / max(a30 / 30, 1)          -- ratio vs moyenne quotidienne
--      raw  = 25 * log10(1 + a24) + 15 * least(lift, 5)
--      bonus_open = +10 si is_open_now
--      trend = clamp(raw + bonus_open + 0.3 * popularity_score, 0, 100)
--
--    Joint en sus :
--      active_promo_count : codes promos actifs (non expirés, non épuisés)
--      happening_event_count : events status='published' en cours
-- ----------------------------------------------------------------------------

create or replace function public.get_trending_venues(
  p_limit     integer default 20,
  p_lat       double precision default null,
  p_lng       double precision default null,
  p_radius_km double precision default 50
)
returns table (
  id                    uuid,
  name                  text,
  slug                  text,
  category              text,
  cover_url             text,
  district              text,
  city                  text,
  avg_price_xof         integer,
  rating_avg            numeric,
  rating_count          integer,
  lat                   double precision,
  lng                   double precision,
  distance_km           double precision,
  is_open_now           boolean,
  popularity_score      smallint,
  trend_score           integer,
  activity_24h          integer,
  activity_30d          integer,
  active_promo_count    integer,
  happening_event_count integer
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
  ),
  -- Activité dernières 24h par venue
  a24 as (
    select venue_id,
           (count(*) filter (where kind = 'view') +
            count(*) filter (where kind in (
              'click_call','click_whatsapp','click_directions','click_website','click_share','menu_view','gallery_open'
            )) +
            5 * count(*) filter (where kind = 'reservation_complete'))::integer as score,
           (count(*) filter (where kind = 'view') +
            count(*) filter (where kind in (
              'click_call','click_whatsapp','click_directions','click_website','click_share','menu_view','gallery_open'
            )))::integer as views_clicks
      from public.venue_events_log
     where created_at >= now() - interval '24 hours'
     group by venue_id
  ),
  -- Activité 30j par venue (pour normaliser la tendance)
  a30 as (
    select venue_id,
           (count(*) filter (where kind = 'view') +
            count(*) filter (where kind in (
              'click_call','click_whatsapp','click_directions','click_website','click_share','menu_view','gallery_open'
            )) +
            5 * count(*) filter (where kind = 'reservation_complete'))::integer as score
      from public.venue_events_log
     where created_at >= now() - interval '30 days'
     group by venue_id
  ),
  -- Promos actives par venue
  promos as (
    select venue_id, count(*)::integer as n
      from public.promo_codes
     where active = true
       and (valid_until is null or valid_until > now())
       and (max_uses is null or uses_count < max_uses)
     group by venue_id
  ),
  -- Événements en cours par venue
  evts as (
    select venue_id, count(*)::integer as n
      from public.events
     where status = 'published'
       and starts_at <= now()
       and ends_at >= now()
       and venue_id is not null
     group by venue_id
  )
  select
    v.id, v.name, v.slug, v.category::text, v.cover_url, v.district, v.city,
    v.avg_price_xof, v.rating_avg, v.rating_count,
    st_y(v.location::geometry)::double precision as lat,
    st_x(v.location::geometry)::double precision as lng,
    case
      when o.g is not null and v.location is not null
      then (st_distance(v.location, o.g) / 1000.0)::double precision
      else null
    end as distance_km,
    public.is_venue_open(v.opening_hours, now()) as is_open_now,
    v.popularity_score,
    -- Calcul du trend score
    greatest(0, least(100, (
      25.0 * ln(1 + coalesce(a24.score, 0)) / ln(10) +
      15.0 * least(
        coalesce(a24.score, 0)::numeric / greatest(coalesce(a30.score, 0) / 30.0, 1.0),
        5.0
      ) +
      case when public.is_venue_open(v.opening_hours, now()) is true then 10 else 0 end +
      0.3 * v.popularity_score
    )))::integer as trend_score,
    coalesce(a24.score, 0)    as activity_24h,
    coalesce(a30.score, 0)    as activity_30d,
    coalesce(promos.n, 0)     as active_promo_count,
    coalesce(evts.n, 0)       as happening_event_count
  from public.venues v
  cross join origin o
  left join a24    on a24.venue_id    = v.id
  left join a30    on a30.venue_id    = v.id
  left join promos on promos.venue_id = v.id
  left join evts   on evts.venue_id   = v.id
  where v.status = 'active'
    and (
      -- Filtre rayon optionnel
      o.g is null or v.location is null
      or st_dwithin(v.location, o.g, coalesce(p_radius_km, 50) * 1000)
    )
  order by trend_score desc, v.popularity_score desc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

grant execute on function public.get_trending_venues(integer, double precision, double precision, double precision)
  to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2) RPC : get_active_promotions
--    Liste les codes promo actifs (non expirés, non épuisés) joints au venue,
--    avec filtre optionnel par rayon.
-- ----------------------------------------------------------------------------

create or replace function public.get_active_promotions(
  p_limit     integer default 50,
  p_lat       double precision default null,
  p_lng       double precision default null,
  p_radius_km double precision default 50
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
  is_open_now       boolean
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
    public.is_venue_open(v.opening_hours, now()) as is_open_now
  from public.promo_codes p
  join public.venues v on v.id = p.venue_id
  cross join origin o
  where p.active = true
    and v.status = 'active'
    and (p.valid_until is null or p.valid_until > now())
    and (p.max_uses is null or p.uses_count < p.max_uses)
    and (
      o.g is null or v.location is null
      or st_dwithin(v.location, o.g, coalesce(p_radius_km, 50) * 1000)
    )
  order by p.discount_pct desc, p.valid_until asc nulls last
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

grant execute on function public.get_active_promotions(integer, double precision, double precision, double precision)
  to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3) RPC : get_current_events
--    Événements en cours (status='published' ET now BETWEEN starts_at AND ends_at)
--    + événements qui démarrent dans les 24h (preview).
-- ----------------------------------------------------------------------------

create or replace function public.get_current_events(
  p_limit       integer default 50,
  p_include_upcoming_hours integer default 24
)
returns table (
  event_id        uuid,
  title           text,
  slug            text,
  description     text,
  cover_url       text,
  starts_at       timestamptz,
  ends_at         timestamptz,
  status          text,
  is_happening    boolean,
  is_upcoming     boolean,
  city            text,
  venue_id        uuid,
  venue_name      text,
  venue_slug      text,
  venue_category  text,
  venue_cover     text,
  venue_district  text
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    e.id, e.title, e.slug, e.description, e.cover_url,
    e.starts_at, e.ends_at, e.status::text,
    (e.starts_at <= now() and e.ends_at >= now()) as is_happening,
    (e.starts_at > now()) as is_upcoming,
    e.city,
    v.id, v.name, v.slug, v.category::text, v.cover_url, v.district
  from public.events e
  left join public.venues v on v.id = e.venue_id
  where e.status = 'published'
    and (
      (e.starts_at <= now() and e.ends_at >= now())
      or (e.starts_at > now() and e.starts_at <= now() + make_interval(hours => greatest(0, coalesce(p_include_upcoming_hours, 24))))
    )
  order by
    -- Les events en cours d'abord, puis les upcoming les plus proches
    (case when (e.starts_at <= now() and e.ends_at >= now()) then 0 else 1 end),
    e.starts_at asc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

grant execute on function public.get_current_events(integer, integer)
  to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4) Commentaires
-- ----------------------------------------------------------------------------

comment on function public.get_trending_venues is
  'Renvoie les venues tendance avec trend_score = activité 24h normalisée + boost ouvert + popularity. Filtre rayon optionnel via lat/lng/radius_km.';
comment on function public.get_active_promotions is
  'Liste les codes promo actifs (non expirés, non épuisés) joints au venue, filtre rayon optionnel.';
comment on function public.get_current_events is
  'Renvoie les events en cours OU qui démarrent dans les prochaines N heures (défaut 24h).';
