-- ============================================================================
-- SOUTRA-PAIYA — Migration 0017 : policies storage v2 + diagnostic RPC
-- ============================================================================
-- Contexte : malgré la migration 0016, l'upload échoue toujours en RLS bien
-- que la sonde client confirme que `vCheck.owner_id === user.id`. Hypothèse
-- restante : `storage.foldername(name)` peut renvoyer un format inattendu
-- selon la version Storage déployée sur le projet (encodage URL, slash final
-- absent, etc.). On remplace par `split_part(name, '/', 1)` — primitive
-- Postgres standard, comportement identique sur tous les projets.
--
-- En complément, on expose une RPC `debug_storage_policy(path)` que le client
-- appelle juste avant l'upload, dans le contexte authentifié réel, pour voir
-- précisément quelle clause matche ou pas.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) RPC de diagnostic — exécutable par tout utilisateur authentifié, dans
--    SON contexte (security invoker), pour observer ce que la policy verrait
--    si elle se déclenchait sur ce path.
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
    'policy_would_pass',  exists(
      select 1 from public.venues v
      where v.id::text = split_part(p_path, '/', 1)
        and (v.owner_id = auth.uid() or public.is_admin())
    )
  );
$$;

grant execute on function public.debug_storage_policy(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 2) Recréation des 3 policies d'écriture avec `split_part` (au lieu de
--    `storage.foldername`). Comportement fonctionnellement identique sur
--    nos paths `<venue_id>/<fichier>`, mais déterministe sur tous les
--    projets Supabase quelle que soit la version Storage.
-- ----------------------------------------------------------------------------
drop policy if exists "venue_media_insert_owner" on storage.objects;
create policy "venue_media_insert_owner" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'venue-media'
    and exists (
      select 1 from public.venues v
      where v.id::text = split_part(name, '/', 1)
        and (v.owner_id = auth.uid() or public.is_admin())
    )
  );

drop policy if exists "venue_media_update_owner" on storage.objects;
create policy "venue_media_update_owner" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'venue-media'
    and exists (
      select 1 from public.venues v
      where v.id::text = split_part(name, '/', 1)
        and (v.owner_id = auth.uid() or public.is_admin())
    )
  )
  with check (
    bucket_id = 'venue-media'
    and exists (
      select 1 from public.venues v
      where v.id::text = split_part(name, '/', 1)
        and (v.owner_id = auth.uid() or public.is_admin())
    )
  );

drop policy if exists "venue_media_delete_owner" on storage.objects;
create policy "venue_media_delete_owner" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'venue-media'
    and exists (
      select 1 from public.venues v
      where v.id::text = split_part(name, '/', 1)
        and (v.owner_id = auth.uid() or public.is_admin())
    )
  );
