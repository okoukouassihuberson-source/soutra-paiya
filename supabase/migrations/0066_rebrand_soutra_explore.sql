-- ============================================================================
-- SOUTRA-EXPLORE — Migration 0066 : rebrand des chaînes en base
-- ============================================================================
-- Le code (UI web + mobile + emails + chatbot + docs) a été renommé
-- Soutra-Playce → Soutra-Explore en dur. Cette migration met à jour les
-- chaînes qui ont été SEEDÉES par les migrations 0046/0047 dans
-- public.subscription_plans (tagline + features jsonb).
--
-- Idempotente : la clause WHERE saute les rows déjà rebrandées.
-- Sans effet destructif : chaque UPDATE est un simple REPLACE textuel dans
-- des colonnes text / jsonb.
-- ============================================================================

update public.subscription_plans
set
  tagline  = replace(tagline, 'Soutra-Playce', 'Soutra-Explore'),
  features = replace(features::text, 'Soutra-Playce', 'Soutra-Explore')::jsonb
where
  tagline like '%Soutra-Playce%'
  or features::text like '%Soutra-Playce%';
