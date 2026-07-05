-- ============================================================================
-- SOUTRA-PAIYA — Migration 0074 : remise à zéro des données financières
--                                  avant lancement production (GeniusPay live)
-- ============================================================================
-- Demande explicite : effacer l'historique de test (transactions, soldes
-- wallet, points de fidélité, statut de paiement des réservations/commandes/
-- nuits d'hôtel) avant de basculer GeniusPay en clés live. Tous les comptes
-- utilisateurs sont conservés — seules leurs données financières sont
-- réinitialisées.
--
-- Hors scope (volontairement non touché, non demandé) :
--   - subscriptions (aucune FK vers transactions, statut inchangé)
--   - tickets / payment_requests : seule leur référence vers transactions
--     est cassée (nécessaire pour permettre le DELETE), leur statut propre
--     n'est pas modifié.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) Casser les références entrantes vers transactions (aucune n'a de
--    ON DELETE CASCADE) pour permettre sa purge sans violation de FK.
-- ----------------------------------------------------------------------------
update public.reservations set escrow_tx_id = null where escrow_tx_id is not null;
update public.tickets set transaction_id = null where transaction_id is not null;
update public.payment_requests set transaction_id = null where transaction_id is not null;

-- ----------------------------------------------------------------------------
-- 2) Purger l'historique transactionnel et tout ce qui en dérive.
-- ----------------------------------------------------------------------------
delete from public.loyalty_transactions;
delete from public.monetization_revenue_log;
delete from public.transactions;

-- ----------------------------------------------------------------------------
-- 3) Remettre à zéro les soldes wallet (tous comptes conservés).
-- ----------------------------------------------------------------------------
update public.wallets set balance_xof = 0, locked_xof = 0;

-- ----------------------------------------------------------------------------
-- 4) Remettre à zéro la fidélité (retour au niveau le plus bas).
-- ----------------------------------------------------------------------------
update public.loyalty_accounts
   set points_balance = 0, points_lifetime = 0, level_code = 'bronze';

-- ----------------------------------------------------------------------------
-- 5) Réinitialiser le statut de paiement des réservations/commandes/nuits
--    d'hôtel qui reflétaient un paiement désormais effacé.
-- ----------------------------------------------------------------------------
update public.reservations
   set status = 'pending', arrived_at = null, cancelled_at = null
 where status in ('confirmed', 'arrived', 'refunded');

update public.orders
   set status = 'pending', payment_status = 'pending', payment_ref = null,
       confirmed_at = null, ready_at = null, delivered_at = null, cancelled_at = null
 where payment_status <> 'pending' or status <> 'pending';

update public.room_bookings
   set status = 'pending', payment_status = 'pending', payment_ref = null,
       confirmed_at = null, checked_in_at = null, checked_out_at = null, cancelled_at = null
 where payment_status <> 'pending' or status <> 'pending';

commit;
