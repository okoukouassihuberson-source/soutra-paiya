# Migrations en attente

`0098_profiles_rls.sql` ferme la lecture publique de `profiles`. Elle est volontairement **hors** de `supabase/migrations/`
pour qu'un `supabase db push` ne l'applique pas trop tôt.

1. Déployer le web (Vercel) et publier l'app mobile (versions qui lisent `public_profiles` / les RPC).
2. `git mv supabase/pending/0098_profiles_rls.sql supabase/migrations/` puis `supabase db push`
   (ou copier le fichier dans le SQL Editor Supabase).
