-- ============================================================================
-- SOUTRA-PAIYA — Migration 0062 : modération a posteriori des établissements
-- ============================================================================
-- Spec PO : "L'admin ne doit plus être un goulot d'étranglement empêchant le
-- fonctionnement des établissements." Avec la PR1 (activation immédiate),
-- les venues créés via pro_create_venue sont actifs en < 10s. L'admin garde
-- supervision, modération contenu, gestion fraude, suspension de comptes
-- abusifs. Modération RÉACTIVE et non plus préventive.
--
-- Cette migration introduit le mécanisme de signalement automatique :
--   • Table venue_moderation_flags : 1 ligne par signalement (avec sévérité,
--     raison, contexte)
--   • Trigger AFTER INSERT sur venues : détecte automatiquement
--     - termes bannis dans name/description (sex, porn, scam, fraude…)
--     - doublon proche (même nom + même ville déjà actif chez un autre owner)
--     - création rapide (5+ venues dans l'heure pour un même owner)
--   • RPCs admin : list_flagged_venues, dismiss_venue_flag,
--     resolve_venue_flag, suspend_venue
--
-- Le trigger N'INTERFÈRE PAS avec la création — l'objectif est de NE PAS
-- bloquer le Pro, juste de notifier l'admin pour review a posteriori.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Enums
-- ----------------------------------------------------------------------------

do $$ begin
  create type venue_flag_severity as enum ('info', 'low', 'medium', 'high', 'critical');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type venue_flag_reason as enum (
    'banned_term',         -- mot/phrase interdit dans nom/description
    'duplicate_close',     -- doublon probable (même nom + ville)
    'rapid_create',        -- même owner crée trop de venues sur courte période
    'thin_content',        -- contenu trop pauvre (à raffiner plus tard)
    'suspicious_metadata', -- adresse/phone louche (à raffiner)
    'user_report',         -- signalement utilisateur (lien venue_reports)
    'other'                -- divers
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type venue_flag_status as enum ('open', 'reviewing', 'dismissed', 'resolved');
exception when duplicate_object then null;
end $$;

-- ----------------------------------------------------------------------------
-- 2) Table venue_moderation_flags
-- ----------------------------------------------------------------------------

create table if not exists public.venue_moderation_flags (
  id              uuid primary key default gen_random_uuid(),
  venue_id        uuid not null references public.venues(id) on delete cascade,
  reason          venue_flag_reason   not null,
  severity        venue_flag_severity not null default 'medium',
  -- Contexte machine-lisible : terme trouvé, autre venue id en cas de doublon,
  -- count de venues récents, etc. Permet aux RPCs d'afficher des indices.
  details         jsonb not null default '{}'::jsonb,
  status          venue_flag_status not null default 'open',
  -- Audit modération
  resolved_by     uuid references public.profiles(id),
  resolved_at     timestamptz,
  resolution_note text check (resolution_note is null or length(resolution_note) <= 2000),
  created_at      timestamptz not null default now()
);

create index if not exists idx_vmf_venue           on public.venue_moderation_flags(venue_id);
create index if not exists idx_vmf_status_severity on public.venue_moderation_flags(status, severity, created_at desc);
create index if not exists idx_vmf_open_recent     on public.venue_moderation_flags(created_at desc) where status = 'open';

alter table public.venue_moderation_flags enable row level security;

-- Admin uniquement (lecture/écriture). Les Pros ne doivent JAMAIS voir
-- qu'ils ont été flaggés — sinon ils contournent les heuristiques.
drop policy if exists "vmf_admin_all" on public.venue_moderation_flags;
create policy "vmf_admin_all" on public.venue_moderation_flags
  for all to authenticated
  using (public.is_admin_or_moderator())
  with check (public.is_admin_or_moderator());

-- ----------------------------------------------------------------------------
-- 3) Helper : liste des termes bannis
--    Liste de base FR + EN, à étendre via migration ultérieure si besoin.
--    Immutable : permet d'inliner / indexer.
-- ----------------------------------------------------------------------------

create or replace function public.venue_banned_terms()
returns text[]
language sql
immutable
as $$
  select array[
    -- Contenu adulte / illégal
    'porn', 'sex shop', 'escort', 'prostitution',
    -- Arnaque / scam
    'scam', 'arnaque', 'ponzi', 'pyramide', 'mlm',
    -- Drogue
    'cocaine', 'cocaïne', 'heroine', 'héroïne', 'crack',
    -- Fraude
    'fraud', 'fraude', 'faux papier', 'fake id',
    -- Violations
    'hack', 'piratage', 'carding'
  ]::text[];
$$;

-- ----------------------------------------------------------------------------
-- 4) Trigger AFTER INSERT venues : auto-flag
--    Détecte termes bannis + doublons + rapid_create. N'altère JAMAIS la
--    nouvelle ligne (AFTER INSERT, retourne new tel quel).
-- ----------------------------------------------------------------------------

create or replace function public.tg_venues_auto_flag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_terms       text[] := public.venue_banned_terms();
  v_text        text   := lower(coalesce(new.name, '') || ' ' || coalesce(new.description, ''));
  v_term        text;
  v_matched     text[] := array[]::text[];
  v_dup_id      uuid;
  v_owner_count integer;
begin
  -- 4a) Termes bannis
  foreach v_term in array v_terms loop
    if position(v_term in v_text) > 0 then
      v_matched := array_append(v_matched, v_term);
    end if;
  end loop;
  if array_length(v_matched, 1) > 0 then
    insert into public.venue_moderation_flags (venue_id, reason, severity, details)
    values (
      new.id,
      'banned_term',
      'high',
      jsonb_build_object('matched_terms', v_matched)
    );
  end if;

  -- 4b) Doublon proche : même nom (case-insensitive) + même city,
  --     venue actif d'un autre owner.
  select v.id into v_dup_id
    from public.venues v
   where v.id <> new.id
     and v.owner_id <> new.owner_id
     and lower(trim(v.name)) = lower(trim(new.name))
     and lower(trim(coalesce(v.city, ''))) = lower(trim(coalesce(new.city, '')))
     and v.status = 'active'
   limit 1;
  if v_dup_id is not null then
    insert into public.venue_moderation_flags (venue_id, reason, severity, details)
    values (
      new.id,
      'duplicate_close',
      'medium',
      jsonb_build_object('existing_venue_id', v_dup_id)
    );
  end if;

  -- 4c) Rapid create : > 4 venues actifs créés dans la dernière heure
  --     par le même owner.
  select count(*) into v_owner_count
    from public.venues
   where owner_id = new.owner_id
     and created_at > now() - interval '1 hour';
  if v_owner_count > 4 then
    insert into public.venue_moderation_flags (venue_id, reason, severity, details)
    values (
      new.id,
      'rapid_create',
      'medium',
      jsonb_build_object('venues_last_hour', v_owner_count)
    );
  end if;

  return new;
exception when others then
  -- Silencieux : la modération ne doit JAMAIS faire échouer une création
  -- légitime. Si l'auto-flag plante, log et laisse passer.
  raise warning '[tg_venues_auto_flag] erreur silencieuse: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_venues_auto_flag on public.venues;
create trigger trg_venues_auto_flag
  after insert on public.venues
  for each row execute function public.tg_venues_auto_flag();

-- ----------------------------------------------------------------------------
-- 5) RPC list_flagged_venues — admin uniquement
-- ----------------------------------------------------------------------------

create or replace function public.list_flagged_venues(
  p_status   text default 'open',
  p_severity text default null,
  p_limit    integer default 100
) returns table (
  flag_id         uuid,
  venue_id        uuid,
  venue_name      text,
  venue_status    text,
  venue_category  text,
  venue_city      text,
  owner_id        uuid,
  owner_name      text,
  reason          venue_flag_reason,
  severity        venue_flag_severity,
  details         jsonb,
  status          venue_flag_status,
  resolved_by     uuid,
  resolved_at     timestamptz,
  resolution_note text,
  created_at      timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    f.id, v.id, v.name, v.status::text, v.category::text, v.city,
    v.owner_id, p.full_name,
    f.reason, f.severity, f.details, f.status,
    f.resolved_by, f.resolved_at, f.resolution_note, f.created_at
  from public.venue_moderation_flags f
  join public.venues v on v.id = f.venue_id
  left join public.profiles p on p.id = v.owner_id
  where public.is_admin_or_moderator()
    and (p_status is null or p_status = 'all' or f.status::text = p_status)
    and (p_severity is null or f.severity::text = p_severity)
  order by
    case f.severity
      when 'critical' then 0 when 'high' then 1
      when 'medium' then 2 when 'low' then 3 else 4 end,
    f.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

revoke execute on function public.list_flagged_venues(text, text, integer) from public;
grant  execute on function public.list_flagged_venues(text, text, integer) to authenticated;

-- ----------------------------------------------------------------------------
-- 6) RPC dismiss_venue_flag — admin marque le flag comme faux positif
-- ----------------------------------------------------------------------------

create or replace function public.dismiss_venue_flag(
  p_flag_id uuid,
  p_note    text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_admin_or_moderator() then raise exception 'NOT_AUTHORIZED'; end if;

  update public.venue_moderation_flags
     set status = 'dismissed',
         resolved_by = v_uid,
         resolved_at = now(),
         resolution_note = nullif(trim(coalesce(p_note, '')), '')
   where id = p_flag_id
     and status in ('open', 'reviewing');

  if not found then
    raise exception 'FLAG_NOT_FOUND_OR_FINAL';
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.dismiss_venue_flag(uuid, text) from public;
grant  execute on function public.dismiss_venue_flag(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 7) RPC resolve_venue_flag — admin marque le flag comme traité
-- ----------------------------------------------------------------------------

create or replace function public.resolve_venue_flag(
  p_flag_id uuid,
  p_note    text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_admin_or_moderator() then raise exception 'NOT_AUTHORIZED'; end if;

  update public.venue_moderation_flags
     set status = 'resolved',
         resolved_by = v_uid,
         resolved_at = now(),
         resolution_note = nullif(trim(coalesce(p_note, '')), '')
   where id = p_flag_id
     and status in ('open', 'reviewing');

  if not found then
    raise exception 'FLAG_NOT_FOUND_OR_FINAL';
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.resolve_venue_flag(uuid, text) from public;
grant  execute on function public.resolve_venue_flag(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 8) RPC suspend_venue — admin passe le venue en status='suspended'
--    + résout tous les flags ouverts du venue.
-- ----------------------------------------------------------------------------

create or replace function public.suspend_venue(
  p_venue_id uuid,
  p_reason   text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_admin_or_moderator() then raise exception 'NOT_AUTHORIZED'; end if;
  if p_reason is null or length(trim(p_reason)) < 4 then
    raise exception 'REASON_REQUIRED';
  end if;

  update public.venues
     set status = 'suspended',
         updated_at = now()
   where id = p_venue_id;

  if not found then
    raise exception 'VENUE_NOT_FOUND';
  end if;

  -- Marque tous les flags ouverts comme résolus avec la même note.
  update public.venue_moderation_flags
     set status = 'resolved',
         resolved_by = v_uid,
         resolved_at = now(),
         resolution_note = format('Venue suspendu : %s', trim(p_reason))
   where venue_id = p_venue_id
     and status in ('open', 'reviewing');

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.suspend_venue(uuid, text) from public;
grant  execute on function public.suspend_venue(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 9) RPC : compteurs pour badge admin
-- ----------------------------------------------------------------------------

create or replace function public.count_open_venue_flags()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_admin_or_moderator() then
      jsonb_build_object(
        'total',    (select count(*) from public.venue_moderation_flags where status = 'open'),
        'critical', (select count(*) from public.venue_moderation_flags where status = 'open' and severity = 'critical'),
        'high',     (select count(*) from public.venue_moderation_flags where status = 'open' and severity = 'high')
      )
    else jsonb_build_object('total', 0, 'critical', 0, 'high', 0)
  end;
$$;

grant execute on function public.count_open_venue_flags() to authenticated;

-- ----------------------------------------------------------------------------
-- 10) Commentaires
-- ----------------------------------------------------------------------------

comment on table public.venue_moderation_flags is
  'Signalements automatiques sur la création d''un venue. Modération a posteriori (PR4 onboarding). Admin only RLS.';
comment on function public.tg_venues_auto_flag is
  'Trigger AFTER INSERT venues : détecte termes bannis + doublons proches + création rapide. Silencieux en cas d''erreur — ne bloque jamais une création légitime.';
comment on function public.suspend_venue is
  'Suspend un venue (status=suspended). Résout automatiquement tous les flags ouverts du venue avec la raison fournie.';
