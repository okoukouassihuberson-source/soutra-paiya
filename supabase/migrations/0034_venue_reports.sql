-- ============================================================================
-- SOUTRA-PAIYA — Migration 0034 : signalements utilisateurs sur les venues
-- ============================================================================
-- Permet aux utilisateurs de signaler une information incorrecte sur un lieu :
-- fermeture, déménagement, doublon, prix erroné, contenu inapproprié, autre.
-- Premier brique de la modération communautaire — alimente :
--   • la queue de modération admin (tab Signalements dans /admin)
--   • le futur scoring « confiance/qualité » des venues (PR 8)
--   • la détection IA des lieux inactifs / faux (PR R&D)
--
-- Non-cassant : ne modifie aucune table existante.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Enums
-- ----------------------------------------------------------------------------

do $$ begin
  create type venue_report_kind as enum (
    'closed',          -- l'établissement est fermé définitivement
    'moved',           -- l'établissement a déménagé
    'duplicate',       -- doublon avec un autre venue (renseigner duplicate_of)
    'wrong_info',      -- info erronée (horaires, contact, adresse…)
    'wrong_price',     -- prix changé / faux prix affiché
    'inappropriate',   -- contenu inapproprié (photos, description…)
    'other'            -- autre raison libre
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type venue_report_status as enum (
    'open',            -- soumis, en attente de traitement
    'reviewing',       -- admin a commencé l'examen
    'resolved',        -- action admin effectuée (venue modifié/fermé/etc.)
    'rejected'         -- signalement infondé
  );
exception when duplicate_object then null;
end $$;

-- ----------------------------------------------------------------------------
-- 2) Table principale
-- ----------------------------------------------------------------------------

create table if not exists public.venue_reports (
  id              uuid primary key default gen_random_uuid(),
  venue_id        uuid not null references public.venues(id) on delete cascade,
  reporter_id     uuid not null references public.profiles(id),
  kind            venue_report_kind not null,
  details         text check (details is null or length(details) <= 1000),
  -- Renseigné quand kind='duplicate' : pointe vers le venue jugé « original ».
  duplicate_of    uuid references public.venues(id) on delete set null,
  status          venue_report_status not null default 'open',
  resolved_by     uuid references public.profiles(id),
  resolved_at     timestamptz,
  resolution_note text check (resolution_note is null or length(resolution_note) <= 1000),
  created_at      timestamptz not null default now(),
  -- Le venue cible et le duplicate doivent être différents.
  constraint chk_no_self_duplicate
    check (duplicate_of is null or duplicate_of <> venue_id),
  -- duplicate_of n'a de sens que pour kind='duplicate'.
  constraint chk_duplicate_kind_only
    check (duplicate_of is null or kind = 'duplicate')
);

create index if not exists idx_venue_reports_venue_open
  on public.venue_reports(venue_id) where status in ('open', 'reviewing');

create index if not exists idx_venue_reports_status_recent
  on public.venue_reports(status, created_at desc);

create index if not exists idx_venue_reports_reporter
  on public.venue_reports(reporter_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 3) RLS
-- ----------------------------------------------------------------------------

alter table public.venue_reports enable row level security;

-- L'auteur voit toujours ses propres signalements.
drop policy if exists "venue_reports_select_reporter" on public.venue_reports;
create policy "venue_reports_select_reporter" on public.venue_reports
  for select to authenticated
  using (reporter_id = auth.uid());

-- Le propriétaire du venue ciblé voit les signalements le concernant
-- (mais reporter_id reste anonymisé côté UI pro — ici on retourne quand
-- même l'id ; libre au front pro de ne pas l'afficher).
drop policy if exists "venue_reports_select_owner" on public.venue_reports;
create policy "venue_reports_select_owner" on public.venue_reports
  for select to authenticated
  using (
    exists (
      select 1 from public.venues v
      where v.id = venue_reports.venue_id
        and v.owner_id = auth.uid()
    )
  );

-- L'admin voit tout.
drop policy if exists "venue_reports_select_admin" on public.venue_reports;
create policy "venue_reports_select_admin" on public.venue_reports
  for select to authenticated
  using (public.is_admin());

-- Insert : tout authentifié peut signaler — c'est la RPC submit_venue_report
-- qui valide / dédupe (un user ne peut pas spammer un venue avec le même kind).
drop policy if exists "venue_reports_insert_authenticated" on public.venue_reports;
create policy "venue_reports_insert_authenticated" on public.venue_reports
  for insert to authenticated
  with check (reporter_id = auth.uid());

-- Update : admin uniquement (passage open → reviewing → resolved/rejected).
drop policy if exists "venue_reports_update_admin" on public.venue_reports;
create policy "venue_reports_update_admin" on public.venue_reports
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Delete : admin uniquement (rare — pour effacer du spam évident).
drop policy if exists "venue_reports_delete_admin" on public.venue_reports;
create policy "venue_reports_delete_admin" on public.venue_reports
  for delete to authenticated
  using (public.is_admin());

-- ----------------------------------------------------------------------------
-- 4) RPC : soumission validée par le serveur
--    Empêche le même user de re-signaler le même venue pour le même kind
--    quand il a déjà un report 'open' ou 'reviewing' actif.
-- ----------------------------------------------------------------------------

create or replace function public.submit_venue_report(
  p_venue_id     uuid,
  p_kind         text,
  p_details      text default null,
  p_duplicate_of uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_kind venue_report_kind;
  v_existing uuid;
  v_new_id uuid;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if p_venue_id is null then
    raise exception 'VENUE_REQUIRED';
  end if;
  -- Cast safe : l'enum valide les valeurs autorisées.
  begin
    v_kind := p_kind::venue_report_kind;
  exception when others then
    raise exception 'INVALID_KIND';
  end;
  if v_kind = 'duplicate' and p_duplicate_of is null then
    raise exception 'DUPLICATE_TARGET_REQUIRED';
  end if;
  if p_duplicate_of = p_venue_id then
    raise exception 'SELF_DUPLICATE';
  end if;

  -- Anti-spam : un seul report actif (open/reviewing) par (user, venue, kind).
  select id into v_existing
    from public.venue_reports
   where venue_id = p_venue_id
     and reporter_id = v_uid
     and kind = v_kind
     and status in ('open', 'reviewing')
   limit 1;
  if v_existing is not null then
    return jsonb_build_object(
      'ok', false,
      'reason', 'ALREADY_REPORTED',
      'report_id', v_existing
    );
  end if;

  insert into public.venue_reports (venue_id, reporter_id, kind, details, duplicate_of)
  values (p_venue_id, v_uid, v_kind, nullif(trim(coalesce(p_details, '')), ''), p_duplicate_of)
  returning id into v_new_id;

  return jsonb_build_object('ok', true, 'report_id', v_new_id);
end;
$$;

revoke execute on function public.submit_venue_report(uuid, text, text, uuid) from public;
grant execute on function public.submit_venue_report(uuid, text, text, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 5) RPC admin : queue avec compteur de signalements actifs par venue
--    Renvoie les reports ouverts joints à venue (name/cover/category) +
--    reporter (full_name) pour éviter au front /admin d'enchaîner les selects.
-- ----------------------------------------------------------------------------

create or replace function public.list_venue_reports(
  p_status text default 'open',
  p_limit  integer default 100
) returns table (
  id              uuid,
  venue_id        uuid,
  venue_name      text,
  venue_cover     text,
  venue_category  text,
  reporter_id     uuid,
  reporter_name   text,
  kind            venue_report_kind,
  details         text,
  duplicate_of    uuid,
  duplicate_name  text,
  status          venue_report_status,
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
    r.id, r.venue_id, v.name as venue_name, v.cover_url as venue_cover,
    v.category::text as venue_category,
    r.reporter_id, p.full_name as reporter_name,
    r.kind, r.details, r.duplicate_of, dv.name as duplicate_name,
    r.status, r.resolved_by, r.resolved_at, r.resolution_note, r.created_at
  from public.venue_reports r
  join public.venues v on v.id = r.venue_id
  left join public.profiles p on p.id = r.reporter_id
  left join public.venues dv on dv.id = r.duplicate_of
  where public.is_admin()
    and (p_status is null or p_status = 'all' or r.status::text = p_status)
  order by r.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

revoke execute on function public.list_venue_reports(text, integer) from public;
grant execute on function public.list_venue_reports(text, integer) to authenticated;

-- ----------------------------------------------------------------------------
-- 6) RPC admin : transition de statut (resolve / reject)
-- ----------------------------------------------------------------------------

create or replace function public.resolve_venue_report(
  p_report_id uuid,
  p_status    text,                -- 'resolved' | 'rejected' | 'reviewing'
  p_note      text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status venue_report_status;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  begin
    v_status := p_status::venue_report_status;
  exception when others then
    raise exception 'INVALID_STATUS';
  end;
  update public.venue_reports
     set status          = v_status,
         resolved_by     = case when v_status in ('resolved','rejected') then auth.uid() else resolved_by end,
         resolved_at     = case when v_status in ('resolved','rejected') then now()       else resolved_at end,
         resolution_note = coalesce(nullif(trim(coalesce(p_note, '')), ''), resolution_note)
   where id = p_report_id;
end;
$$;

revoke execute on function public.resolve_venue_report(uuid, text, text) from public;
grant execute on function public.resolve_venue_report(uuid, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 7) Vue agrégée : compteur de signalements actifs par venue
--    Sert au futur scoring qualité + à la fiche pro côté propriétaire.
-- ----------------------------------------------------------------------------

create or replace view public.venue_active_reports_count as
  select venue_id, count(*)::integer as active_reports
    from public.venue_reports
   where status in ('open', 'reviewing')
   group by venue_id;

comment on table public.venue_reports is
  'Signalements communautaires sur les venues. Soumis via submit_venue_report (anti-spam par (user, venue, kind)), traités par admin via resolve_venue_report.';
comment on function public.submit_venue_report is
  'Soumet un signalement. Empêche les doublons actifs (user, venue, kind). Retourne { ok, report_id, reason? }.';
comment on function public.list_venue_reports is
  'Queue admin des signalements (filtrable par statut). Retourne venue/reporter joints.';
comment on function public.resolve_venue_report is
  'Transition admin du statut d''un report (resolved/rejected/reviewing).';
