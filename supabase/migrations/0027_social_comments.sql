-- ============================================================================
-- SOUTRA-PAIYA — Migration 0027 : module social — commentaires sur posts
-- ============================================================================
-- Brique 5 (et dernière) du module Social V1. Active les commentaires sous
-- les posts du feed.
--
-- La colonne `posts.comment_count` existe déjà depuis 0022 (init à 0,
-- maintenue par trigger). On câble ici le trigger.
-- ============================================================================

create table if not exists public.post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  body       text not null check (length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_post_comments_post
  on public.post_comments(post_id, created_at asc);
create index if not exists idx_post_comments_user
  on public.post_comments(user_id, created_at desc);

-- ----------------------------------------------------------------------------
-- Trigger : maintient `posts.comment_count` au fil de l'insert / delete.
-- ----------------------------------------------------------------------------
create or replace function public.posts_update_comment_count()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set comment_count = comment_count + 1 where id = new.post_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.posts set comment_count = greatest(0, comment_count - 1) where id = old.post_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_post_comments_count on public.post_comments;
create trigger trg_post_comments_count
  after insert or delete on public.post_comments
  for each row execute function public.posts_update_comment_count();

-- Trigger updated_at (réutilise set_updated_at créé en 0014).
drop trigger if exists trg_post_comments_updated_at on public.post_comments;
create trigger trg_post_comments_updated_at
  before update on public.post_comments
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.post_comments enable row level security;

drop policy if exists "post_comments_select_all" on public.post_comments;
create policy "post_comments_select_all" on public.post_comments for select using (true);

drop policy if exists "post_comments_insert_self" on public.post_comments;
create policy "post_comments_insert_self" on public.post_comments
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "post_comments_update_self" on public.post_comments;
create policy "post_comments_update_self" on public.post_comments
  for update to authenticated
  using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());

drop policy if exists "post_comments_delete_self" on public.post_comments;
create policy "post_comments_delete_self" on public.post_comments
  for delete to authenticated
  using (auth.uid() = user_id or public.is_admin());

-- ----------------------------------------------------------------------------
-- Realtime : permet au bottom sheet d'afficher les nouveaux commentaires
-- en temps réel quand plusieurs utilisateurs commentent en même temps.
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'post_comments'
  ) then
    alter publication supabase_realtime add table public.post_comments;
  end if;
end$$;

comment on table public.post_comments is
  'Commentaires sur les posts du feed social. comment_count maintenu par trigger sur posts.';
