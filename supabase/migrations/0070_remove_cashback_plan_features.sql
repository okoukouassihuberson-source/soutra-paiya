-- ============================================================================
-- SOUTRA-PAIYA — Migration 0070 : retrait des puces "Cashback X%" des plans
-- ============================================================================
-- La migration 0069 a coupé le moteur cashback et retiré la colonne
-- subscription_plans.cashback_bps, mais les puces marketing "Cashback 1 %",
-- "Cashback augmenté à 2 %", "Cashback maximal de 5 %" restaient dans le
-- jsonb subscription_plans.features (seedé par 0046) — visibles sur /subscribe
-- (constaté en test manuel après déploiement de 0068/0069).
--
-- La fidélité est désormais universelle (100 FCFA = 1 point pour tout le
-- monde, cf. migration 0068), donc pas de puce de remplacement par plan :
-- on retire simplement les éléments contenant "cashback".
-- ============================================================================

update public.subscription_plans
set features = (
  select coalesce(jsonb_agg(elem), '[]'::jsonb)
    from jsonb_array_elements_text(features) as elem
   where elem not ilike '%cashback%'
)
where features::text ilike '%cashback%';
