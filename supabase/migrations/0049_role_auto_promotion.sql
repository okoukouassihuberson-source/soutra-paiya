-- ============================================================================
-- SOUTRA-PAIYA — Migration 0049
-- Auto-promotion du rôle profil + RPC has_pro_access
-- ============================================================================
-- Contexte (audit Phase 16) :
--   Bug "Espace Gérant invisible sur certains comptes" : profile.tsx gate la
--   carte sur profiles.role ∈ ('venue_owner','staff','organizer','admin'),
--   mais ce rôle n'est promu QUE lors d'un claim approuvé admin (mig 0039).
--   Tout owner désigné autrement (seed, assignation directe, restore) garde
--   role='user' → carte cachée → ne peut pas atteindre /pro depuis l'UI.
--
-- Cette migration :
--   1) Trigger AFTER INSERT/UPDATE OF owner_id ON venues qui auto-promote
--      profiles.role 'user' → 'venue_owner' (n'écrase jamais admin/staff/
--      organizer).
--   2) Trigger AFTER INSERT ON events qui auto-promote 'user' → 'organizer'.
--   3) RPC has_pro_access() : true si user owns au moins 1 venue OU organize
--      au moins 1 event OU role pro. Utilisé côté mobile comme source de
--      vérité au lieu de profile.role (défense en profondeur si trigger pas
--      encore propagé / cache stale).
--   4) Backfill des owners/organizers existants (mise à jour idempotente).
--
-- Compatibilité migration 0004 (protect_profile_role) :
--   Le trigger SECURITY DEFINER pose le GUC `app.allow_role_promotion = on`
--   en LOCAL avant l'UPDATE, puis le trigger 0004 voit ce GUC et autorise
--   spécifiquement la transition. Le GUC retombe à la fin de la txn (LOCAL).
--   Le rôle 'admin' reste exclusivement attribuable par un admin existant.
--
-- Non-cassant : ne supprime aucune fonctionnalité, ne modifie aucune table
-- existante, ne supprime aucune ligne.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Patch du trigger 0004 : tolère la promotion via GUC explicite
-- ----------------------------------------------------------------------------

create or replace function public.tg_protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allow_promotion text;
begin
  if new.role is distinct from old.role then
    -- Service role / SQL direct (auth.uid() null) : autorisé.
    if auth.uid() is null then
      return new;
    end if;

    -- Admin : autorisé (toutes transitions).
    if public.is_admin() then
      return new;
    end if;

    -- Promotion système autorisée :
    -- déclenchée par tg_promote_to_venue_owner ou tg_promote_to_organizer
    -- qui positionnent `set local app.allow_role_promotion = 'on'`.
    -- Seules les cibles 'venue_owner' et 'organizer' sont concernées —
    -- jamais 'admin' ni 'staff' (qui restent admin-only).
    v_allow_promotion := coalesce(
      current_setting('app.allow_role_promotion', true),
      'off'
    );
    if v_allow_promotion = 'on'
       and new.role in ('venue_owner', 'organizer')
       and old.role = 'user'
    then
      return new;
    end if;

    raise exception
      'Modification du rôle non autorisée (% -> %).', old.role, new.role
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2) Trigger : INSERT/UPDATE OF owner_id ON venues → promote venue_owner
-- ----------------------------------------------------------------------------

create or replace function public.tg_promote_to_venue_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_role user_role;
begin
  if new.owner_id is null then
    return new;
  end if;

  select role into v_current_role
    from profiles
    where id = new.owner_id;

  -- Seuls les comptes 'user' sont promus. On ne dégrade jamais un admin /
  -- staff / organizer / venue_owner déjà existant.
  if v_current_role = 'user' then
    set local app.allow_role_promotion = 'on';
    update profiles
       set role = 'venue_owner',
           updated_at = now()
     where id = new.owner_id
       and role = 'user';
  end if;

  return new;
end;
$$;

drop trigger if exists promote_to_venue_owner_on_insert on public.venues;
create trigger promote_to_venue_owner_on_insert
  after insert on public.venues
  for each row execute function public.tg_promote_to_venue_owner();

drop trigger if exists promote_to_venue_owner_on_update on public.venues;
create trigger promote_to_venue_owner_on_update
  after update of owner_id on public.venues
  for each row
  when (new.owner_id is distinct from old.owner_id)
  execute function public.tg_promote_to_venue_owner();

-- ----------------------------------------------------------------------------
-- 3) Trigger : INSERT ON events → promote organizer
-- ----------------------------------------------------------------------------

create or replace function public.tg_promote_to_organizer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_role user_role;
begin
  if new.organizer_id is null then
    return new;
  end if;

  select role into v_current_role
    from profiles
    where id = new.organizer_id;

  if v_current_role = 'user' then
    set local app.allow_role_promotion = 'on';
    update profiles
       set role = 'organizer',
           updated_at = now()
     where id = new.organizer_id
       and role = 'user';
  end if;

  return new;
end;
$$;

drop trigger if exists promote_to_organizer_on_insert on public.events;
create trigger promote_to_organizer_on_insert
  after insert on public.events
  for each row execute function public.tg_promote_to_organizer();

-- ----------------------------------------------------------------------------
-- 4) RPC : has_pro_access — source de vérité pour révéler l'espace pro
-- ----------------------------------------------------------------------------

create or replace function public.has_pro_access(p_user_id uuid default null)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_role user_role;
  v_has_venue boolean;
  v_has_event boolean;
begin
  v_uid := coalesce(p_user_id, auth.uid());
  if v_uid is null then
    return false;
  end if;

  -- 1) Rôle pro explicite.
  select role into v_role from profiles where id = v_uid;
  if v_role in ('venue_owner', 'staff', 'organizer', 'admin') then
    return true;
  end if;

  -- 2) Possède au moins un venue.
  select exists(
    select 1 from venues
    where owner_id = v_uid
  ) into v_has_venue;
  if v_has_venue then
    return true;
  end if;

  -- 3) Organise au moins un event.
  select exists(
    select 1 from events
    where organizer_id = v_uid
  ) into v_has_event;
  return v_has_event;
end;
$$;

grant execute on function public.has_pro_access(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 5) Backfill : aligner les comptes existants
-- ----------------------------------------------------------------------------
-- Owners de venues existants → venue_owner (si encore 'user')
-- Organizers d'events existants → organizer (si encore 'user')
-- Idempotent : ne touche jamais admin/staff/organizer déjà promus.

do $$
begin
  -- Active la promotion système pour la durée de ce DO block.
  set local app.allow_role_promotion = 'on';

  update profiles p
     set role = 'venue_owner', updated_at = now()
   where p.role = 'user'
     and exists(
       select 1 from venues v
        where v.owner_id = p.id
     );

  update profiles p
     set role = 'organizer', updated_at = now()
   where p.role = 'user'
     and exists(
       select 1 from events e
        where e.organizer_id = p.id
     );
end $$;

-- ----------------------------------------------------------------------------
-- Commentaires
-- ----------------------------------------------------------------------------
comment on function public.tg_promote_to_venue_owner() is
  '0049: SECURITY DEFINER trigger qui promeut auto profiles.role user→venue_owner quand un venue est créé/réassigné. Bypass tg_protect_profile_role via GUC app.allow_role_promotion.';
comment on function public.tg_promote_to_organizer() is
  '0049: SECURITY DEFINER trigger qui promeut auto profiles.role user→organizer quand un event est créé. Bypass tg_protect_profile_role via GUC app.allow_role_promotion.';
comment on function public.has_pro_access(uuid) is
  '0049: retourne true si l''utilisateur (auth.uid() par défaut) possède au moins 1 venue, organise 1 event, ou a un rôle pro. Source de vérité pour révéler /pro dans l''UI.';
