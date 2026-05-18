-- ============================================================================
-- SOUTRA-PAIYA — Migration 0006
-- Stockage des documents KYC : bucket privé + RLS
-- ============================================================================

-- Bucket privé pour les pièces d'identité KYC.
insert into storage.buckets (id, name, public)
values ('kyc', 'kyc', false)
on conflict (id) do nothing;

-- Convention de chemin : "<user_id>/<fichier>" -> chaque utilisateur dépose
-- uniquement dans son propre dossier.

-- Upload (insert)
drop policy if exists "kyc_insert_own" on storage.objects;
create policy "kyc_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'kyc'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Remplacement (re-soumission)
drop policy if exists "kyc_update_own" on storage.objects;
create policy "kyc_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'kyc'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Lecture : le propriétaire du document, ou un administrateur (validation KYC).
drop policy if exists "kyc_select_own_or_admin" on storage.objects;
create policy "kyc_select_own_or_admin" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'kyc'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );
