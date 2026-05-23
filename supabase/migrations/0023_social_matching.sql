-- ============================================================================
-- SOUTRA-PAIYA — Migration 0023 : module social — matching / découverte
-- ============================================================================
-- Brique 2 du module Social. Permet aux utilisateurs qui le souhaitent
-- d'apparaître dans une découverte par centres d'intérêt + ville, de liker
-- / passer, et de matcher en cas de like mutuel.
--
-- Choix d'archi :
-- - opt-in explicite (`profiles.discoverable`, default false). On
--   n'expose pas les utilisateurs à leur insu.
-- - score d'overlap d'intérêts = cardinalité de l'intersection des arrays
--   `profiles.interests`. Pas d'« IA » fictive. Algo lisible, scalable
--   (les arrays sont petits).
-- - `profile_likes` PK composite (liker, liked) -> idempotence native.
-- - `react_to_profile` est atomique (un seul appel pour insérer + détecter
--   le match) -> pas de race-condition entre client.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Colonnes additionnelles sur profiles (idempotent).
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists interests    text[] not null default '{}',
  add column if not exists birth_year   integer check (birth_year is null or birth_year between 1900 and extract(year from now())::int - 13),
  add column if not exists gender       text check (gender is null or gender in ('m','f','x')),
  add column if not exists looking_for  text check (looking_for is null or looking_for in ('m','f','any')),
  add column if not exists discoverable boolean not null default false;

create index if not exists idx_profiles_discoverable
  on public.profiles(city) where discoverable = true;

-- ----------------------------------------------------------------------------
-- 2) Table des likes / pass.
-- ----------------------------------------------------------------------------
create table if not exists public.profile_likes (
  liker_id   uuid not null references public.profiles(id) on delete cascade,
  liked_id   uuid not null references public.profiles(id) on delete cascade,
  action     text not null check (action in ('like','pass')),
  created_at timestamptz not null default now(),
  primary key (liker_id, liked_id),
  constraint profile_likes_no_self check (liker_id <> liked_id)
);

create index if not exists idx_profile_likes_target on public.profile_likes(liked_id, action);

alter table public.profile_likes enable row level security;

-- Le caller voit ses propres décisions ET les likes reçus (pour la liste
-- des matchs, où il faut savoir qu'on a été liké en retour).
drop policy if exists "profile_likes_select_self_or_target" on public.profile_likes;
create policy "profile_likes_select_self_or_target" on public.profile_likes
  for select using (auth.uid() = liker_id or auth.uid() = liked_id);

drop policy if exists "profile_likes_insert_self" on public.profile_likes;
create policy "profile_likes_insert_self" on public.profile_likes
  for insert to authenticated
  with check (auth.uid() = liker_id);

drop policy if exists "profile_likes_update_self" on public.profile_likes;
create policy "profile_likes_update_self" on public.profile_likes
  for update to authenticated
  using (auth.uid() = liker_id)
  with check (auth.uid() = liker_id);

drop policy if exists "profile_likes_delete_self" on public.profile_likes;
create policy "profile_likes_delete_self" on public.profile_likes
  for delete to authenticated
  using (auth.uid() = liker_id);

-- ----------------------------------------------------------------------------
-- 3) RPC : découverte de profils compatibles.
--    - filtre obligatoire : profil discoverable, pas soi-même, pas déjà liké/passé
--    - filtre optionnel ville + orientation (looking_for)
--    - score = cardinalité de l'intersection des intérêts
--    - tri : score desc puis random (mélange à score égal)
-- ----------------------------------------------------------------------------
create or replace function public.discover_profiles(
  p_limit       integer default 20,
  p_city_only   boolean default true
)
returns table (
  id            uuid,
  full_name     text,
  avatar_url    text,
  bio           text,
  city          text,
  district      text,
  interests     text[],
  birth_year    integer,
  gender        text,
  overlap_count integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with me as (
    select id, interests, city, looking_for
    from public.profiles
    where id = auth.uid()
  )
  select
    p.id, p.full_name, p.avatar_url, p.bio,
    p.city, p.district, p.interests,
    p.birth_year, p.gender,
    cardinality(
      array(
        select unnest(p.interests)
        intersect
        select unnest((select interests from me))
      )
    )::int as overlap_count
  from public.profiles p, me
  where p.id <> me.id
    and p.discoverable = true
    and not exists (
      select 1 from public.profile_likes l
      where l.liker_id = me.id and l.liked_id = p.id
    )
    and (not p_city_only or p.city is not distinct from me.city)
    and (
      (select looking_for from me) is null
      or (select looking_for from me) = 'any'
      or p.gender is null  -- on n'exclut pas les profils non spécifiés
      or (select looking_for from me) = p.gender
    )
  order by overlap_count desc, random()
  limit p_limit;
$$;

grant execute on function public.discover_profiles(integer, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- 4) RPC : réaction (like / pass) atomique + détection de match.
-- ----------------------------------------------------------------------------
create or replace function public.react_to_profile(
  p_target_id uuid,
  p_action    text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_matched boolean := false;
begin
  if p_action not in ('like','pass') then
    raise exception 'INVALID_ACTION: % (attendu: like|pass)', p_action;
  end if;
  if p_target_id = auth.uid() then
    raise exception 'SELF_REACTION_FORBIDDEN';
  end if;

  insert into public.profile_likes (liker_id, liked_id, action)
  values (auth.uid(), p_target_id, p_action)
  on conflict (liker_id, liked_id)
  do update set action = excluded.action, created_at = now();

  if p_action = 'like' then
    select exists (
      select 1 from public.profile_likes
      where liker_id = p_target_id
        and liked_id = auth.uid()
        and action = 'like'
    ) into v_matched;
  end if;

  return jsonb_build_object('action', p_action, 'matched', v_matched);
end;
$$;

grant execute on function public.react_to_profile(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 5) RPC : liste des matchs (likes mutuels).
-- ----------------------------------------------------------------------------
create or replace function public.list_my_matches()
returns table (
  id          uuid,
  full_name   text,
  avatar_url  text,
  city        text,
  district    text,
  matched_at  timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    p.id, p.full_name, p.avatar_url, p.city, p.district,
    greatest(l1.created_at, l2.created_at) as matched_at
  from public.profile_likes l1
  inner join public.profile_likes l2
    on l2.liker_id = l1.liked_id
   and l2.liked_id = l1.liker_id
   and l2.action  = 'like'
  inner join public.profiles p
    on p.id = l1.liked_id
  where l1.liker_id = auth.uid()
    and l1.action   = 'like'
  order by matched_at desc;
$$;

grant execute on function public.list_my_matches() to authenticated;

comment on function public.discover_profiles is
  'Découverte de profils compatibles : opt-in obligatoire, exclusion des déjà décidés, tri par overlap d''intérêts.';
comment on function public.react_to_profile is
  'Like ou pass sur un profil. Détecte le match mutuel dans la même transaction.';
