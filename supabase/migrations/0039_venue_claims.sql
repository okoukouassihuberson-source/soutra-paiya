-- ============================================================================
-- SOUTRA-PAIYA — Migration 0039 : revendications propriétaire + KYC pro (PR 8/10 Découverte)
-- ============================================================================
-- Permet à un utilisateur de revendiquer la propriété d'un établissement
-- (typiquement : un venue sans owner ou avec owner inactif → seed admin, ou
-- venue ajouté par la communauté). Le claim inclut un dossier KYC pro :
--   • justificatif d'identité (CNI / passeport)
--   • justificatif d'activité (registre de commerce, facture, etc.)
--   • optionnel : preuve complémentaire (photo de la devanture avec un mot)
--
-- À l'approbation par un admin :
--   • venues.owner_id devient le claimant_user_id (atomique)
--   • profiles.role passe à 'venue_owner' si l'utilisateur était 'user'
--   • le claim est marqué 'approved' avec decided_by/decided_at
--
-- Non-cassant : ne modifie aucune table existante.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Enum des statuts de revendication
-- ----------------------------------------------------------------------------

do $$ begin
  create type venue_claim_status as enum (
    'pending',         -- soumis, en attente de revue admin
    'reviewing',       -- admin a commencé l'examen (KYC en cours)
    'approved',        -- claim accepté, owner_id mis à jour
    'rejected',        -- claim refusé (dossier invalide, mauvaise foi, etc.)
    'cancelled'        -- annulé par le claimant lui-même avant décision
  );
exception when duplicate_object then null;
end $$;

-- ----------------------------------------------------------------------------
-- 2) Table principale
-- ----------------------------------------------------------------------------

create table if not exists public.venue_claims (
  id                  uuid primary key default gen_random_uuid(),
  venue_id            uuid not null references public.venues(id) on delete cascade,
  claimant_user_id    uuid not null references public.profiles(id) on delete cascade,
  -- Documents KYC (URLs Supabase Storage — bucket `kyc` privé recommandé)
  id_doc_url          text,                       -- pièce d'identité
  business_doc_url    text,                       -- registre de commerce / preuve d'activité
  proof_url           text,                       -- preuve complémentaire optionnelle
  -- Infos déclaratives
  business_name       text,                       -- nom de l'entité légale (ex : "SARL X")
  business_role       text,                       -- rôle du claimant (gérant, propriétaire…)
  contact_phone       text,                       -- téléphone à rappeler
  notes               text check (notes is null or length(notes) <= 2000),
  -- Workflow
  status              venue_claim_status not null default 'pending',
  decided_by          uuid references public.profiles(id),
  decided_at          timestamptz,
  decision_note       text check (decision_note is null or length(decision_note) <= 2000),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Un claim actif (pending/reviewing) par (venue, user) — évite les doublons.
create unique index if not exists uq_venue_claims_active_per_user
  on public.venue_claims(venue_id, claimant_user_id)
  where status in ('pending', 'reviewing');

create index if not exists idx_venue_claims_status_recent
  on public.venue_claims(status, created_at desc);

create index if not exists idx_venue_claims_claimant
  on public.venue_claims(claimant_user_id, created_at desc);

create index if not exists idx_venue_claims_venue
  on public.venue_claims(venue_id, created_at desc);

-- Trigger updated_at
create or replace function public.tg_venue_claims_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_venue_claims_updated_at on public.venue_claims;
create trigger trg_venue_claims_updated_at
  before update on public.venue_claims
  for each row execute function public.tg_venue_claims_set_updated_at();

-- ----------------------------------------------------------------------------
-- 3) RLS
-- ----------------------------------------------------------------------------

alter table public.venue_claims enable row level security;

-- Le claimant voit ses propres demandes.
drop policy if exists "venue_claims_select_owner" on public.venue_claims;
create policy "venue_claims_select_owner" on public.venue_claims
  for select to authenticated
  using (claimant_user_id = auth.uid());

-- L'admin voit tout.
drop policy if exists "venue_claims_select_admin" on public.venue_claims;
create policy "venue_claims_select_admin" on public.venue_claims
  for select to authenticated
  using (public.is_admin());

-- Insert : via la RPC submit_venue_claim (security definer) — pas d'insert direct.
-- On laisse quand même la policy pour debug, restreinte au claimant lui-même.
drop policy if exists "venue_claims_insert_authenticated" on public.venue_claims;
create policy "venue_claims_insert_authenticated" on public.venue_claims
  for insert to authenticated
  with check (claimant_user_id = auth.uid());

-- Update : claimant peut canceller son claim tant qu'il est pending ; admin peut tout.
drop policy if exists "venue_claims_update_admin" on public.venue_claims;
create policy "venue_claims_update_admin" on public.venue_claims
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "venue_claims_update_self_cancel" on public.venue_claims;
create policy "venue_claims_update_self_cancel" on public.venue_claims
  for update to authenticated
  using (claimant_user_id = auth.uid() and status in ('pending', 'reviewing'))
  with check (claimant_user_id = auth.uid() and status = 'cancelled');

-- Delete : admin uniquement (cas extrême — purge de spam).
drop policy if exists "venue_claims_delete_admin" on public.venue_claims;
create policy "venue_claims_delete_admin" on public.venue_claims
  for delete to authenticated
  using (public.is_admin());

-- ----------------------------------------------------------------------------
-- 4) RPC : soumission d'un claim
--    Vérifie :
--      • venue existe et est actif
--      • claimant n'a pas déjà un claim actif sur ce venue
--      • le venue n'est pas déjà revendiqué par un owner réel (≠ seed admin)
--    Retourne { ok, claim_id } ou { ok:false, reason }.
-- ----------------------------------------------------------------------------

create or replace function public.submit_venue_claim(
  p_venue_id         uuid,
  p_id_doc_url       text default null,
  p_business_doc_url text default null,
  p_proof_url        text default null,
  p_business_name    text default null,
  p_business_role    text default null,
  p_contact_phone    text default null,
  p_notes            text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid           uuid := auth.uid();
  v_venue         record;
  v_owner_role    user_role;
  v_existing      uuid;
  v_new_id        uuid;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if p_venue_id is null then
    raise exception 'VENUE_REQUIRED';
  end if;

  -- Le venue doit exister et être visible (actif).
  select id, owner_id, status, name
    into v_venue
    from public.venues
   where id = p_venue_id
   limit 1;
  if v_venue.id is null then
    raise exception 'VENUE_NOT_FOUND';
  end if;
  if v_venue.status <> 'active' then
    raise exception 'VENUE_NOT_ACTIVE';
  end if;

  -- Le claimant ne peut pas revendiquer un venue qu'il possède déjà.
  if v_venue.owner_id = v_uid then
    return jsonb_build_object('ok', false, 'reason', 'ALREADY_OWNER');
  end if;

  -- Anti-spam : un claim actif (pending/reviewing) par (user, venue).
  select id into v_existing
    from public.venue_claims
   where venue_id = p_venue_id
     and claimant_user_id = v_uid
     and status in ('pending', 'reviewing')
   limit 1;
  if v_existing is not null then
    return jsonb_build_object(
      'ok', false,
      'reason', 'ALREADY_PENDING',
      'claim_id', v_existing
    );
  end if;

  insert into public.venue_claims (
    venue_id, claimant_user_id,
    id_doc_url, business_doc_url, proof_url,
    business_name, business_role, contact_phone, notes
  )
  values (
    p_venue_id, v_uid,
    nullif(trim(coalesce(p_id_doc_url, '')), ''),
    nullif(trim(coalesce(p_business_doc_url, '')), ''),
    nullif(trim(coalesce(p_proof_url, '')), ''),
    nullif(trim(coalesce(p_business_name, '')), ''),
    nullif(trim(coalesce(p_business_role, '')), ''),
    nullif(trim(coalesce(p_contact_phone, '')), ''),
    nullif(trim(coalesce(p_notes, '')), '')
  )
  returning id into v_new_id;

  return jsonb_build_object('ok', true, 'claim_id', v_new_id);
end;
$$;

revoke execute on function public.submit_venue_claim(uuid, text, text, text, text, text, text, text) from public;
grant execute on function public.submit_venue_claim(uuid, text, text, text, text, text, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 5) RPC : annulation d'un claim par le claimant
-- ----------------------------------------------------------------------------

create or replace function public.cancel_venue_claim(p_claim_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_claim record;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  select id, claimant_user_id, status
    into v_claim
    from public.venue_claims
   where id = p_claim_id
   limit 1;
  if v_claim.id is null then
    raise exception 'CLAIM_NOT_FOUND';
  end if;
  if v_claim.claimant_user_id <> v_uid then
    raise exception 'NOT_OWNER_OF_CLAIM';
  end if;
  if v_claim.status not in ('pending', 'reviewing') then
    raise exception 'CLAIM_FINAL';
  end if;

  update public.venue_claims
     set status = 'cancelled', updated_at = now()
   where id = p_claim_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.cancel_venue_claim(uuid) from public;
grant execute on function public.cancel_venue_claim(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 6) RPC admin : liste des claims pour la queue
-- ----------------------------------------------------------------------------

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
  where public.is_admin()
    and (p_status is null or p_status = 'all' or c.status::text = p_status)
  order by
    case when c.status = 'pending' then 0
         when c.status = 'reviewing' then 1
         else 2 end,
    c.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

revoke execute on function public.list_venue_claims(text, integer) from public;
grant execute on function public.list_venue_claims(text, integer) to authenticated;

-- ----------------------------------------------------------------------------
-- 7) RPC admin : approbation d'un claim (transaction atomique)
--    • Vérifie que le caller est admin
--    • Met à jour venues.owner_id ← claimant_user_id
--    • Si profile.role = 'user', le passe à 'venue_owner'
--    • Marque le claim 'approved'
--    • Marque automatiquement les autres claims actifs sur le même venue
--      comme 'rejected' (un seul peut gagner)
-- ----------------------------------------------------------------------------

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
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
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

  -- Transfert de propriété atomique.
  update public.venues
     set owner_id = v_claim.claimant_user_id,
         updated_at = now()
   where id = v_claim.venue_id;

  -- Promotion du rôle si simple user.
  update public.profiles
     set role = 'venue_owner', updated_at = now()
   where id = v_claim.claimant_user_id
     and role = 'user';

  -- Marque ce claim approuvé.
  update public.venue_claims
     set status = 'approved',
         decided_by = v_uid,
         decided_at = now(),
         decision_note = nullif(trim(coalesce(p_decision_note, '')), ''),
         updated_at = now()
   where id = p_claim_id;

  -- Tous les autres claims actifs sur le même venue → rejected automatiquement.
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

revoke execute on function public.approve_venue_claim(uuid, text) from public;
grant execute on function public.approve_venue_claim(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 8) RPC admin : rejet d'un claim
-- ----------------------------------------------------------------------------

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
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
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

revoke execute on function public.reject_venue_claim(uuid, text) from public;
grant execute on function public.reject_venue_claim(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 9) RPC : statut de revendication pour un venue donné (utilisé par mobile)
--    Retourne { claimable, has_real_owner, my_claim_id, my_claim_status }
--    pour décider l'affichage du bouton "Revendiquer".
-- ----------------------------------------------------------------------------

create or replace function public.get_venue_claim_status(p_venue_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_owner   uuid;
  v_status  venue_status;
  v_my_id   uuid;
  v_my_st   venue_claim_status;
begin
  select owner_id, status into v_owner, v_status
    from public.venues
   where id = p_venue_id
   limit 1;
  if v_status is null then
    return jsonb_build_object('claimable', false, 'reason', 'NOT_FOUND');
  end if;

  if v_uid is not null then
    select id, status into v_my_id, v_my_st
      from public.venue_claims
     where venue_id = p_venue_id
       and claimant_user_id = v_uid
     order by created_at desc
     limit 1;
  end if;

  return jsonb_build_object(
    'claimable', (v_status = 'active' and (v_uid is null or v_owner <> v_uid)),
    'has_owner', v_owner is not null,
    'my_claim_id', v_my_id,
    'my_claim_status', v_my_st::text
  );
end;
$$;

grant execute on function public.get_venue_claim_status(uuid) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 10) Commentaires de documentation
-- ----------------------------------------------------------------------------

comment on table public.venue_claims is
  'Revendications de propriété d''un venue par un utilisateur (avec KYC pro). Workflow pending → approved/rejected/cancelled.';
comment on function public.submit_venue_claim is
  'Soumet une revendication. Anti-spam : un seul claim actif par (user, venue).';
comment on function public.approve_venue_claim is
  'Approuve atomiquement : venues.owner_id ← claimant + profiles.role → venue_owner + auto-reject autres claims du même venue.';
comment on function public.list_venue_claims is
  'Queue admin des claims, triée pending d''abord puis date desc.';
comment on function public.get_venue_claim_status is
  'État de revendication d''un venue côté mobile : bouton "Revendiquer" visible ou non.';
