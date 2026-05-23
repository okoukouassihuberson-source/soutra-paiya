-- ============================================================================
-- SOUTRA-PAIYA — Migration 0025 : module social — Stories 24h
-- ============================================================================
-- Brique 4 du module Social. La table `stories` existe déjà depuis la
-- migration 0001 avec `expires_at` (defaut now()+24h), `media_url`,
-- `media_type` et RLS « lecture des actives + propriétaire / write self ».
--
-- Ce qui manque dans cette brique :
-- - tracking des vues (qui a vu quoi) -> table `story_views`
-- - compteur visible côté propriétaire
-- - 3 RPC : strip des users avec stories actives, stories d'un user,
--   marquage comme vu
-- - Realtime sur stories
--
-- Pas de cron de cleanup hard-delete : les requêtes filtrent toujours
-- `expires_at > now()`. On nettoiera physiquement via une edge function
-- planifiée si la table devient lourde.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Table story_views : qui a vu quoi.
-- ----------------------------------------------------------------------------
create table if not exists public.story_views (
  story_id  uuid not null references public.stories(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (story_id, viewer_id)
);

create index if not exists idx_story_views_viewer on public.story_views(viewer_id);

alter table public.story_views enable row level security;

-- Le propriétaire de la story voit qui l'a vue. Le viewer voit ses
-- propres vues (utile pour le badge « déjà vu »).
drop policy if exists "story_views_select_owner_or_viewer" on public.story_views;
create policy "story_views_select_owner_or_viewer" on public.story_views
  for select using (
    auth.uid() = viewer_id
    or exists (
      select 1 from public.stories s
      where s.id = story_id and s.user_id = auth.uid()
    )
  );

drop policy if exists "story_views_insert_self" on public.story_views;
create policy "story_views_insert_self" on public.story_views
  for insert to authenticated
  with check (auth.uid() = viewer_id);

-- ----------------------------------------------------------------------------
-- 2) RPC : strip des utilisateurs ayant au moins une story active.
--    Renvoie 1 ligne par user, avec total + indicateur « il reste du
--    non-vu » pour le ring coloré.
-- ----------------------------------------------------------------------------
create or replace function public.list_active_stories()
returns table (
  user_id          uuid,
  user_name        text,
  user_avatar      text,
  latest_story_at  timestamptz,
  total_stories    integer,
  has_unviewed     boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  with active as (
    select s.id, s.user_id, s.created_at,
      exists (
        select 1 from public.story_views v
        where v.story_id = s.id and v.viewer_id = auth.uid()
      ) as viewed
    from public.stories s
    where s.expires_at > now()
  )
  select
    a.user_id,
    coalesce(p.full_name, p.phone) as user_name,
    p.avatar_url,
    max(a.created_at) as latest_story_at,
    count(*)::int as total_stories,
    bool_or(not a.viewed) as has_unviewed
  from active a
  join public.profiles p on p.id = a.user_id
  group by a.user_id, p.full_name, p.phone, p.avatar_url
  order by max(a.created_at) desc;
$$;

grant execute on function public.list_active_stories() to authenticated, anon;

-- ----------------------------------------------------------------------------
-- 3) RPC : toutes les stories actives d'un user (pour le viewer).
-- ----------------------------------------------------------------------------
create or replace function public.list_user_stories(p_user_id uuid)
returns table (
  id            uuid,
  media_url     text,
  media_type    text,
  caption       text,
  created_at    timestamptz,
  view_count    integer,
  viewed_by_me  boolean,
  mine          boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    s.id,
    s.media_url,
    s.media_type,
    s.caption,
    s.created_at,
    coalesce((select count(*)::int from public.story_views v where v.story_id = s.id), 0) as view_count,
    exists (
      select 1 from public.story_views v
      where v.story_id = s.id and v.viewer_id = auth.uid()
    ) as viewed_by_me,
    (s.user_id = auth.uid()) as mine
  from public.stories s
  where s.user_id = p_user_id
    and s.expires_at > now()
  order by s.created_at asc;
$$;

grant execute on function public.list_user_stories(uuid) to authenticated, anon;

-- ----------------------------------------------------------------------------
-- 4) RPC : marquer une story comme vue. SECURITY DEFINER pour pouvoir
--    insérer même si la story appartient à quelqu'un d'autre (le viewer
--    n'a pas le contrôle sur les RLS de stories).
--    Skip propre si le caller est le propriétaire (un user qui regarde
--    sa propre story ne « vue » rien).
-- ----------------------------------------------------------------------------
create or replace function public.mark_story_viewed(p_story_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then return; end if;
  -- Skip si c'est ma propre story.
  if exists (select 1 from public.stories where id = p_story_id and user_id = v_caller) then
    return;
  end if;
  insert into public.story_views (story_id, viewer_id)
  values (p_story_id, v_caller)
  on conflict do nothing;
end;
$$;

grant execute on function public.mark_story_viewed(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 5) Realtime : on ajoute stories à la publication pour rafraîchir le strip
--    dès qu'une nouvelle apparaît.
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'stories'
  ) then
    alter publication supabase_realtime add table public.stories;
  end if;
end$$;

comment on function public.list_active_stories is
  'Strip des stories actives (24h). 1 ligne par user, avec total et flag de non-vu.';
comment on function public.list_user_stories is
  'Toutes les stories actives d''un user, dans l''ordre chronologique, pour le viewer.';
comment on function public.mark_story_viewed is
  'Marque une story comme vue par le caller (idempotent, skip si propriétaire).';
