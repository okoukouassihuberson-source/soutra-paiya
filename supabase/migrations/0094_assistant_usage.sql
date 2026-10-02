-- ============================================================================
-- 0094 — Assistant touristique : plafond d'usage quotidien par utilisateur
-- ============================================================================
-- Chaque question à l'assistant coûte un appel au modèle : on borne l'usage par
-- utilisateur et par jour (UTC). Décompte atomique, sans course entre requêtes.
-- ============================================================================

create table if not exists public.assistant_usage (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day     date not null default (now() at time zone 'utc')::date,
  count   integer not null default 0 check (count >= 0),
  primary key (user_id, day)
);
alter table public.assistant_usage enable row level security;   -- aucune politique : accès par RPC uniquement

-- Réserve une question ; renvoie le nombre restant, ou lève RATE_LIMITED.
create or replace function public.assistant_consume(p_limit integer default 30)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_limit integer := greatest(1, least(coalesce(p_limit, 30), 500)); v_count integer;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  insert into public.assistant_usage as u (user_id, day, count)
  values (v_uid, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day) do update set count = u.count + 1
    where u.count < v_limit
  returning count into v_count;
  if v_count is null then raise exception 'RATE_LIMITED'; end if;
  return v_limit - v_count;
end; $$;

-- Rend la question consommée quand le moteur échoue (l'utilisateur n'est pas pénalisé).
create or replace function public.assistant_refund()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  update public.assistant_usage set count = greatest(0, count - 1)
   where user_id = auth.uid() and day = (now() at time zone 'utc')::date;
end; $$;

revoke execute on function public.assistant_consume(integer) from public, anon;
revoke execute on function public.assistant_refund() from public, anon;
grant execute on function public.assistant_consume(integer) to authenticated;
grant execute on function public.assistant_refund() to authenticated;
