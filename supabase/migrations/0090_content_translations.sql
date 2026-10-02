-- ============================================================================
-- SOUTRA PLAYCE V2 — Migration 0090 : traductions du contenu éditorial + durcissement
-- ============================================================================
-- 1) Colonne i18n jsonb sur destinations, trips, trip_itineraries, trip_packages,
--    activities. Forme : { "en": { "title": "…", "description": "…" } }.
--    Les champs non traduits retombent sur le texte d'origine (français) côté
--    application. Les listes (inclus, activités…) sont stockées une entrée par ligne.
-- 2) list_activities renvoie aussi i18n (nécessaire aux cartes traduites).
-- 3) DURCISSEMENT : un organisateur ne pouvait plus modifier un voyage publié (garde
--    tg_trips_guard) mais pouvait encore modifier ses formules et son programme
--    (trip_packages / trip_itineraries), donc par exemple le prix d'une formule
--    après validation. Ces tables ne sont désormais modifiables par l'organisateur
--    que tant que le voyage est en brouillon (l'admin garde la main).
-- ============================================================================

create or replace function public.is_valid_i18n(p jsonb)
returns boolean
language sql
immutable
as $$
  select p is not null and jsonb_typeof(p) = 'object' and length(p::text) <= 60000
     and not exists (
       select 1 from jsonb_each(p) l
        where l.key !~ '^[a-z]{2}$'
           or jsonb_typeof(l.value) <> 'object'
           or exists (select 1 from jsonb_each(l.value) f
                       where jsonb_typeof(f.value) <> 'string' or length(f.value #>> '{}') > 20000));
$$;

alter table public.destinations     add column if not exists i18n jsonb not null default '{}'::jsonb;
alter table public.trips            add column if not exists i18n jsonb not null default '{}'::jsonb;
alter table public.trip_itineraries add column if not exists i18n jsonb not null default '{}'::jsonb;
alter table public.trip_packages    add column if not exists i18n jsonb not null default '{}'::jsonb;
alter table public.activities       add column if not exists i18n jsonb not null default '{}'::jsonb;

alter table public.destinations     drop constraint if exists destinations_i18n_check;
alter table public.destinations     add constraint destinations_i18n_check check (public.is_valid_i18n(i18n));
alter table public.trips            drop constraint if exists trips_i18n_check;
alter table public.trips            add constraint trips_i18n_check check (public.is_valid_i18n(i18n));
alter table public.trip_itineraries drop constraint if exists trip_itineraries_i18n_check;
alter table public.trip_itineraries add constraint trip_itineraries_i18n_check check (public.is_valid_i18n(i18n));
alter table public.trip_packages    drop constraint if exists trip_packages_i18n_check;
alter table public.trip_packages    add constraint trip_packages_i18n_check check (public.is_valid_i18n(i18n));
alter table public.activities       drop constraint if exists activities_i18n_check;
alter table public.activities       add constraint activities_i18n_check check (public.is_valid_i18n(i18n));

-- ----------------------------------------------------------------------------
-- 2) list_activities : même contrat + colonne i18n (le type de retour change : DROP puis CREATE)
-- ----------------------------------------------------------------------------
drop function if exists public.list_activities(text,text,text,integer,integer,date,integer,uuid,text,integer,integer);

create function public.list_activities(
  p_q          text default null,
  p_category   text default null,
  p_city       text default null,
  p_min_price  integer default null,
  p_max_price  integer default null,
  p_date       date default null,
  p_max_age    integer default null,
  p_destination uuid default null,
  p_sort       text default 'popular',
  p_limit      integer default 24,
  p_offset     integer default 0
)
returns table (
  id uuid, slug text, title text, summary text, category text, city text, cover_url text,
  price_xof bigint, duration_minutes integer, min_age integer, highlight text,
  rating_avg numeric, rating_count integer, latitude double precision, longitude double precision,
  next_slot_at timestamptz, seats_left integer, total_count bigint, i18n jsonb
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_q text := nullif(trim(p_q), '');
  v_limit integer := greatest(1, least(coalesce(p_limit, 24), 100));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
begin
  return query
  select s.id, s.slug, s.title, s.summary, s.category, s.city, s.cover_url, s.price_xof, s.duration_minutes,
         s.min_age, s.highlight, s.rating_avg, s.rating_count, s.latitude, s.longitude, s.next_slot_at, s.seats_left, s.total_count, s.i18n
  from (
    select a.id, a.slug, a.title, a.summary, a.category, a.city, a.cover_url, a.price_xof, a.duration_minutes,
           a.min_age, a.highlight, a.rating_avg, a.rating_count, a.latitude, a.longitude, a.created_at, a.i18n,
           ns.starts_at as next_slot_at, ns.left_ as seats_left, count(*) over () as total_count
      from public.activities a
      join lateral (
        select sl.starts_at, (sl.capacity - sl.booked) as left_
          from public.activity_slots sl
         where sl.activity_id = a.id and sl.status = 'open'
           and sl.starts_at > now() + interval '1 hour'
           and sl.capacity > sl.booked
           and (p_date is null or (sl.starts_at at time zone 'UTC')::date = p_date)
         order by sl.starts_at limit 1) ns on true
     where a.status = 'published'
       -- recherche aussi dans les titres traduits
       and (v_q is null or a.title ilike '%' || replace(replace(v_q, '%', ''), '_', ' ') || '%'
                        or a.city ilike '%' || replace(replace(v_q, '%', ''), '_', ' ') || '%'
                        or a.i18n::text ilike '%' || replace(replace(v_q, '%', ''), '_', ' ') || '%')
       and (p_category is null or a.category = p_category)
       and (p_city is null or a.city ilike p_city)
       and (p_destination is null or a.destination_id = p_destination)
       and (p_min_price is null or a.price_xof >= p_min_price)
       and (p_max_price is null or a.price_xof <= p_max_price)
       and (p_max_age is null or a.min_age <= p_max_age)
  ) s
  order by
    case when p_sort = 'price_asc'  then s.price_xof end asc nulls last,
    case when p_sort = 'price_desc' then s.price_xof end desc nulls last,
    case when p_sort = 'soon'       then s.next_slot_at end asc,
    case when p_sort = 'new'        then s.created_at end desc,
    (s.highlight is not null) desc, s.rating_avg desc, s.rating_count desc, s.title asc
  limit v_limit offset v_offset;
end; $$;

revoke execute on function public.list_activities(text,text,text,integer,integer,date,integer,uuid,text,integer,integer) from public;
grant execute on function public.list_activities(text,text,text,integer,integer,date,integer,uuid,text,integer,integer) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3) Durcissement : formules et programme figés une fois le voyage validé
-- ----------------------------------------------------------------------------
drop policy if exists trip_itineraries_owner_write on public.trip_itineraries;
create policy trip_itineraries_owner_write on public.trip_itineraries
  for all to authenticated
  using (public.is_admin() or exists (select 1 from public.trips t where t.id = trip_id and t.organizer_id = auth.uid() and t.status = 'draft'))
  with check (public.is_admin() or exists (select 1 from public.trips t where t.id = trip_id and t.organizer_id = auth.uid() and t.status = 'draft'));

drop policy if exists trip_packages_owner_write on public.trip_packages;
create policy trip_packages_owner_write on public.trip_packages
  for all to authenticated
  using (public.is_admin() or exists (select 1 from public.trips t where t.id = trip_id and t.organizer_id = auth.uid() and t.status = 'draft'))
  with check (public.is_admin() or exists (select 1 from public.trips t where t.id = trip_id and t.organizer_id = auth.uid() and t.status = 'draft'));
