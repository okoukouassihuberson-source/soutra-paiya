-- ============================================================================
-- SOUTRA-PAIYA — Migration 0064 : photo de couverture profil utilisateur
-- ============================================================================
-- Spec PO : "Permettre upload photo couverture, recadrage, repositionnement,
-- suppression, remplacement. Style Facebook / LinkedIn / Airbnb."
--
-- Non-cassant : nouvelle colonne nullable. Aucun INSERT existant impacté.
-- Le bucket `social-media` est réutilisé (déjà ouvert au user via le path
-- <user_id>/...) — pas besoin de créer un bucket dédié.
-- ============================================================================

alter table public.profiles
  add column if not exists cover_url text;

comment on column public.profiles.cover_url is
  'URL publique de la photo de couverture du profil (style FB/LinkedIn). Bucket social-media, path <user_id>/cover-<timestamp>.<ext>.';
