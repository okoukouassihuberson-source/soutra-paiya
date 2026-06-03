-- ============================================================================
-- SOUTRA-PAIYA — Migration 0040 : contributions communautaires (PR 9/10 Découverte)
-- ============================================================================
-- Permet à n'importe quel utilisateur authentifié d'ajouter un nouveau lieu
-- à la base. Les contributions arrivent dans une queue de modération admin :
-- approbation → création réelle d'un venue ; rejet → archivage.
--
-- Workflow :
--   1. User remplit le formulaire mobile (`/add-venue`)
--   2. RPC submit_venue_submission → ligne dans venue_submissions (status pending)
--   3. Admin voit la queue dans /admin?tab=submissions
--   4. Approuver → insert public.venues + lien submission.created_venue_id
--   5. Rejeter → status='rejected' avec decision_note
--
-- Non-cassant : aucune modification de la table venues existante. La création
-- côté approbation utilise les colonnes standards déjà présentes.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Enum des statuts
-- ----------------------------------------------------------------------------

do $$ begin
  create type venue_submission_status as enum (
    'pending',         -- soumis, en attente
    'reviewing',       -- admin a commencé l'examen
    'approved',        -- validé → venue créé
    'rejected',        -- refusé (incomplet, doublon, hors-périmètre…)
    'duplicate'        -- doublon d'un venue existant
  );
exception when duplicate_object then null;
end $$;

-- ----------------------------------------------------------------------------
-- 2) Table principale
-- ----------------------------------------------------------------------------

create table if not exists public.venue_submissions (
  id                  uuid primary key default gen_random_uuid(),
  submitted_by        uuid not null references public.profiles(id) on delete cascade,
  -- Données déclaratives
  name                text not null check (length(trim(name)) between 2 and 200),
  category            venue_category not null,
  subcategory         text,
  description         text check (description is null or length(description) <= 2000),
  address             text not null check (length(trim(address)) between 4 and 400),
  city                text not null default 'Abidjan',
  district            text,
  commune             text,
  lat                 double precision,
  lng                 double precision,
  phone               text,
  whatsapp            text,
  email               text,
  website             text,
  cover_url           text,
  gallery_urls        text[] default '{}',
  -- Workflow
  status              venue_submission_status not null default 'pending',
  created_venue_id    uuid references public.venues(id) on delete set null,
  duplicate_of        uuid references public.venues(id) on delete set null,
  decided_by          uuid references public.profiles(id),
  decided_at          timestamptz,
  decision_note       text check (decision_note is null or length(decision_note) <= 2000),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Un submitter ne peut avoir qu'un seul brouillon actif (pending/reviewing)
-- avec le même `name + address` — anti-spam basique.
create unique index if not exists uq_venue_submissions_active_name_addr
  on public.venue_submissions(lower(name), lower(address))
  where status in ('pending', 'reviewing');

create index if not exists idx_venue_submissions_status_recent
  on public.venue_submissions(status, created_at desc);

create index if not exists idx_venue_submissions_submitter
  on public.venue_submissions(submitted_by, created_at desc);

-- Trigger updated_at
create or replace function public.tg_venue_submissions_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_venue_submissions_updated_at on public.venue_submissions;
create trigger trg_venue_submissions_updated_at
  before update on public.venue_submissions
  for each row execute function public.tg_venue_submissions_set_updated_at();

-- ----------------------------------------------------------------------------
-- 3) RLS
-- ----------------------------------------------------------------------------

alter table public.venue_submissions enable row level security;

-- Submitter voit ses propres contributions.
drop policy if exists "venue_submissions_select_submitter" on public.venue_submissions;
create policy "venue_submissions_select_submitter" on public.venue_submissions
  for select to authenticated
  using (submitted_by = auth.uid());

-- Admin voit tout.
drop policy if exists "venue_submissions_select_admin" on public.venue_submissions;
create policy "venue_submissions_select_admin" on public.venue_submissions
  for select to authenticated
  using (public.is_admin());

-- Insert : via RPC. Policy quand même au cas où, restreinte au submitter.
drop policy if exists "venue_submissions_insert_authenticated" on public.venue_submissions;
create policy "venue_submissions_insert_authenticated" on public.venue_submissions
  for insert to authenticated
  with check (submitted_by = auth.uid());

-- Update : admin tout / submitter peut éditer son brouillon tant que pending.
drop policy if exists "venue_submissions_update_admin" on public.venue_submissions;
create policy "venue_submissions_update_admin" on public.venue_submissions
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "venue_submissions_update_self_pending" on public.venue_submissions;
create policy "venue_submissions_update_self_pending" on public.venue_submissions
  for update to authenticated
  using (submitted_by = auth.uid() and status = 'pending')
  with check (submitted_by = auth.uid() and status in ('pending', 'rejected'));

-- Delete : admin uniquement.
drop policy if exists "venue_submissions_delete_admin" on public.venue_submissions;
create policy "venue_submissions_delete_admin" on public.venue_submissions
  for delete to authenticated
  using (public.is_admin());

-- ----------------------------------------------------------------------------
-- 4) Helper : slug-ify un nom
--    On garde la fonction publique car re-utile ailleurs si besoin.
--    `unaccent_or_lower` est défini AVANT `slugify_text` car ce dernier est
--    en `language sql` (référence résolue à la création, pas à l'appel).
-- ----------------------------------------------------------------------------

-- unaccent peut ne pas être installé partout — fallback lowercase si manquant.
create or replace function public.unaccent_or_lower(p_text text)
returns text
language plpgsql
immutable
set search_path = public
as $$
begin
  begin
    -- Cast au cas où la fonction unaccent existe dans le schéma public ou extensions.
    return public.unaccent(p_text);
  exception when undefined_function then
    return lower(coalesce(p_text, ''));
  end;
end;
$$;

create or replace function public.slugify_text(p_text text)
returns text
language sql
immutable
set search_path = public
as $$
  -- Lowercase + remove accents + replace non-alphanum with '-'
  select trim(both '-' from
    regexp_replace(
      lower(public.unaccent_or_lower(coalesce(p_text, ''))),
      '[^a-z0-9]+', '-', 'g'
    )
  );
$$;

-- ----------------------------------------------------------------------------
-- 5) RPC : soumission d'une contribution
-- ----------------------------------------------------------------------------

create or replace function public.submit_venue_submission(
  p_name         text,
  p_category     text,
  p_address      text,
  p_subcategory  text default null,
  p_description  text default null,
  p_city         text default 'Abidjan',
  p_district     text default null,
  p_commune      text default null,
  p_lat          double precision default null,
  p_lng          double precision default null,
  p_phone        text default null,
  p_whatsapp     text default null,
  p_email        text default null,
  p_website      text default null,
  p_cover_url    text default null,
  p_gallery_urls text[] default '{}'::text[]
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_cat       venue_category;
  v_existing  uuid;
  v_new_id    uuid;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if length(trim(coalesce(p_name, ''))) < 2 then
    raise exception 'NAME_REQUIRED';
  end if;
  if length(trim(coalesce(p_address, ''))) < 4 then
    raise exception 'ADDRESS_REQUIRED';
  end if;

  begin
    v_cat := p_category::venue_category;
  exception when others then
    raise exception 'INVALID_CATEGORY';
  end;

  -- Anti-doublon : si même nom + adresse en cours, retourne l'id existant.
  select id into v_existing
    from public.venue_submissions
   where lower(name) = lower(trim(p_name))
     and lower(address) = lower(trim(p_address))
     and status in ('pending', 'reviewing')
   limit 1;
  if v_existing is not null then
    return jsonb_build_object('ok', false, 'reason', 'ALREADY_SUBMITTED', 'submission_id', v_existing);
  end if;

  insert into public.venue_submissions (
    submitted_by, name, category, subcategory, description,
    address, city, district, commune, lat, lng,
    phone, whatsapp, email, website,
    cover_url, gallery_urls
  )
  values (
    v_uid, trim(p_name), v_cat,
    nullif(trim(coalesce(p_subcategory, '')), ''),
    nullif(trim(coalesce(p_description, '')), ''),
    trim(p_address),
    coalesce(nullif(trim(coalesce(p_city, '')), ''), 'Abidjan'),
    nullif(trim(coalesce(p_district, '')), ''),
    nullif(trim(coalesce(p_commune, '')), ''),
    p_lat, p_lng,
    nullif(trim(coalesce(p_phone, '')), ''),
    nullif(trim(coalesce(p_whatsapp, '')), ''),
    nullif(trim(coalesce(p_email, '')), ''),
    nullif(trim(coalesce(p_website, '')), ''),
    nullif(trim(coalesce(p_cover_url, '')), ''),
    coalesce(p_gallery_urls, '{}'::text[])
  )
  returning id into v_new_id;

  return jsonb_build_object('ok', true, 'submission_id', v_new_id);
end;
$$;

revoke execute on function public.submit_venue_submission(text, text, text, text, text, text, text, text, double precision, double precision, text, text, text, text, text, text[]) from public;
grant execute on function public.submit_venue_submission(text, text, text, text, text, text, text, text, double precision, double precision, text, text, text, text, text, text[]) to authenticated;

-- ----------------------------------------------------------------------------
-- 6) RPC admin : queue des contributions
-- ----------------------------------------------------------------------------

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
  where public.is_admin()
    and (p_status is null or p_status = 'all' or s.status::text = p_status)
  order by
    case when s.status = 'pending' then 0
         when s.status = 'reviewing' then 1
         else 2 end,
    s.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

revoke execute on function public.list_venue_submissions(text, integer) from public;
grant execute on function public.list_venue_submissions(text, integer) to authenticated;

-- ----------------------------------------------------------------------------
-- 7) RPC admin : approuver = créer le venue réel
--    Le venue est créé avec owner_id = admin (pour pouvoir éditer ensuite),
--    status='active', slug auto-généré et unique.
--    Si la submission a lat/lng, on alimente venues.location.
-- ----------------------------------------------------------------------------

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
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
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

  -- Slug unique : base = slugify(name), suffixe -2 / -3 si conflit.
  v_slug := nullif(public.slugify_text(v_sub.name), '');
  if v_slug is null then v_slug := 'lieu'; end if;
  v_slug_try := v_slug;
  while exists (select 1 from public.venues where slug = v_slug_try) loop
    v_n := v_n + 1;
    v_slug_try := v_slug || '-' || (v_n + 1)::text;
    exit when v_n > 50; -- safety
  end loop;
  v_slug := v_slug_try;

  -- Création du venue. owner_id = admin courant ; le futur propriétaire
  -- revendiquera via venue_claims (PR 8).
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

  -- Mise à jour des colonnes étendues (migrations 0033/0013 — peuvent
  -- ne pas exister sur de très anciens projets, on protège avec un check).
  begin
    update public.venues
       set subcategory = v_sub.subcategory,
           commune     = v_sub.commune,
           website     = v_sub.website,
           cover_url   = v_sub.cover_url,
           gallery_urls = coalesce(v_sub.gallery_urls, '{}'::text[])
     where id = v_new_venue;
  exception when undefined_column then
    -- Migration 0033 pas encore appliquée — silencieux.
    null;
  end;

  -- Marque la submission comme approuvée.
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

revoke execute on function public.approve_venue_submission(uuid, text) from public;
grant execute on function public.approve_venue_submission(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 8) RPC admin : rejet (avec sous-statut 'rejected' ou 'duplicate')
-- ----------------------------------------------------------------------------

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
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
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

revoke execute on function public.reject_venue_submission(uuid, text, uuid) from public;
grant execute on function public.reject_venue_submission(uuid, text, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 9) RPC : "mes contributions" — historique côté mobile
-- ----------------------------------------------------------------------------

create or replace function public.list_my_venue_submissions(p_limit integer default 50)
returns table (
  id               uuid,
  name             text,
  category         text,
  address          text,
  status           venue_submission_status,
  created_venue_id uuid,
  decision_note    text,
  created_at       timestamptz,
  decided_at       timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select s.id, s.name, s.category::text, s.address, s.status,
         s.created_venue_id, s.decision_note, s.created_at, s.decided_at
    from public.venue_submissions s
   where s.submitted_by = auth.uid()
   order by s.created_at desc
   limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

grant execute on function public.list_my_venue_submissions(integer) to authenticated;

-- ----------------------------------------------------------------------------
-- 10) Commentaires de documentation
-- ----------------------------------------------------------------------------

comment on table public.venue_submissions is
  'Contributions communautaires : nouveaux lieux soumis par les users, en attente de validation admin.';
comment on function public.submit_venue_submission is
  'Soumet une nouvelle contribution. Anti-doublon par (name + address) en lower-case.';
comment on function public.approve_venue_submission is
  'Approuve atomiquement : crée le venue (slug unique) + lien la submission.';
comment on function public.reject_venue_submission is
  'Rejette avec note ; si duplicate_of fourni, sous-statut duplicate.';
comment on function public.list_my_venue_submissions is
  'Historique des contributions de l''utilisateur courant.';
