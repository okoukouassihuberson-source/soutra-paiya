-- ============================================================================
-- SOUTRA-PAIYA — Migration 0078 : photos catégorisées par établissement
-- ============================================================================
-- Phase 5 de la refonte UX fiche établissement (section 3 du master prompt) :
-- permet au Pro d'ajouter des photos taguées par type selon son activité
-- (Menu/Plats/Terrasse pour un resto, Chambres/Piscine pour un hôtel...).
--
-- Ajout en parallèle (décision confirmée) : venues.gallery_urls/cover_url/
-- video_urls restent strictement inchangés (zéro régression sur les
-- centaines d'établissements déjà en production) — nouvelle table dédiée,
-- calquée sur le pattern menu_items (0014) : table séparée avec venue_id FK
-- + category texte libre, RLS public-read/owner-write, pas de RPC.
-- ============================================================================

create table if not exists public.venue_photos (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null references public.venues(id) on delete cascade,
  url        text not null,
  category   text not null check (length(category) between 1 and 60),
  position   integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_venue_photos_venue
  on public.venue_photos(venue_id, category, position);

alter table public.venue_photos enable row level security;

drop policy if exists "venue_photos_select_public" on public.venue_photos;
create policy "venue_photos_select_public" on public.venue_photos
  for select using (true);

drop policy if exists "venue_photos_insert_owner" on public.venue_photos;
create policy "venue_photos_insert_owner" on public.venue_photos
  for insert
  with check (
    exists (
      select 1 from public.venues v
      where v.id = venue_id and (v.owner_id = auth.uid() or public.is_admin())
    )
  );

drop policy if exists "venue_photos_update_owner" on public.venue_photos;
create policy "venue_photos_update_owner" on public.venue_photos
  for update
  using (
    exists (
      select 1 from public.venues v
      where v.id = venue_id and (v.owner_id = auth.uid() or public.is_admin())
    )
  );

drop policy if exists "venue_photos_delete_owner" on public.venue_photos;
create policy "venue_photos_delete_owner" on public.venue_photos
  for delete
  using (
    exists (
      select 1 from public.venues v
      where v.id = venue_id and (v.owner_id = auth.uid() or public.is_admin())
    )
  );

comment on table public.venue_photos is
  'Photos catégorisées par type d''activité (Menu, Chambres, Vitrine...), en complément de venues.gallery_urls (non catégorisé, inchangé). Lecture publique, écriture propriétaire/admin.';
