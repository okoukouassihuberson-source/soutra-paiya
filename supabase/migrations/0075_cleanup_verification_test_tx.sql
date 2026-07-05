-- ============================================================================
-- SOUTRA-PAIYA — Migration 0075 : nettoyage transaction de vérification
-- ============================================================================
-- Supprime l'unique transaction "pending" créée pendant la vérification du
-- fix geniuspay-initialize (revert du deep link direct, cf. 0074) juste après
-- le reset financier pré-lancement — pour repartir sur une base 100% propre.
-- ============================================================================

delete from public.transactions
 where provider_ref = 'sp-6848bd98-0f7d-47ac-8ca2-579f2473f30d'
   and status = 'pending';
