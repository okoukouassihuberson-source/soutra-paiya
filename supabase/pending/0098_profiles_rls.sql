-- ============================================================================
-- SOUTRA — Migration 0098 : fermer la lecture publique de `profiles`
-- ============================================================================
-- PROBLÈME : `profiles_select_public` (0001) = `using (true)` -> toute la table,
-- y compris SANS connexion (clé anon) : téléphone, e-mail, pièce d'identité KYC,
-- rôle, statut de bannissement.
--
-- CORRECTION :
--   1. vues `public_profiles` (nom, avatar, bio, ville…) et `discoverable_profiles`
--      (profils ayant activé la découverte) : la seule donnée lisible par les autres ;
--   2. `profiles` : lecture réservée à soi-même, aux admins et aux modérateurs ;
--   3. RPC `find_profile_by_phone` (envoi P2P par numéro) et `reservation_contacts`
--      (un gérant voit les coordonnées de SES clients) ;
--   4. les 5 fonctions `security invoker` qui lisaient d'autres profils passent
--      par les vues (elles restent `invoker` : aucune élévation de privilège).
--
-- ORDRE DE DÉPLOIEMENT : déployer d'abord le web et l'app mobile qui lisent les
-- vues / RPC, PUIS appliquer cette migration. Les anciennes versions de l'app
-- (nom des auteurs, destinataires, avis) afficheraient des champs vides.
-- ============================================================================

-- 1) Vues publiques (propriétaire = postgres : lisent `profiles` en contournant la RLS)
create or replace view public.public_profiles as
  select id, full_name, avatar_url, cover_url, bio, city, district, created_at
  from public.profiles;
grant select on public.public_profiles to anon, authenticated;

create or replace view public.discoverable_profiles as
  select id, full_name, avatar_url, bio, city, district, interests, birth_year, gender
  from public.profiles
  where discoverable = true;
grant select on public.discoverable_profiles to authenticated;

-- 2) RLS de `profiles`
drop policy if exists "profiles_select_public" on public.profiles;
drop policy if exists profiles_select_own_or_staff on public.profiles;
create policy profiles_select_own_or_staff on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin() or public.is_moderator());

-- 3) RPC
create or replace function public.find_profile_by_phone(p_phones text[])
returns table (id uuid, full_name text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name
  from public.profiles p
  where auth.uid() is not null and p.phone = any(p_phones)
  limit 1;
$$;
revoke execute on function public.find_profile_by_phone(text[]) from public, anon;
grant execute on function public.find_profile_by_phone(text[]) to authenticated;

-- Coordonnées de clients : soi-même, ou un client ayant réservé dans un lieu dont on est propriétaire.
create or replace function public.reservation_contacts(p_user_ids uuid[])
returns table (id uuid, full_name text, phone text, email text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.phone, p.email
  from public.profiles p
  where p.id = any(p_user_ids)
    and auth.uid() is not null
    and (
      p.id = auth.uid()
      or public.is_admin()
      or exists (
        select 1 from public.reservations r
        join public.venues v on v.id = r.venue_id
        where r.user_id = p.id and v.owner_id = auth.uid()
      )
    );
$$;
revoke execute on function public.reservation_contacts(uuid[]) from public, anon;
grant execute on function public.reservation_contacts(uuid[]) to authenticated;

-- 4) Fonctions invoker : lecture des autres profils via les vues

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
  from public.discoverable_profiles p, me
  where p.id <> me.id
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
  inner join public.public_profiles p
    on p.id = l1.liked_id
  where l1.liker_id = auth.uid()
    and l1.action   = 'like'
  order by matched_at desc;
$$;

create or replace function public.list_my_chats()
returns table (
  chat_id        uuid,
  chat_type      text,
  other_user_id  uuid,
  other_name     text,
  other_avatar   text,
  last_message   text,
  last_message_at timestamptz,
  last_sender_id uuid,
  unread_count   integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with my_chats as (
    select c.id, c.type, m.last_read_at
    from public.chats c
    join public.chat_members m on m.chat_id = c.id
    where m.user_id = auth.uid()
  ),
  others as (
    select
      mc.id as chat_id,
      mc.type,
      mc.last_read_at,
      p.id as other_id,
      p.full_name,
      p.avatar_url
    from my_chats mc
    left join public.chat_members om on om.chat_id = mc.id and om.user_id <> auth.uid()
    left join public.public_profiles p on p.id = om.user_id
    where mc.type = 'dm'
  ),
  last_msgs as (
    select distinct on (msg.chat_id)
      msg.chat_id, msg.body, msg.created_at, msg.sender_id
    from public.messages msg
    join others o on o.chat_id = msg.chat_id
    order by msg.chat_id, msg.created_at desc
  ),
  unread as (
    select msg.chat_id, count(*)::int as cnt
    from public.messages msg
    join others o on o.chat_id = msg.chat_id
    where msg.sender_id <> auth.uid()
      and (o.last_read_at is null or msg.created_at > o.last_read_at)
    group by msg.chat_id
  )
  select
    o.chat_id,
    o.type,
    o.other_id,
    coalesce(o.full_name, 'Anonyme') as other_name,
    o.avatar_url,
    lm.body,
    lm.created_at,
    lm.sender_id,
    coalesce(u.cnt, 0)
  from others o
  left join last_msgs lm on lm.chat_id = o.chat_id
  left join unread u on u.chat_id = o.chat_id
  order by coalesce(lm.created_at, now()) desc;
$$;

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
    coalesce(p.full_name, 'Anonyme') as user_name,
    p.avatar_url,
    max(a.created_at) as latest_story_at,
    count(*)::int as total_stories,
    bool_or(not a.viewed) as has_unviewed
  from active a
  join public.public_profiles p on p.id = a.user_id
  group by a.user_id, p.full_name, p.avatar_url
  order by max(a.created_at) desc;
$$;

create or replace function public.get_event_detail(p_event_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_event record;
begin
  select
    e.id, e.title, e.slug, e.description, e.cover_url,
    e.starts_at, e.ends_at, e.capacity, e.ticket_tiers, e.status::text, e.city,
    e.organizer_id,
    p.full_name as organizer_name,
    v.id as venue_id, v.name as venue_name, v.address as venue_address,
    v.cover_url as venue_cover_url, v.district as venue_district
  into v_event
  from public.events e
  left join public.venues v on v.id = e.venue_id
  left join public.public_profiles p on p.id = e.organizer_id
  where e.id = p_event_id
    and (e.status = 'published' or e.organizer_id = auth.uid())
  limit 1;

  if v_event.id is null then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  return jsonb_build_object(
    'event_id', v_event.id,
    'title', v_event.title,
    'slug', v_event.slug,
    'description', v_event.description,
    'cover_url', v_event.cover_url,
    'starts_at', v_event.starts_at,
    'ends_at', v_event.ends_at,
    'capacity', v_event.capacity,
    'ticket_tiers', v_event.ticket_tiers,
    'status', v_event.status,
    'city', v_event.city,
    'organizer_name', v_event.organizer_name,
    'venue', case when v_event.venue_id is null then null else jsonb_build_object(
      'id', v_event.venue_id,
      'name', v_event.venue_name,
      'address', v_event.venue_address,
      'cover_url', v_event.venue_cover_url,
      'district', v_event.venue_district
    ) end
  );
end;
$$;
