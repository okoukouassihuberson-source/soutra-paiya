-- ============================================================================
-- SOUTRA-PAIYA — Migration 0057 : catégories métier + business_type
-- ============================================================================
-- Étend le catalogue de catégories (4 ajouts ciblés brief PM) et introduit
-- la notion de « business_type » : le mode d'interaction métier qu'une
-- catégorie expose côté UI (réservation table vs chambre vs catalogue vs
-- ticket événement vs créneau horaire vs devis vs trajet vs visite).
--
-- Le mapping (catégorie → business_type) est :
--   - dupliqué côté front (packages/shared/src/venue-categories.ts) pour
--     piloter le rendu sans round-trip DB
--   - exposé côté SQL via la fonction immutable get_venue_business_type
--     pour permettre des requêtes filtrées par type métier
--     (ex: liste des venues "hotel_rooms" pour le module booking futur)
--
-- Non-cassant : pas de modif de tables. ALTER TYPE ADD VALUE IF NOT EXISTS
-- est idempotent. La fonction SQL ne dépend que de l'enum.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Catégories manquantes du brief PM
--    Note : 'beach' (= "Plage privée") existe déjà via migration 0013.
-- ----------------------------------------------------------------------------

alter type venue_category add value if not exists 'salle_reception';
alter type venue_category add value if not exists 'organisateur_evenements';
alter type venue_category add value if not exists 'prestataire_services';
alter type venue_category add value if not exists 'vtc_transport';

-- ----------------------------------------------------------------------------
-- 2) Enum venue_business_type
--    8 modes d'interaction couvrant l'ensemble des venues présentes et
--    futures. Si une catégorie ne rentre dans aucun, on retombe sur
--    venue_visit (fiche info seulement).
-- ----------------------------------------------------------------------------

do $$ begin
  create type venue_business_type as enum (
    'reservation_table',   -- restaurant, maquis, cafe, bar, lounge, fast_food, patisserie
    'hotel_rooms',         -- hotel, villa, resort, auberge, residence_meublee
    'product_catalog',     -- boutique, mall, supermarche, pharmacie
    'event_tickets',       -- event_space (events séparés dans table events)
    'time_slot',           -- club, casino, cinema, fitness, salle_sport, piscine, terrain_football, multisports, centre_loisirs
    'service_quote',       -- salle_reception, organisateur_evenements, prestataire_services, immobilier, juridique, comptable, assurance, banque, formation
    'vtc_ride',            -- vtc_transport
    'venue_visit'          -- parc, musee, monument, attraction, beach, site_touristique, bibliotheque, reserve_naturelle, hopital, clinique, laboratoire, ecoles, etc.
  );
exception when duplicate_object then null;
end $$;

-- ----------------------------------------------------------------------------
-- 3) Fonction SQL immutable : mapping catégorie → business_type
--    À garder strictement synchrone avec packages/shared/src/venue-categories.ts.
--    Si nouvelle catégorie ajoutée à l'enum, mettre à jour ICI + côté TS.
-- ----------------------------------------------------------------------------

create or replace function public.get_venue_business_type(p_category venue_category)
returns venue_business_type
language sql
immutable
set search_path = public
as $$
  select case p_category::text
    -- Restauration / nightlife → réservation de table
    when 'restaurant'   then 'reservation_table'::venue_business_type
    when 'maquis'       then 'reservation_table'
    when 'cafe'         then 'reservation_table'
    when 'bar'          then 'reservation_table'
    when 'lounge'       then 'reservation_table'
    when 'fast_food'    then 'reservation_table'
    when 'patisserie'   then 'reservation_table'

    -- Hébergement → réservation de chambre
    when 'hotel'              then 'hotel_rooms'
    when 'villa'              then 'hotel_rooms'
    when 'resort'             then 'hotel_rooms'
    when 'auberge'            then 'hotel_rooms'
    when 'residence_meublee'  then 'hotel_rooms'

    -- Commerce → catalogue produits
    when 'boutique'    then 'product_catalog'
    when 'mall'        then 'product_catalog'
    when 'supermarche' then 'product_catalog'
    when 'pharmacie'   then 'product_catalog'

    -- Événementiel → billetterie
    when 'event_space' then 'event_tickets'

    -- Sport / loisirs → créneaux horaires
    when 'club'              then 'time_slot'
    when 'casino'            then 'time_slot'
    when 'cinema'            then 'time_slot'
    when 'fitness'           then 'time_slot'
    when 'salle_sport'       then 'time_slot'
    when 'piscine'           then 'time_slot'
    when 'terrain_football'  then 'time_slot'
    when 'multisports'       then 'time_slot'
    when 'centre_loisirs'    then 'time_slot'
    when 'sport'             then 'time_slot'

    -- Services BtoB / BtoC → devis sur mesure
    when 'salle_reception'         then 'service_quote'
    when 'organisateur_evenements' then 'service_quote'
    when 'prestataire_services'    then 'service_quote'
    when 'immobilier'              then 'service_quote'
    when 'juridique'               then 'service_quote'
    when 'comptable'               then 'service_quote'
    when 'assurance'               then 'service_quote'
    when 'banque'                  then 'service_quote'
    when 'formation'               then 'service_quote'
    when 'entreprise'              then 'service_quote'
    when 'voyage'                  then 'service_quote'

    -- VTC / mobilité → réservation de trajet
    when 'vtc_transport' then 'vtc_ride'

    -- Tout le reste → fiche info / visite
    -- (parc, musee, monument, attraction, beach, site_touristique, reserve_naturelle,
    --  bibliotheque, hopital, clinique, laboratoire, maternelle, primaire, college,
    --  lycee, universite, grande_ecole, residence_universitaire, autre)
    else 'venue_visit'::venue_business_type
  end;
$$;

grant execute on function public.get_venue_business_type(venue_category) to anon, authenticated, service_role;

comment on function public.get_venue_business_type is
  'Mapping immutable catégorie → type métier. Doit rester synchrone avec packages/shared/src/venue-categories.ts.';

-- ----------------------------------------------------------------------------
-- 4) Index : permet aux RPC de discovery de filtrer par business_type
--    (utile pour : "donne-moi tous les hôtels actifs à Abidjan").
--    Index expression sur la fonction immutable → la nouveauté PostgreSQL
--    nécessite que la fonction soit IMMUTABLE, c'est le cas.
-- ----------------------------------------------------------------------------

create index if not exists idx_venues_business_type_status
  on public.venues (public.get_venue_business_type(category), status)
  where status = 'active';
