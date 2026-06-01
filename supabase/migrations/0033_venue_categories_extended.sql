-- ============================================================================
-- SOUTRA-PAIYA — Migration 0033 : extension du catalogue de lieux
-- ============================================================================
-- Etend le module « Découverte » pour couvrir la totalité des activités
-- référençables en Côte d'Ivoire (au-delà des seuls établissements de
-- restauration/nightlife). Ajoute :
--
--   1. ~40 nouvelles valeurs à l'enum `venue_category`
--      (santé, éducation, services, tourisme, hébergement, commerce, etc.)
--   2. Nouvelles colonnes sur `venues` : subcategory, commune, website,
--      video_urls, tour_360_url
--   3. Index complémentaires pour soutenir les filtres par (category, status)
--      et (city, status) — le GIST sur location existe déjà.
--
-- Strictement NON-CASSANT :
--   - Aucune suppression ni renommage
--   - Toutes les colonnes sont AJOUTÉES avec defaults safe
--   - Les ALTER TYPE utilisent ADD VALUE IF NOT EXISTS (idempotent)
--   - Les venues existants gardent leur catégorie actuelle inchangée
--
-- Note PostgreSQL : un `ALTER TYPE ... ADD VALUE` ne peut pas être utilisé
-- pour insérer une ligne dans la MEME transaction. Cette migration n'utilise
-- aucune des nouvelles valeurs dans des INSERT/UPDATE -> aucune contrainte.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Catégories : 40+ nouvelles valeurs ajoutées à l'enum venue_category.
--    Convention : snake_case, en français-international, taille courte.
--    Existant conservé : maquis, restaurant, hotel, club, sport, cafe,
--    event_space, bar, lounge, beach.
-- ----------------------------------------------------------------------------

-- Restauration (complète)
alter type venue_category add value if not exists 'fast_food';
alter type venue_category add value if not exists 'patisserie';

-- Hébergement
alter type venue_category add value if not exists 'residence_meublee';
alter type venue_category add value if not exists 'villa';
alter type venue_category add value if not exists 'resort';
alter type venue_category add value if not exists 'auberge';

-- Loisirs
alter type venue_category add value if not exists 'piscine';
alter type venue_category add value if not exists 'cinema';
alter type venue_category add value if not exists 'casino';
alter type venue_category add value if not exists 'centre_loisirs';
alter type venue_category add value if not exists 'parc';

-- Sport (au-delà du générique 'sport' déjà présent)
alter type venue_category add value if not exists 'salle_sport';
alter type venue_category add value if not exists 'terrain_football';
alter type venue_category add value if not exists 'multisports';
alter type venue_category add value if not exists 'fitness';

-- Commerce
alter type venue_category add value if not exists 'mall';
alter type venue_category add value if not exists 'supermarche';
alter type venue_category add value if not exists 'boutique';

-- Éducation
alter type venue_category add value if not exists 'maternelle';
alter type venue_category add value if not exists 'primaire';
alter type venue_category add value if not exists 'college';
alter type venue_category add value if not exists 'lycee';
alter type venue_category add value if not exists 'universite';
alter type venue_category add value if not exists 'grande_ecole';
alter type venue_category add value if not exists 'formation';
alter type venue_category add value if not exists 'bibliotheque';
alter type venue_category add value if not exists 'residence_universitaire';

-- Santé
alter type venue_category add value if not exists 'hopital';
alter type venue_category add value if not exists 'clinique';
alter type venue_category add value if not exists 'pharmacie';
alter type venue_category add value if not exists 'laboratoire';

-- Services
alter type venue_category add value if not exists 'banque';
alter type venue_category add value if not exists 'assurance';
alter type venue_category add value if not exists 'immobilier';
alter type venue_category add value if not exists 'voyage';
alter type venue_category add value if not exists 'comptable';
alter type venue_category add value if not exists 'juridique';

-- Tourisme
alter type venue_category add value if not exists 'site_touristique';
alter type venue_category add value if not exists 'musee';
alter type venue_category add value if not exists 'monument';
alter type venue_category add value if not exists 'reserve_naturelle';
alter type venue_category add value if not exists 'attraction';

-- Autres
alter type venue_category add value if not exists 'entreprise';
alter type venue_category add value if not exists 'autre';

-- ----------------------------------------------------------------------------
-- 2) Nouvelles colonnes sur `venues`
-- ----------------------------------------------------------------------------

-- Sous-catégorie libre (ex. "Cuisine ivoirienne" pour category=restaurant).
alter table public.venues
  add column if not exists subcategory text;

-- Commune (cad. division administrative entre la ville et le quartier).
-- À Abidjan : "Cocody", "Yopougon", etc.
alter table public.venues
  add column if not exists commune text;

-- Site web officiel (https://...).
alter table public.venues
  add column if not exists website text;

-- Galerie vidéos. Convention : URLs MP4 publiques stockées dans le bucket
-- `venue-media` (même que les photos). Un upload futur pourra utiliser un
-- bucket dédié `venue-videos` si nécessaire — le schéma supporte les deux.
alter table public.venues
  add column if not exists video_urls text[] not null default '{}'::text[];

-- Visite virtuelle 360° : URL d'une scène (ex. Matterport, Kuula, Pano2VR).
alter table public.venues
  add column if not exists tour_360_url text;

-- ----------------------------------------------------------------------------
-- 3) Index complémentaires pour les filtres « par catégorie » et « par ville »
--    sur les venues actifs. Le GIST sur location existe déjà (migration 0001).
-- ----------------------------------------------------------------------------

-- Filtre principal des écrans Discover : catégorie + status='active'.
create index if not exists idx_venues_category_active
  on public.venues(category)
  where status = 'active';

-- Filtre secondaire : par commune (et par ville).
create index if not exists idx_venues_commune_active
  on public.venues(commune)
  where status = 'active' and commune is not null;

create index if not exists idx_venues_city_active
  on public.venues(city)
  where status = 'active';

-- ----------------------------------------------------------------------------
-- 4) Commentaires de documentation
-- ----------------------------------------------------------------------------

comment on column public.venues.subcategory is
  'Sous-catégorie libre (ex. ''Cuisine ivoirienne'', ''Maternelle privée'').';
comment on column public.venues.commune is
  'Commune administrative. Ex Abidjan : Cocody, Yopougon, Marcory, Plateau…';
comment on column public.venues.website is
  'Site web officiel de l''établissement (URL absolue).';
comment on column public.venues.video_urls is
  'URLs des vidéos publiques de l''établissement. Idéalement bucket venue-media.';
comment on column public.venues.tour_360_url is
  'URL d''une visite virtuelle 360° (Matterport, Kuula…).';
