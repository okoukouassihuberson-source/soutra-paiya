-- ============================================================================
-- SOUTRA-PAIYA — Migration 0029 : jetons de notifications push
-- ============================================================================
-- Stocke les jetons Expo Push par appareil (token = PK -> unicité device).
-- - aucune policy RLS publique : tout passe par la fonction SECURITY DEFINER
--   `register_push_token` (écriture) ou le service role (lecture côté
--   Edge Function send-push).
-- - le delete préalable gère le cas du changement de compte sur un même
--   appareil (un token migre alors vers le nouveau user_id).
-- ============================================================================

create table if not exists public.push_tokens (
  token      text primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  platform   text,
  updated_at timestamptz not null default now()
);

create index if not exists idx_push_tokens_user on public.push_tokens(user_id);

alter table public.push_tokens enable row level security;
-- Aucune policy publique : accès uniquement via la RPC ci-dessous (écriture)
-- ou le service role (lecture côté send-push).

-- ----------------------------------------------------------------------------
-- RPC : enregistre / réattribue le jeton push de l'appareil au caller.
-- ----------------------------------------------------------------------------
create or replace function public.register_push_token(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if p_token is null or length(p_token) < 10 then
    raise exception 'INVALID_TOKEN';
  end if;
  -- Un token est unique à un device. Si on en réenregistre un (changement de
  -- compte sur le même téléphone), il bascule vers le caller courant.
  delete from public.push_tokens where token = p_token;
  insert into public.push_tokens (token, user_id, platform, updated_at)
  values (p_token, auth.uid(), nullif(p_platform, ''), now());
end;
$$;

revoke execute on function public.register_push_token(text, text) from public;
grant execute on function public.register_push_token(text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- RPC : désenregistre le jeton de l'appareil au logout / désinstallation.
-- ----------------------------------------------------------------------------
create or replace function public.unregister_push_token(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.push_tokens
   where token = p_token
     and user_id = auth.uid();
end;
$$;

grant execute on function public.unregister_push_token(text) to authenticated;

comment on table public.push_tokens is
  'Jetons Expo Push par appareil. Accès écriture via register_push_token (SECURITY DEFINER), lecture via service role uniquement.';
