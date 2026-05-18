-- ============================================================================
-- SOUTRA-PAIYA — Migration 0004
-- CORRECTIF SÉCURITÉ — escalade de privilèges via profiles.role
-- ============================================================================
-- Faille : la policy `profiles_update_self` (0001) est définie ainsi —
--
--     create policy "profiles_update_self" on profiles
--       for update using (auth.uid() = id);
--
-- Elle n'a PAS de clause WITH CHECK. En RLS Postgres, un UPDATE sans WITH CHECK
-- ne contraint pas les NOUVELLES valeurs de la ligne : un utilisateur pouvait
-- donc modifier n'importe quelle colonne de SON profil, y compris `role`.
--
-- Chaîne d'attaque : un compte quelconque exécute
--     update profiles set role = 'admin' where id = auth.uid();
-- -> is_admin() (migration 0003) renvoie alors true -> accès admin total
--    (wallets, transactions, venues, réservations… via les policies admin_*).
--
-- Correctif : un trigger BEFORE UPDATE rejette tout changement de `role`
-- provenant d'un client authentifié non-admin. Les opérations service_role /
-- SQL (auth.uid() IS NULL) restent autorisées pour pouvoir désigner un admin.
-- ============================================================================

create or replace function public.tg_protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    -- auth.uid() non nul = appel via un client authentifié (web / mobile).
    -- Seul un admin peut alors changer un rôle.
    if auth.uid() is not null and not public.is_admin() then
      raise exception
        'Modification du rôle non autorisée (% -> %).', old.role, new.role
        using errcode = '42501';  -- insufficient_privilege
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_role on profiles;
create trigger protect_profile_role
  before update on profiles
  for each row execute function public.tg_protect_profile_role();
