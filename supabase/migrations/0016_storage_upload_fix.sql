-- ============================================================================
-- SOUTRA-PAIYA — Migration 0016 : fix upload médias (RLS storage.objects)
-- ============================================================================
-- Symptôme : « new row violates row-level security policy » au moment d'uploader
-- un logo, une bannière ou une photo de galerie depuis l'onglet PRO « Paramètres ».
-- Cause la plus probable : la migration 0013 a partiellement appliqué les
-- policies du bucket venue-media (rollback silencieux après `alter type
-- venue_category add value` sur certains projets cloud).
--
-- Ce fix est 100 % idempotent : il peut être rejoué sans risque, à n'importe
-- quel moment, sur n'importe quel environnement.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Bucket — création + s'assurer qu'il est public en lecture.
--    Convention de chemin : "<venue_id>/<kind>-<timestamp>.<ext>".
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('venue-media', 'venue-media', true)
on conflict (id) do update set public = excluded.public;

-- ----------------------------------------------------------------------------
-- 2) Policies — on les drop d'abord, on les recrée à plat. Aucune réflexion
--    sur l'état préalable : on part du principe qu'on ne sait rien.
-- ----------------------------------------------------------------------------

-- INSERT : seul le propriétaire de l'établissement (ou un admin) peut écrire
-- dans le dossier <venue_id>/ du bucket.
drop policy if exists "venue_media_insert_owner" on storage.objects;
create policy "venue_media_insert_owner" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'venue-media'
    and exists (
      select 1 from public.venues v
      where v.id::text = (storage.foldername(name))[1]
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
      where v.id::text = (storage.foldername(name))[1]
        and (v.owner_id = auth.uid() or public.is_admin())
    )
  )
  with check (
    bucket_id = 'venue-media'
    and exists (
      select 1 from public.venues v
      where v.id::text = (storage.foldername(name))[1]
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
      where v.id::text = (storage.foldername(name))[1]
        and (v.owner_id = auth.uid() or public.is_admin())
    )
  );

-- SELECT : bucket public -> lisible par tout le monde. On ajoute la policy
-- explicite pour ne pas dépendre du flag `public = true` (qui ouvre seulement
-- la lecture anonyme, pas la lecture via session authentifiée dans tous les
-- cas — explicite > implicite).
drop policy if exists "venue_media_select_public" on storage.objects;
create policy "venue_media_select_public" on storage.objects
  for select using (bucket_id = 'venue-media');

-- ----------------------------------------------------------------------------
-- 3) Promotion d'un compte super-admin par téléphone (demandé par le user).
--    Le numéro est stocké SANS « + » côté Supabase Auth pour les comptes
--    créés via signup phone — on tente les deux formats.
-- ----------------------------------------------------------------------------
update public.profiles
   set role = 'admin'
 where phone in ('+2250501871198', '2250501871198');
