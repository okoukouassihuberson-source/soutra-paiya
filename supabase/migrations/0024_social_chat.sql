-- ============================================================================
-- SOUTRA-PAIYA — Migration 0024 : module social — chat 1-on-1
-- ============================================================================
-- Brique 3 du module Social. Active le chat 1-on-1 entre utilisateurs.
--
-- Réutilisation des tables existantes (migration 0001) : `chats`,
-- `chat_members`, `messages`. Les policies SELECT/INSERT « membre-only »
-- sont déjà en place ; ce qui manque c'est :
-- - un moyen de créer un DM (chats n'a pas de policy INSERT)
-- - le tracking du « lu » pour le badge unread
-- - le Realtime activé sur ces tables
--
-- On ne touche PAS aux tables existantes ; on ajoute une colonne et
-- 3 RPC SECURITY DEFINER pour les opérations privilégiées.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Tracking du « lu » par membre.
-- ----------------------------------------------------------------------------
alter table public.chat_members
  add column if not exists last_read_at timestamptz;

-- Policy UPDATE sur chat_members : un membre peut mettre à jour SON propre
-- last_read_at, rien d'autre.
drop policy if exists "chat_members_update_self" on public.chat_members;
create policy "chat_members_update_self" on public.chat_members
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 2) RPC : ouvrir (ou récupérer) un DM entre le caller et un autre user.
--    SECURITY DEFINER -> peut écrire dans chats et chat_members malgré
--    l'absence de policy INSERT publique sur ces tables.
-- ----------------------------------------------------------------------------
create or replace function public.open_dm(p_other uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_chat_id uuid;
begin
  if v_caller is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_other is null or p_other = v_caller then
    raise exception 'INVALID_TARGET';
  end if;
  -- Vérifie que l'autre user existe.
  if not exists (select 1 from public.profiles where id = p_other) then
    raise exception 'TARGET_NOT_FOUND';
  end if;

  -- Cherche un DM existant entre les deux.
  select c.id into v_chat_id
  from public.chats c
  where c.type = 'dm'
    and exists (
      select 1 from public.chat_members m
      where m.chat_id = c.id and m.user_id = v_caller
    )
    and exists (
      select 1 from public.chat_members m
      where m.chat_id = c.id and m.user_id = p_other
    )
  limit 1;

  if v_chat_id is not null then
    return v_chat_id;
  end if;

  -- Sinon, crée le chat + les deux memberships.
  insert into public.chats (type) values ('dm') returning id into v_chat_id;
  insert into public.chat_members (chat_id, user_id) values (v_chat_id, v_caller);
  insert into public.chat_members (chat_id, user_id) values (v_chat_id, p_other);
  return v_chat_id;
end;
$$;

grant execute on function public.open_dm(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 3) RPC : liste des conversations du caller avec métadonnées.
--    Renvoie pour chaque chat l'autre participant (pour les DM),
--    le dernier message, son auteur, et le nombre de messages non lus.
-- ----------------------------------------------------------------------------
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
      p.phone,
      p.avatar_url
    from my_chats mc
    left join public.chat_members om on om.chat_id = mc.id and om.user_id <> auth.uid()
    left join public.profiles p on p.id = om.user_id
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
    coalesce(o.full_name, o.phone) as other_name,
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

grant execute on function public.list_my_chats() to authenticated;

-- ----------------------------------------------------------------------------
-- 4) RPC : marquer une conversation comme lue.
-- ----------------------------------------------------------------------------
create or replace function public.mark_chat_read(p_chat_id uuid)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.chat_members
     set last_read_at = now()
   where chat_id = p_chat_id and user_id = auth.uid();
$$;

grant execute on function public.mark_chat_read(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 5) Realtime : activer la publication sur chats, messages, chat_members.
--    Le mobile s'abonne aux INSERT pour rafraîchir la conversation
--    en temps réel.
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'chats'
  ) then
    alter publication supabase_realtime add table public.chats;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'chat_members'
  ) then
    alter publication supabase_realtime add table public.chat_members;
  end if;
end$$;

comment on function public.open_dm is
  'Ouvre (ou récupère) un DM 1-on-1 entre le caller et un autre user. Idempotent.';
comment on function public.list_my_chats is
  'Liste les conversations du caller avec dernier message + compte non-lus.';
