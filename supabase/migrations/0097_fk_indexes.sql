-- ============================================================================
-- SOUTRA — Migration 0097 : index manquants sur des clés étrangères / filtres
-- ============================================================================
-- Audit statique des migrations (0001 → 0096) : colonnes FK ou colonnes de
-- filtre utilisées par l'app, sans index. Chaque index est `if not exists` :
-- sans danger si la prod en a déjà un équivalent créé hors historique.
-- Les colonnes nullables sont indexées en partiel (`is not null`) : index plus
-- petit, mêmes requêtes servies.
-- ============================================================================

-- Historique du wallet : `user_id = X OR counterparty_id = X` (le côté
-- user_id est couvert par idx_tx_user_date ; sans celui-ci le OR force un scan).
create index if not exists idx_tx_counterparty
  on public.transactions (counterparty_id, created_at desc)
  where counterparty_id is not null;

-- « Mes conversations » : la PK (chat_id, user_id) ne sert pas à filtrer par user_id.
create index if not exists idx_chat_members_user
  on public.chat_members (user_id);

-- Favoris par lieu (compteurs, cascade à la suppression d'un lieu).
create index if not exists idx_favorites_venue
  on public.favorites (venue_id);

-- Événements et activités d'un lieu (fiche lieu, cascade).
create index if not exists idx_events_venue
  on public.events (venue_id) where venue_id is not null;
create index if not exists idx_activities_venue
  on public.activities (venue_id) where venue_id is not null;

-- Avis d'un utilisateur ; abonnés d'un profil (la PK follows commence par follower_id).
create index if not exists idx_reviews_user
  on public.reviews (user_id);
create index if not exists idx_follows_followed
  on public.follows (followed_id);

-- Alertes SOS et échanges de récompenses par utilisateur.
create index if not exists idx_sos_alerts_user
  on public.sos_alerts (user_id);
create index if not exists idx_loyalty_redemptions_user
  on public.loyalty_reward_redemptions (user_id);

-- Offres tourisme rattachées à un voyage / une activité.
create index if not exists idx_tourism_offers_trip
  on public.tourism_offers (trip_id) where trip_id is not null;
create index if not exists idx_tourism_offers_activity
  on public.tourism_offers (activity_id) where activity_id is not null;
