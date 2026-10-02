-- ============================================================================
-- 0093 — Médias touristiques (téléversement d'images)
-- ============================================================================
-- Avant : couvertures et galeries saisies par URL. Maintenant : bucket public
-- « tourism-media » (lecture publique, écriture réservée aux partenaires).
--   • chemin imposé : "<id utilisateur>/<fichier>" — chacun n'écrit que dans son dossier
--     (l'administration peut écrire partout) ;
--   • réservé aux rôles partenaires (organisateur, guide, établissement, admin) ;
--   • 5 Mo maximum, JPEG / PNG / WebP uniquement (appliqué par le bucket, pas seulement par l'interface).
-- Les URL saisies à la main continuent de fonctionner.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tourism-media', 'tourism-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

create or replace function public.can_write_tourism_media(p_folder text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.profiles p
     where p.id = auth.uid()
       and p.role::text in ('organizer', 'guide', 'venue_owner', 'admin')
       and (p.role::text = 'admin' or p_folder = p.id::text));
$$;

drop policy if exists "tourism_media_insert" on storage.objects;
create policy "tourism_media_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'tourism-media' and public.can_write_tourism_media((storage.foldername(name))[1]));

drop policy if exists "tourism_media_update" on storage.objects;
create policy "tourism_media_update" on storage.objects for update to authenticated
  using (bucket_id = 'tourism-media' and public.can_write_tourism_media((storage.foldername(name))[1]));

drop policy if exists "tourism_media_delete" on storage.objects;
create policy "tourism_media_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'tourism-media' and public.can_write_tourism_media((storage.foldername(name))[1]));
-- Lecture : bucket public (URL publiques) ; pas de politique de listing.

revoke execute on function public.can_write_tourism_media(text) from public, anon;
grant execute on function public.can_write_tourism_media(text) to authenticated;
