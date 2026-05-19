-- ============================================================================
-- SOUTRA-PAIYA — Migration 0013 : vitrine PRO — profil enrichi + médias
-- ============================================================================
-- Enrichit la table venues (logo, WhatsApp, réseaux sociaux, ambiance) et crée
-- le bucket Storage public des médias d'établissement. Migration idempotente.
-- Les champs cover_url, gallery_urls, opening_hours, amenities, avg_price_xof,
-- email, district, location existent déjà (migration 0001).
-- ============================================================================

-- Nouvelles catégories d'établissement (le reste existe déjà dans l'enum).
-- ⚠️ Doit précéder toute utilisation : une valeur d'enum ajoutée n'est pas
-- utilisable dans la même transaction — aucune instruction ci-dessous ne s'en sert.
alter type venue_category add value if not exists 'bar';
alter type venue_category add value if not exists 'lounge';
alter type venue_category add value if not exists 'beach';

alter table venues add column if not exists logo_url text;
alter table venues add column if not exists whatsapp text;
alter table venues add column if not exists socials  jsonb  not null default '{}'::jsonb;
alter table venues add column if not exists ambiance text[] not null default '{}';

-- ----------------------------------------------------------------------------
-- Bucket public des médias d'établissement (logo, bannière, galerie).
-- Convention de chemin : "<venue_id>/<fichier>".
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('venue-media', 'venue-media', true)
on conflict (id) do nothing;

-- Écriture réservée au propriétaire de l'établissement (ou à un admin).
drop policy if exists "venue_media_insert_owner" on storage.objects;
create policy "venue_media_insert_owner" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'venue-media'
    and exists (
      select 1 from venues v
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
      select 1 from venues v
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
      select 1 from venues v
      where v.id::text = (storage.foldername(name))[1]
        and (v.owner_id = auth.uid() or public.is_admin())
    )
  );

-- Lecture : le bucket est public — aucune policy SELECT requise.
