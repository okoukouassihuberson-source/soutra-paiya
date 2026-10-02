-- ============================================================================
-- SOUTRA PLAYCE V2 — Migration 0088 : nouveaux types de notification
-- ============================================================================
-- ADD VALUE seul dans son propre fichier : PostgreSQL interdit d'utiliser une
-- valeur d'enum ajoutée dans la même transaction (supabase db push exécute
-- chaque migration dans une transaction). Elles sont utilisées dès 0089.
--   tourism   : voyages, activités, partenaires (le détail est dans meta.event)
--   promotion : offres et promotions
-- ============================================================================

alter type public.notification_kind add value if not exists 'tourism';
alter type public.notification_kind add value if not exists 'promotion';
