-- ============================================================================
-- SOUTRA-PAIYA — Migration 0035 : analytics par lieu (venue_events_log)
-- ============================================================================
-- Tracking événementiel par venue, alimenté côté client (fire-and-forget) :
--   vue de fiche, clic appel, clic WhatsApp, clic itinéraire, clic site web,
--   partage, démarrage/fin de réservation.
--
-- Consommé par :
--   • le tableau de bord propriétaire (`/pro` tab analytics)
--   • le futur scoring « activité/popularité » des venues (PR 8)
--   • la détection des venues tendance (PR 10 « ça bouge maintenant »)
--
-- Non-cassant : 0 modification de table existante.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Enum des types d'événements trackés.
-- ----------------------------------------------------------------------------
do $$ begin
  create type venue_event_kind as enum (
    'view',                    -- consultation de la fiche
    'click_call',              -- tap sur le bouton appel
    'click_whatsapp',          -- tap sur WhatsApp
    'click_directions',        -- tap sur itinéraire
    'click_website',           -- tap sur lien web
    'click_share',             -- partage de la fiche
    'reservation_start',       -- ouverture du flow de réservation
    'reservation_complete',    -- réservation confirmée
    'menu_view',               -- consultation du menu
    'gallery_open'             -- ouverture du lightbox
  );
exception when duplicate_object then null;
end $$;

-- ----------------------------------------------------------------------------
-- 2) Table append-only des événements.
--    bigserial (et pas uuid) car volumétrie élevée attendue (vues anonymes).
-- ----------------------------------------------------------------------------
create table if not exists public.venue_events_log (
  id          bigserial primary key,
  venue_id    uuid not null references public.venues(id) on delete cascade,
  -- user_id nullable : on accepte les sessions anonymes (vue par un non-loggé)
  user_id     uuid references public.profiles(id) on delete set null,
  kind        venue_event_kind not null,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- Index principal : agrégat par venue + kind sur une plage de dates.
create index if not exists idx_venue_events_venue_kind_date
  on public.venue_events_log(venue_id, kind, created_at desc);

-- Index secondaire pour les requêtes de cohorte (par user).
create index if not exists idx_venue_events_user_date
  on public.venue_events_log(user_id, created_at desc)
  where user_id is not null;

-- ----------------------------------------------------------------------------
-- 3) RLS
--    SELECT : owner du venue + admin uniquement (les analytics sont privées)
--    INSERT : tout le monde peut logger (la RPC validée gère l'autorisation
--             en pratique — RLS permissive INSERT pour simplifier les
--             appels anonymes des vues publiques).
-- ----------------------------------------------------------------------------
alter table public.venue_events_log enable row level security;

drop policy if exists "venue_events_select_owner" on public.venue_events_log;
create policy "venue_events_select_owner" on public.venue_events_log
  for select to authenticated
  using (
    exists (
      select 1 from public.venues v
      where v.id = venue_events_log.venue_id
        and v.owner_id = auth.uid()
    )
  );

drop policy if exists "venue_events_select_admin" on public.venue_events_log;
create policy "venue_events_select_admin" on public.venue_events_log
  for select to authenticated
  using (public.is_admin());

drop policy if exists "venue_events_insert_public" on public.venue_events_log;
create policy "venue_events_insert_public" on public.venue_events_log
  for insert to anon, authenticated
  with check (
    -- Si user_id renseigné, doit correspondre à l'utilisateur courant.
    -- (auth.uid() vaut null pour anon -> on autorise user_id null aussi.)
    user_id is null or user_id = auth.uid()
  );

-- ----------------------------------------------------------------------------
-- 4) RPC : log_venue_event
--    Fire-and-forget côté client. Valide l'existence du venue + le kind.
--    Échec silencieux côté client si appel anonyme avec user_id rempli :
--    on dérive user_id de auth.uid() automatiquement.
-- ----------------------------------------------------------------------------
create or replace function public.log_venue_event(
  p_venue_id uuid,
  p_kind     text,
  p_meta     jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind venue_event_kind;
begin
  if p_venue_id is null then return; end if;
  begin
    v_kind := p_kind::venue_event_kind;
  exception when others then
    return; -- kind invalide : on ignore silencieusement
  end;
  -- On s'assure que le venue existe pour éviter de polluer la table.
  if not exists (select 1 from public.venues where id = p_venue_id) then
    return;
  end if;
  insert into public.venue_events_log (venue_id, user_id, kind, meta)
  values (
    p_venue_id,
    auth.uid(),
    v_kind,
    coalesce(p_meta, '{}'::jsonb)
  );
end;
$$;

revoke execute on function public.log_venue_event(uuid, text, jsonb) from public;
grant execute on function public.log_venue_event(uuid, text, jsonb) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5) RPC : get_venue_analytics
--    Caller doit être owner du venue OU admin.
--    Retourne KPI globaux + agrégat par kind + série journalière.
-- ----------------------------------------------------------------------------
create or replace function public.get_venue_analytics(
  p_venue_id uuid,
  p_days     integer default 30
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_owner_id  uuid;
  v_from      timestamptz;
  v_to        timestamptz := now();
  v_views     bigint;
  v_clicks    bigint;
  v_resa      bigint;
  v_by_kind   jsonb;
  v_daily     jsonb;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if p_venue_id is null then
    raise exception 'VENUE_REQUIRED';
  end if;

  select owner_id into v_owner_id from public.venues where id = p_venue_id;
  if v_owner_id is null then
    raise exception 'VENUE_NOT_FOUND';
  end if;
  if v_owner_id <> v_uid and not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  v_from := v_to - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)));

  -- KPIs
  with eligible as (
    select kind from public.venue_events_log
     where venue_id = p_venue_id
       and created_at >= v_from
       and created_at <= v_to
  )
  select
    coalesce(count(*) filter (where kind = 'view'), 0)::bigint,
    coalesce(count(*) filter (
      where kind in ('click_call','click_whatsapp','click_directions','click_website','click_share','menu_view','gallery_open')
    ), 0)::bigint,
    coalesce(count(*) filter (where kind = 'reservation_complete'), 0)::bigint
    into v_views, v_clicks, v_resa
    from eligible;

  -- By kind
  with eligible as (
    select kind, count(*)::bigint as n
      from public.venue_events_log
     where venue_id = p_venue_id
       and created_at >= v_from
       and created_at <= v_to
     group by kind
  )
  select coalesce(jsonb_agg(jsonb_build_object('kind', kind::text, 'count', n) order by n desc), '[]'::jsonb)
    into v_by_kind from eligible;

  -- Daily (series journalière avec les 0 explicitement comblés)
  with grid as (
    select day::date as day
      from generate_series(v_from::date, v_to::date, '1 day'::interval) day
  ),
  agg as (
    select date_trunc('day', created_at)::date as day,
           count(*) filter (where kind = 'view')::bigint as views,
           count(*) filter (where kind in (
             'click_call','click_whatsapp','click_directions','click_website',
             'click_share','menu_view','gallery_open'
           ))::bigint as clicks,
           count(*) filter (where kind = 'reservation_complete')::bigint as reservations
      from public.venue_events_log
     where venue_id = p_venue_id
       and created_at >= v_from
       and created_at <= v_to
     group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'day', to_char(g.day, 'YYYY-MM-DD'),
           'views', coalesce(a.views, 0),
           'clicks', coalesce(a.clicks, 0),
           'reservations', coalesce(a.reservations, 0)
         ) order by g.day asc), '[]'::jsonb)
    into v_daily
    from grid g
    left join agg a using (day);

  return jsonb_build_object(
    'kpi', jsonb_build_object(
      'views', v_views,
      'clicks', v_clicks,
      'reservations', v_resa,
      'conversion_rate', case
        when v_views > 0 then round((v_clicks::numeric / v_views::numeric) * 100, 1)
        else 0
      end,
      'period_days', p_days,
      'period_from', to_char(v_from, 'YYYY-MM-DD'),
      'period_to',   to_char(v_to,   'YYYY-MM-DD')
    ),
    'by_kind', coalesce(v_by_kind, '[]'::jsonb),
    'daily',   coalesce(v_daily, '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.get_venue_analytics(uuid, integer) from public;
grant execute on function public.get_venue_analytics(uuid, integer) to authenticated;

-- ----------------------------------------------------------------------------
-- 6) Commentaires
-- ----------------------------------------------------------------------------
comment on table public.venue_events_log is
  'Log événementiel par venue (vue, clic, réservation). Alimenté en fire-and-forget client. Append-only, jamais d''UPDATE/DELETE.';
comment on function public.log_venue_event is
  'Insère un événement venue (fire-and-forget, accepte anon). Échec silencieux si kind invalide ou venue inexistant.';
comment on function public.get_venue_analytics is
  'Renvoie kpi+by_kind+daily pour un venue sur N jours. Caller = owner ou admin.';
