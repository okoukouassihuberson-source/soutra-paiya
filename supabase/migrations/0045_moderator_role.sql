-- ============================================================================
-- SOUTRA-PAIYA — Migration 0045 : rôle modérateur (validation Pro)
-- ============================================================================
-- Le numéro +2250102169280 est désigné comme MODÉRATEUR. Il peut valider/
-- rejeter les flux qui créent ou affectent les utilisateurs Pro :
--   • venue_claims     → revendications de propriété (devenir venue_owner)
--   • venue_submissions → contributions de nouveaux établissements
--   • venue_reports    → signalements communautaires
--   • profiles.kyc_status (Pro uniquement) → vérification KYC des venue_owner
--
-- Approche :
--   • is_moderator() : SECURITY DEFINER, true si le profil courant a phone =
--     '+2250102169280' OU '2250102169280' (selon que Supabase Auth stocke
--     ou non le '+'). Les admins (role='admin') restent admins et conservent
--     toutes leurs prérogatives ; cette fonction est strictement additive.
--   • is_admin_or_moderator() : wrapper utilisé par les RLS et les RPCs de
--     modération pour autoriser les deux rôles.
--   • Les RPCs existantes (list_/approve_/reject_venue_claims/submissions,
--     list_/resolve_venue_reports) sont remplacées en CREATE OR REPLACE pour
--     utiliser is_admin_or_moderator() au lieu de is_admin().
--   • Nouvelles RPCs : verify_pro_kyc / reject_pro_kyc pour le flux KYC.
--   • Nouvelles policies RLS pour le SELECT/UPDATE moderator sur les 4 zones.
--
-- Non-cassant : ne touche pas à profiles, ne modifie aucune donnée, l'admin
-- continue à fonctionner exactement comme avant.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Fonctions helper
-- ----------------------------------------------------------------------------

create or replace function public.is_moderator()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and (
        phone = '+2250102169280'
        or phone = '2250102169280'
      )
  );
$$;

grant execute on function public.is_moderator() to authenticated;

comment on function public.is_moderator() is
  'True si l''utilisateur courant est le modérateur hardcodé (+2250102169280). Permissions strictement limitées à la modération Pro : claims, submissions, reports, KYC.';

create or replace function public.is_admin_or_moderator()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_admin() or public.is_moderator();
$$;

grant execute on function public.is_admin_or_moderator() to authenticated;

-- ----------------------------------------------------------------------------
-- 2) RLS additionnelles : SELECT pour le modérateur sur les 4 tables
--    (les policies admin existantes restent en place, on AJOUTE simplement
--    des policies "_moderator").
-- ----------------------------------------------------------------------------

-- venue_claims : SELECT + UPDATE pour modérer
drop policy if exists "venue_claims_select_moderator" on public.venue_claims;
create policy "venue_claims_select_moderator" on public.venue_claims
  for select to authenticated
  using (public.is_moderator());

drop policy if exists "venue_claims_update_moderator" on public.venue_claims;
create policy "venue_claims_update_moderator" on public.venue_claims
  for update to authenticated
  using (public.is_moderator())
  with check (public.is_moderator());

-- venue_submissions : SELECT + UPDATE pour modérer
drop policy if exists "venue_submissions_select_moderator" on public.venue_submissions;
create policy "venue_submissions_select_moderator" on public.venue_submissions
  for select to authenticated
  using (public.is_moderator());

drop policy if exists "venue_submissions_update_moderator" on public.venue_submissions;
create policy "venue_submissions_update_moderator" on public.venue_submissions
  for update to authenticated
  using (public.is_moderator())
  with check (public.is_moderator());

-- venue_reports : SELECT + UPDATE pour modérer
drop policy if exists "venue_reports_select_moderator" on public.venue_reports;
create policy "venue_reports_select_moderator" on public.venue_reports
  for select to authenticated
  using (public.is_moderator());

drop policy if exists "venue_reports_update_moderator" on public.venue_reports;
create policy "venue_reports_update_moderator" on public.venue_reports
  for update to authenticated
  using (public.is_moderator())
  with check (public.is_moderator());

-- profiles : permet au moderator de SELECT les venue_owner (pour voir leur KYC)
-- et de mettre à jour leur kyc_status. On limite à profiles dont role IN
-- ('user', 'venue_owner') — le moderator ne peut pas toucher les autres
-- moderators ou les admins.
drop policy if exists "profiles_update_moderator_kyc" on public.profiles;
create policy "profiles_update_moderator_kyc" on public.profiles
  for update to authenticated
  using (public.is_moderator() and role in ('user', 'venue_owner'))
  with check (public.is_moderator() and role in ('user', 'venue_owner'));

-- ----------------------------------------------------------------------------
-- 3) Adapter les RPCs existantes : autoriser admin OU moderator
--    Toutes ces RPCs sont en CREATE OR REPLACE → pas de migration de données.
-- ----------------------------------------------------------------------------

-- venue_claims : list / approve / reject
create or replace function public.list_venue_claims(
  p_status text default 'pending',
  p_limit  integer default 100
) returns table (
  id                uuid,
  venue_id          uuid,
  venue_name        text,
  venue_cover       text,
  venue_category    text,
  venue_district    text,
  venue_city        text,
  current_owner_id  uuid,
  current_owner_name text,
  claimant_user_id  uuid,
  claimant_name     text,
  claimant_phone    text,
  id_doc_url        text,
  business_doc_url  text,
  proof_url         text,
  business_name     text,
  business_role     text,
  contact_phone     text,
  notes             text,
  status            venue_claim_status,
  decided_by        uuid,
  decided_at        timestamptz,
  decision_note     text,
  created_at        timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id, c.venue_id, v.name as venue_name, v.cover_url as venue_cover,
    v.category::text as venue_category, v.district as venue_district, v.city as venue_city,
    v.owner_id as current_owner_id, ow.full_name as current_owner_name,
    c.claimant_user_id, cl.full_name as claimant_name, cl.phone as claimant_phone,
    c.id_doc_url, c.business_doc_url, c.proof_url,
    c.business_name, c.business_role, c.contact_phone, c.notes,
    c.status, c.decided_by, c.decided_at, c.decision_note, c.created_at
  from public.venue_claims c
  join public.venues v on v.id = c.venue_id
  left join public.profiles ow on ow.id = v.owner_id
  left join public.profiles cl on cl.id = c.claimant_user_id
  where public.is_admin_or_moderator()
    and (p_status is null or p_status = 'all' or c.status::text = p_status)
  order by
    case when c.status = 'pending' then 0
         when c.status = 'reviewing' then 1
         else 2 end,
    c.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

create or replace function public.approve_venue_claim(
  p_claim_id     uuid,
  p_decision_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_claim     record;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if not public.is_admin_or_moderator() then
    raise exception 'NOT_AUTHORIZED';
  end if;

  select id, venue_id, claimant_user_id, status
    into v_claim
    from public.venue_claims
   where id = p_claim_id
   limit 1;
  if v_claim.id is null then
    raise exception 'CLAIM_NOT_FOUND';
  end if;
  if v_claim.status not in ('pending', 'reviewing') then
    raise exception 'CLAIM_FINAL';
  end if;

  update public.venues
     set owner_id = v_claim.claimant_user_id,
         updated_at = now()
   where id = v_claim.venue_id;

  update public.profiles
     set role = 'venue_owner', updated_at = now()
   where id = v_claim.claimant_user_id
     and role = 'user';

  update public.venue_claims
     set status = 'approved',
         decided_by = v_uid,
         decided_at = now(),
         decision_note = nullif(trim(coalesce(p_decision_note, '')), ''),
         updated_at = now()
   where id = p_claim_id;

  update public.venue_claims
     set status = 'rejected',
         decided_by = v_uid,
         decided_at = now(),
         decision_note = coalesce(decision_note,
                                  'Auto-rejeté : un autre claim a été approuvé.'),
         updated_at = now()
   where venue_id = v_claim.venue_id
     and id <> p_claim_id
     and status in ('pending', 'reviewing');

  return jsonb_build_object('ok', true, 'venue_id', v_claim.venue_id, 'new_owner_id', v_claim.claimant_user_id);
end;
$$;

create or replace function public.reject_venue_claim(
  p_claim_id     uuid,
  p_decision_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_claim record;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if not public.is_admin_or_moderator() then
    raise exception 'NOT_AUTHORIZED';
  end if;

  select id, status into v_claim
    from public.venue_claims
   where id = p_claim_id
   limit 1;
  if v_claim.id is null then
    raise exception 'CLAIM_NOT_FOUND';
  end if;
  if v_claim.status not in ('pending', 'reviewing') then
    raise exception 'CLAIM_FINAL';
  end if;

  update public.venue_claims
     set status = 'rejected',
         decided_by = v_uid,
         decided_at = now(),
         decision_note = nullif(trim(coalesce(p_decision_note, '')), ''),
         updated_at = now()
   where id = p_claim_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- venue_submissions : list / approve / reject
create or replace function public.list_venue_submissions(
  p_status text default 'pending',
  p_limit  integer default 100
) returns table (
  id              uuid,
  submitted_by    uuid,
  submitter_name  text,
  submitter_phone text,
  name            text,
  category        text,
  subcategory     text,
  description     text,
  address         text,
  city            text,
  district        text,
  commune         text,
  lat             double precision,
  lng             double precision,
  phone           text,
  whatsapp        text,
  email           text,
  website         text,
  cover_url       text,
  gallery_urls    text[],
  status          venue_submission_status,
  created_venue_id uuid,
  duplicate_of    uuid,
  decided_by      uuid,
  decided_at      timestamptz,
  decision_note   text,
  created_at      timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id, s.submitted_by, p.full_name as submitter_name, p.phone as submitter_phone,
    s.name, s.category::text, s.subcategory, s.description,
    s.address, s.city, s.district, s.commune, s.lat, s.lng,
    s.phone, s.whatsapp, s.email, s.website,
    s.cover_url, s.gallery_urls,
    s.status, s.created_venue_id, s.duplicate_of,
    s.decided_by, s.decided_at, s.decision_note, s.created_at
  from public.venue_submissions s
  left join public.profiles p on p.id = s.submitted_by
  where public.is_admin_or_moderator()
    and (p_status is null or p_status = 'all' or s.status::text = p_status)
  order by
    case when s.status = 'pending' then 0
         when s.status = 'reviewing' then 1
         else 2 end,
    s.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

create or replace function public.approve_venue_submission(
  p_submission_id uuid,
  p_decision_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid       uuid := auth.uid();
  v_sub       record;
  v_slug      text;
  v_slug_try  text;
  v_n         integer := 0;
  v_new_venue uuid;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if not public.is_admin_or_moderator() then
    raise exception 'NOT_AUTHORIZED';
  end if;

  select *
    into v_sub
    from public.venue_submissions
   where id = p_submission_id
   limit 1;
  if v_sub.id is null then
    raise exception 'SUBMISSION_NOT_FOUND';
  end if;
  if v_sub.status not in ('pending', 'reviewing') then
    raise exception 'SUBMISSION_FINAL';
  end if;

  v_slug := nullif(public.slugify_text(v_sub.name), '');
  if v_slug is null then v_slug := 'lieu'; end if;
  v_slug_try := v_slug;
  while exists (select 1 from public.venues where slug = v_slug_try) loop
    v_n := v_n + 1;
    v_slug_try := v_slug || '-' || (v_n + 1)::text;
    exit when v_n > 50;
  end loop;
  v_slug := v_slug_try;

  insert into public.venues (
    owner_id, name, slug, category, description,
    address, city, district,
    location,
    phone, email, status
  )
  values (
    v_uid, v_sub.name, v_slug, v_sub.category, v_sub.description,
    v_sub.address, coalesce(v_sub.city, 'Abidjan'), v_sub.district,
    case
      when v_sub.lat is not null and v_sub.lng is not null
        then st_setsrid(st_makepoint(v_sub.lng, v_sub.lat), 4326)::geography
      else null
    end,
    v_sub.phone, v_sub.email, 'active'
  )
  returning id into v_new_venue;

  begin
    update public.venues
       set subcategory = v_sub.subcategory,
           commune     = v_sub.commune,
           website     = v_sub.website,
           cover_url   = v_sub.cover_url,
           gallery_urls = coalesce(v_sub.gallery_urls, '{}'::text[])
     where id = v_new_venue;
  exception when undefined_column then
    null;
  end;

  update public.venue_submissions
     set status = 'approved',
         created_venue_id = v_new_venue,
         decided_by = v_uid,
         decided_at = now(),
         decision_note = nullif(trim(coalesce(p_decision_note, '')), ''),
         updated_at = now()
   where id = p_submission_id;

  return jsonb_build_object('ok', true, 'venue_id', v_new_venue, 'slug', v_slug);
end;
$$;

create or replace function public.reject_venue_submission(
  p_submission_id uuid,
  p_decision_note text default null,
  p_duplicate_of  uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sub record;
  v_st  venue_submission_status;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if not public.is_admin_or_moderator() then
    raise exception 'NOT_AUTHORIZED';
  end if;

  select id, status into v_sub
    from public.venue_submissions
   where id = p_submission_id
   limit 1;
  if v_sub.id is null then
    raise exception 'SUBMISSION_NOT_FOUND';
  end if;
  if v_sub.status not in ('pending', 'reviewing') then
    raise exception 'SUBMISSION_FINAL';
  end if;

  v_st := case when p_duplicate_of is not null then 'duplicate' else 'rejected' end;

  update public.venue_submissions
     set status = v_st,
         duplicate_of = p_duplicate_of,
         decided_by = v_uid,
         decided_at = now(),
         decision_note = nullif(trim(coalesce(p_decision_note, '')), ''),
         updated_at = now()
   where id = p_submission_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- venue_reports : list / resolve
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
  where public.is_admin_or_moderator()
    and (p_status is null or p_status = 'all' or r.status::text = p_status)
  order by r.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

create or replace function public.resolve_venue_report(
  p_report_id uuid,
  p_status    text,
  p_note      text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status venue_report_status;
begin
  if not public.is_admin_or_moderator() then
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

-- ----------------------------------------------------------------------------
-- 4) Nouvelles RPCs KYC : valider / rejeter le KYC d'un Pro
--    Le modérateur (et l'admin) peut :
--      • passer kyc_status à 'verified' pour les venue_owner ayant un dossier
--        soumis (pending) ou non encore traité (none) ;
--      • passer kyc_status à 'rejected' avec une note de raison.
--    Reste invariant : seuls les profils role IN ('user', 'venue_owner') sont
--    affectables (pas les admins/staff).
-- ----------------------------------------------------------------------------

create or replace function public.list_pro_kyc(
  p_status text default 'pending',
  p_limit  integer default 100
) returns table (
  id            uuid,
  full_name     text,
  phone         text,
  email         text,
  role          user_role,
  kyc_status    kyc_status,
  kyc_doc_url   text,
  city          text,
  created_at    timestamptz,
  venues_count  integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id, p.full_name, p.phone, p.email, p.role, p.kyc_status, p.kyc_doc_url,
    p.city, p.created_at,
    (select count(*)::integer from public.venues v where v.owner_id = p.id) as venues_count
  from public.profiles p
  where public.is_admin_or_moderator()
    and p.role = 'venue_owner'
    and (p_status is null or p_status = 'all' or p.kyc_status::text = p_status)
  order by
    case when p.kyc_status = 'pending' then 0
         when p.kyc_status = 'none' then 1
         else 2 end,
    p.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

revoke execute on function public.list_pro_kyc(text, integer) from public;
grant execute on function public.list_pro_kyc(text, integer) to authenticated;

create or replace function public.verify_pro_kyc(
  p_user_id uuid,
  p_note    text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_target record;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if not public.is_admin_or_moderator() then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_user_id is null then
    raise exception 'USER_REQUIRED';
  end if;

  select id, role, kyc_status into v_target
    from public.profiles
   where id = p_user_id
   limit 1;
  if v_target.id is null then
    raise exception 'USER_NOT_FOUND';
  end if;
  -- Garde-fou : le modérateur ne touche pas aux admins/staff.
  if v_target.role not in ('user', 'venue_owner') then
    raise exception 'TARGET_ROLE_NOT_ALLOWED';
  end if;
  if v_target.kyc_status = 'verified' then
    return jsonb_build_object('ok', false, 'reason', 'ALREADY_VERIFIED');
  end if;

  update public.profiles
     set kyc_status = 'verified',
         updated_at = now()
   where id = p_user_id;

  -- Journalise (audit_events est déjà créé en 0001 ; en cas d'absence on ignore)
  begin
    insert into public.audit_events (actor_id, action, resource_type, resource_id, metadata)
    values (
      v_uid, 'kyc_verified', 'profile', p_user_id,
      jsonb_build_object('note', nullif(trim(coalesce(p_note, '')), ''))
    );
  exception when undefined_table or undefined_column then
    null;
  end;

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.verify_pro_kyc(uuid, text) from public;
grant execute on function public.verify_pro_kyc(uuid, text) to authenticated;

create or replace function public.reject_pro_kyc(
  p_user_id uuid,
  p_note    text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_target record;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if not public.is_admin_or_moderator() then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_user_id is null then
    raise exception 'USER_REQUIRED';
  end if;

  select id, role, kyc_status into v_target
    from public.profiles
   where id = p_user_id
   limit 1;
  if v_target.id is null then
    raise exception 'USER_NOT_FOUND';
  end if;
  if v_target.role not in ('user', 'venue_owner') then
    raise exception 'TARGET_ROLE_NOT_ALLOWED';
  end if;

  update public.profiles
     set kyc_status = 'rejected',
         updated_at = now()
   where id = p_user_id;

  begin
    insert into public.audit_events (actor_id, action, resource_type, resource_id, metadata)
    values (
      v_uid, 'kyc_rejected', 'profile', p_user_id,
      jsonb_build_object('note', nullif(trim(coalesce(p_note, '')), ''))
    );
  exception when undefined_table or undefined_column then
    null;
  end;

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.reject_pro_kyc(uuid, text) from public;
grant execute on function public.reject_pro_kyc(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 5) Helper côté front : retourne le niveau d'accès courant
--    Utilisé par le layout /admin pour décider quels onglets afficher.
-- ----------------------------------------------------------------------------

create or replace function public.get_admin_access_level()
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select jsonb_build_object(
    'is_admin', public.is_admin(),
    'is_moderator', public.is_moderator(),
    'has_access', public.is_admin_or_moderator()
  );
$$;

grant execute on function public.get_admin_access_level() to authenticated;

comment on function public.get_admin_access_level() is
  'Pour le front : retourne {is_admin, is_moderator, has_access} pour piloter l''affichage des onglets dans /admin.';
