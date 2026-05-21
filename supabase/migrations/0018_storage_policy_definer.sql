-- ============================================================================
-- SOUTRA-PAIYA — Migration 0018 : policies storage via SECURITY DEFINER
-- ============================================================================
-- Diagnostic confirmé en prod : la sonde `debug_storage_policy` (migration
-- 0017) renvoie `policy_would_pass = true` dans le contexte authentifié
-- de l'utilisateur, mais l'INSERT dans `storage.objects` est quand même
-- rejeté par la RLS avec « new row violates row-level security policy ».
--
-- Cause : le service Supabase Storage évalue la WITH CHECK clause dans un
-- contexte où la sous-requête `select ... from public.venues` ne renvoie
-- pas la même chose que dans une RPC `security invoker`. Probablement
-- lié à la façon dont Storage applique le rôle et les claims JWT lors
-- de l'évaluation des policies.
--
-- Fix : on déporte le check d'ownership dans une fonction SECURITY DEFINER.
-- Elle s'exécute avec les privilèges du créateur (postgres), bypasse donc
-- la RLS sur `venues`, et renvoie un simple boolean. La policy storage
-- n'a plus qu'à l'appeler — plus aucune dépendance au contexte
-- d'évaluation interne du service Storage.
--
-- Pattern standard pour ce cas. Idempotente, rejouable.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Fonction helper SECURITY DEFINER.
--    Prend le nom du dossier (string), tente le cast en uuid, et vérifie
--    l'ownership. Renvoie `false` proprement si le dossier n'est pas un
--    uuid valide (path inattendu) — pas d'exception qui bloque la policy.
-- ----------------------------------------------------------------------------
create or replace function public.can_write_venue_media(p_folder text)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_uuid uuid;
begin
  begin
    v_uuid := p_folder::uuid;
  exception when others then
    return false;
  end;

  return exists (
    select 1 from public.venues
    where id = v_uuid
      and (owner_id = auth.uid() or public.is_admin())
  );
end;
$$;

grant execute on function public.can_write_venue_media(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 2) Recréation des 3 policies d'écriture. Logique : bucket attendu,
--    nom décomposé via split_part (déterministe), et délégation à la
--    fonction SECURITY DEFINER pour le check d'ownership.
-- ----------------------------------------------------------------------------
drop policy if exists "venue_media_insert_owner" on storage.objects;
create policy "venue_media_insert_owner" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'venue-media'
    and public.can_write_venue_media(split_part(name, '/', 1))
  );

drop policy if exists "venue_media_update_owner" on storage.objects;
create policy "venue_media_update_owner" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'venue-media'
    and public.can_write_venue_media(split_part(name, '/', 1))
  )
  with check (
    bucket_id = 'venue-media'
    and public.can_write_venue_media(split_part(name, '/', 1))
  );

drop policy if exists "venue_media_delete_owner" on storage.objects;
create policy "venue_media_delete_owner" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'venue-media'
    and public.can_write_venue_media(split_part(name, '/', 1))
  );

-- SELECT reste public (le bucket est en lecture libre).
-- La policy `venue_media_select_public` créée en 0016 n'est pas touchée.

-- ----------------------------------------------------------------------------
-- 3) Mise à jour de la RPC de diagnostic pour refléter la nouvelle policy.
-- ----------------------------------------------------------------------------
create or replace function public.debug_storage_policy(p_path text)
returns jsonb
language sql
security invoker
stable
set search_path = public, storage
as $$
  select jsonb_build_object(
    'auth_uid',           auth.uid(),
    'folder_split_part',  split_part(p_path, '/', 1),
    'folder_legacy',      (storage.foldername(p_path))[1],
    'venue_visible',      exists(
      select 1 from public.venues
      where id::text = split_part(p_path, '/', 1)
    ),
    'venue_owner_id',     (
      select v.owner_id::text
      from public.venues v
      where v.id::text = split_part(p_path, '/', 1)
      limit 1
    ),
    'is_owner',           exists(
      select 1 from public.venues v
      where v.id::text = split_part(p_path, '/', 1)
        and v.owner_id = auth.uid()
    ),
    'is_admin',           public.is_admin(),
    'policy_would_pass',  public.can_write_venue_media(split_part(p_path, '/', 1))
  );
$$;
