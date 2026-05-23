-- ============================================================================
-- SOUTRA-PAIYA — Migration 0022 : module social — posts + likes
-- ============================================================================
-- Brique 1/N du module Social. Remplace l'écran « Stories, chat & matching
-- arrivent en V1.1 » par un vrai fil d'actualité communautaire.
--
-- Scope strict de cette brique :
-- - publier un post (texte + image optionnelle)
-- - aimer / désaimer
-- - compteur de likes maintenu par trigger
-- - lecture publique du feed
-- - upload d'image dans un bucket dédié `social-media`
-- - Realtime activé sur posts + post_likes
--
-- Hors scope (briques suivantes) : commentaires, stories 24h, chat 1-on-1,
-- matching, communautés, signalement / modération.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- posts
-- ----------------------------------------------------------------------------
create table if not exists public.posts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  body          text check (body is null or length(body) <= 1000),
  image_url     text,
  like_count    integer not null default 0,
  comment_count integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Un post vide n'a aucun sens : body OU image_url doit être renseigné.
  constraint posts_body_or_image_check
    check ((body is not null and length(trim(body)) > 0) or image_url is not null)
);

create index if not exists idx_posts_created on public.posts(created_at desc);
create index if not exists idx_posts_user on public.posts(user_id, created_at desc);

-- ----------------------------------------------------------------------------
-- post_likes
-- ----------------------------------------------------------------------------
create table if not exists public.post_likes (
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists idx_post_likes_user on public.post_likes(user_id);

-- ----------------------------------------------------------------------------
-- Trigger : maintient le compteur de likes côté posts (évite count(*) à la
-- volée à chaque rendu de feed).
-- ----------------------------------------------------------------------------
create or replace function public.posts_update_like_count()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set like_count = like_count + 1 where id = new.post_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.posts set like_count = greatest(0, like_count - 1) where id = old.post_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_post_likes_count on public.post_likes;
create trigger trg_post_likes_count
  after insert or delete on public.post_likes
  for each row execute function public.posts_update_like_count();

-- Trigger updated_at sur posts.
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'set_updated_at') then
    create or replace function set_updated_at() returns trigger as $fn$
    begin new.updated_at = now(); return new; end;
    $fn$ language plpgsql;
  end if;
end$$;

drop trigger if exists trg_posts_updated_at on public.posts;
create trigger trg_posts_updated_at
  before update on public.posts
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.posts      enable row level security;
alter table public.post_likes enable row level security;

-- posts : lecture publique, écriture self uniquement.
drop policy if exists "posts_select_all" on public.posts;
create policy "posts_select_all" on public.posts for select using (true);

drop policy if exists "posts_insert_self" on public.posts;
create policy "posts_insert_self" on public.posts
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "posts_update_self" on public.posts;
create policy "posts_update_self" on public.posts
  for update to authenticated
  using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());

drop policy if exists "posts_delete_self" on public.posts;
create policy "posts_delete_self" on public.posts
  for delete to authenticated
  using (auth.uid() = user_id or public.is_admin());

-- post_likes : lecture publique (pour les compteurs / affichage du « j'aime »),
-- écriture/suppression self uniquement.
drop policy if exists "post_likes_select_all" on public.post_likes;
create policy "post_likes_select_all" on public.post_likes for select using (true);

drop policy if exists "post_likes_insert_self" on public.post_likes;
create policy "post_likes_insert_self" on public.post_likes
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "post_likes_delete_self" on public.post_likes;
create policy "post_likes_delete_self" on public.post_likes
  for delete to authenticated
  using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- Realtime : on publie les deux tables -> le feed mobile se met à jour
-- automatiquement quand quelqu'un poste ou aime.
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'posts'
  ) then
    alter publication supabase_realtime add table public.posts;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'post_likes'
  ) then
    alter publication supabase_realtime add table public.post_likes;
  end if;
end$$;

-- ----------------------------------------------------------------------------
-- Bucket Storage : `social-media`
-- Convention de chemin : `<user_id>/<timestamp>.<ext>`.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('social-media', 'social-media', true)
on conflict (id) do update set public = excluded.public;

-- Pattern SECURITY DEFINER (cf. migration 0018) pour éviter les déboires
-- du contexte interne de Supabase Storage qui n'évalue pas certaines
-- sous-requêtes comme attendu.
create or replace function public.can_write_social_media(p_folder text)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_uuid uuid;
begin
  begin
    v_uuid := p_folder::uuid;
  exception when others then
    return false;
  end;
  return v_uuid = auth.uid() or public.is_admin();
end;
$$;

grant execute on function public.can_write_social_media(text) to authenticated;

-- Policies storage.objects sur le bucket social-media.
drop policy if exists "social_media_insert" on storage.objects;
create policy "social_media_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'social-media'
    and public.can_write_social_media(split_part(name, '/', 1))
  );

drop policy if exists "social_media_update" on storage.objects;
create policy "social_media_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'social-media'
    and public.can_write_social_media(split_part(name, '/', 1))
  )
  with check (
    bucket_id = 'social-media'
    and public.can_write_social_media(split_part(name, '/', 1))
  );

drop policy if exists "social_media_delete" on storage.objects;
create policy "social_media_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'social-media'
    and public.can_write_social_media(split_part(name, '/', 1))
  );

drop policy if exists "social_media_select" on storage.objects;
create policy "social_media_select" on storage.objects
  for select using (bucket_id = 'social-media');

comment on table public.posts is
  'Fil d''actualité communautaire. Body texte + image_url optionnelle. like_count maintenu par trigger.';
