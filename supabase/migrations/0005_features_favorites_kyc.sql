-- ============================================================================
-- SOUTRA-PAIYA — Migration 0005
-- Fonctionnalités : favoris + soumission KYC
-- ============================================================================

-- ----------------------------------------------------------------------------
-- FAVORIS — lieux mis en favori par un utilisateur
-- ----------------------------------------------------------------------------
create table if not exists favorites (
  user_id    uuid not null references profiles(id) on delete cascade,
  venue_id   uuid not null references venues(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, venue_id)
);
create index if not exists idx_favorites_user on favorites(user_id, created_at desc);

alter table favorites enable row level security;

drop policy if exists "favorites_self" on favorites;
create policy "favorites_self" on favorites
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- KYC — champs de soumission sur profiles
-- ----------------------------------------------------------------------------
alter table profiles add column if not exists kyc_id_type      text;
alter table profiles add column if not exists kyc_id_number    text;
alter table profiles add column if not exists kyc_submitted_at timestamptz;

-- ----------------------------------------------------------------------------
-- SÉCURITÉ — étend le trigger 0004 : protège aussi kyc_status.
-- Un utilisateur peut SOUMETTRE son KYC (kyc_status -> 'pending') mais ne peut
-- pas s'auto-valider : 'verified' / 'rejected' restent réservés aux admins.
-- ----------------------------------------------------------------------------
create or replace function public.tg_protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Changement de rôle : réservé aux admins (cf. migration 0004).
  if new.role is distinct from old.role then
    if auth.uid() is not null and not public.is_admin() then
      raise exception
        'Modification du rôle non autorisée (% -> %).', old.role, new.role
        using errcode = '42501';
    end if;
  end if;

  -- Statut KYC : un utilisateur peut seulement soumettre (-> 'pending') ou
  -- annuler (-> 'none'). 'verified' / 'rejected' sont réservés aux admins.
  if new.kyc_status is distinct from old.kyc_status then
    if auth.uid() is not null
       and not public.is_admin()
       and new.kyc_status not in ('pending', 'none') then
      raise exception
        'Validation KYC non autorisée (% -> %).', old.kyc_status, new.kyc_status
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

-- Le trigger `protect_profile_role` (migration 0004) appelle déjà cette
-- fonction — aucune recréation de trigger nécessaire.
