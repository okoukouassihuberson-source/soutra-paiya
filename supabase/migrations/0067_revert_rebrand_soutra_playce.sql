-- ============================================================================
-- SOUTRA-PLAYCE — Migration 0067 : retour du nom de marque en base
-- ============================================================================
-- La migration 0066 avait rebrandé Soutra-Playce → Soutra-Explore. Le nom
-- Soutra-Playce est rétabli dans tout le code (UI web + mobile + emails +
-- chatbot + docs). Cette migration remet à jour les chaînes SEEDÉES par les
-- migrations 0046/0047 dans public.subscription_plans (tagline + features
-- jsonb) pour qu'elles correspondent au code.
--
-- Idempotente : la clause WHERE saute les rows déjà revenues à Soutra-Playce.
-- Sans effet destructif : chaque UPDATE est un simple REPLACE textuel dans
-- des colonnes text / jsonb.
-- ============================================================================

update public.subscription_plans
set
  tagline  = replace(tagline, 'Soutra-Explore', 'Soutra-Playce'),
  features = replace(features::text, 'Soutra-Explore', 'Soutra-Playce')::jsonb
where
  tagline like '%Soutra-Explore%'
  or features::text like '%Soutra-Explore%';
