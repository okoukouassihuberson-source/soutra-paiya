-- ============================================================================
-- Migration 0002 : Seed venues + fixes RLS
-- ============================================================================

set search_path = public, extensions, pg_catalog;

-- ----------------------------------------------------------------------------
-- 1) Rendre owner_id nullable pour permettre les venues "system"
--    (les venues réelles auront un owner ; les venues de demo n'en ont pas)
-- ----------------------------------------------------------------------------
alter table venues alter column owner_id drop not null;

-- Mettre à jour la policy pour gérer les venues sans owner
drop policy if exists "venues_owner_all" on venues;
create policy "venues_owner_all" on venues
  for all
  using (owner_id is not null and auth.uid() = owner_id);

-- ----------------------------------------------------------------------------
-- 2) Ajouter les policies INSERT manquantes
-- ----------------------------------------------------------------------------

-- TRANSACTIONS : user peut créer ses propres transactions
drop policy if exists "tx_insert" on transactions;
create policy "tx_insert" on transactions
  for insert
  with check (auth.uid() = user_id);

-- TRANSACTIONS : user peut update ses propres transactions
drop policy if exists "tx_update" on transactions;
create policy "tx_update" on transactions
  for update
  using (auth.uid() = user_id);

-- TICKETS : user peut créer ses tickets
drop policy if exists "tickets_insert" on tickets;
create policy "tickets_insert" on tickets
  for insert
  with check (auth.uid() = user_id);

-- RESERVATIONS : user peut update ses propres réservations (cancel)
drop policy if exists "resa_update_self" on reservations;
create policy "resa_update_self" on reservations
  for update
  using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 3) Seed 5 venues de démo (sans owner pour éviter les conflits FK)
-- ----------------------------------------------------------------------------
insert into venues (
  id, owner_id, name, slug, category, description, cover_url, gallery_urls,
  address, city, district, phone, email, opening_hours, avg_price_xof,
  amenities, status, rating_avg, rating_count, created_at, updated_at
)
values
  (
    '550e8400-e29b-41d4-a716-446655440001'::uuid, null,
    'Le Mékaféba', 'le-mekafeba', 'maquis',
    'Authentique maquis du quartier Cocody avec une ambiance chaleureuse et une cuisine locale délicieuse.',
    'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600',
    array['https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600','https://images.unsplash.com/photo-1428515613728-6b8e7a76e705?w=600'],
    '123 Rue de Cocody', 'Abidjan', 'Cocody',
    '+225 27 22 50 60 60', 'contact@mekafeba.ci',
    '{"mon":["12:00","02:00"],"tue":["12:00","02:00"],"wed":["12:00","02:00"],"thu":["12:00","02:00"],"fri":["12:00","03:00"],"sat":["11:00","03:00"],"sun":["11:00","02:00"]}'::jsonb,
    8000,
    array['WiFi', 'Parking', 'Climatisation', 'TV Sport'],
    'active', 4.7, 42, now(), now()
  ),
  (
    '550e8400-e29b-41d4-a716-446655440002'::uuid, null,
    'Saka Saka', 'saka-saka', 'restaurant',
    'Restaurant familial servant la cuisine ivoirienne traditionnelle dans une ambiance conviviale.',
    'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=600',
    array['https://images.unsplash.com/photo-1559339352-11d035aa65de?w=600','https://images.unsplash.com/photo-1504674900150-cb414243a98e?w=600'],
    '45 Avenue Marcory', 'Abidjan', 'Marcory',
    '+225 27 21 35 40 50', 'info@sakasakarestaurant.ci',
    '{"mon":["11:00","22:00"],"tue":["11:00","22:00"],"wed":["11:00","22:00"],"thu":["11:00","22:00"],"fri":["11:00","23:00"],"sat":["10:00","23:00"],"sun":["10:00","22:00"]}'::jsonb,
    12000,
    array['WiFi', 'Parking', 'Climatisation', 'Menu à la carte'],
    'active', 4.5, 38, now(), now()
  ),
  (
    '550e8400-e29b-41d4-a716-446655440003'::uuid, null,
    'VIP Lounge', 'vip-lounge', 'club',
    'Lounge premium avec DJ, cocktails et ambiance festive tous les soirs.',
    'https://images.unsplash.com/photo-1566737236500-c8ac43014a67?w=600',
    array['https://images.unsplash.com/photo-1566737236500-c8ac43014a67?w=600','https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600'],
    '78 Boulevard de Yopougon', 'Abidjan', 'Yopougon',
    '+225 27 20 10 20 30', 'reservations@viplounge.ci',
    '{"mon":["17:00","04:00"],"tue":["17:00","04:00"],"wed":["17:00","04:00"],"thu":["17:00","04:00"],"fri":["17:00","05:00"],"sat":["15:00","05:00"],"sun":["17:00","04:00"]}'::jsonb,
    25000,
    array['DJ', 'Cocktails', 'Parking', 'VIP Section', 'Piste de danse'],
    'active', 4.9, 156, now(), now()
  ),
  (
    '550e8400-e29b-41d4-a716-446655440004'::uuid, null,
    'Chez Tantie Adjoua', 'chez-tantie-adjoua', 'maquis',
    'Petit maquis sympathique avec spécialités du terroir et accueil chaleureux.',
    'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600',
    array['https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600'],
    '12 Rue de l''Amitié, Abobo', 'Abidjan', 'Abobo',
    '+225 27 19 50 60 70', 'tantie.adjoua@local.ci',
    '{"mon":["12:00","23:00"],"tue":["12:00","23:00"],"wed":["12:00","23:00"],"thu":["12:00","23:00"],"fri":["12:00","00:00"],"sat":["11:00","00:00"],"sun":["11:00","23:00"]}'::jsonb,
    3500,
    array['Climatisation', 'Menu prix fixe', 'Tables communes'],
    'active', 4.4, 28, now(), now()
  ),
  (
    '550e8400-e29b-41d4-a716-446655440005'::uuid, null,
    'Le Plateau Café', 'le-plateau-cafe', 'cafe',
    'Café moderne avec terrasse vue sur le quartier du Plateau, idéal pour l''apéro et les réunions.',
    'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=600',
    array['https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=600','https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=600'],
    '56 Rue du Commerce, Le Plateau', 'Abidjan', 'Le Plateau',
    '+225 27 22 45 60 70', 'contact@plateaucafe.ci',
    '{"mon":["07:00","19:00"],"tue":["07:00","19:00"],"wed":["07:00","19:00"],"thu":["07:00","19:00"],"fri":["07:00","20:00"],"sat":["08:00","20:00"],"sun":["08:00","19:00"]}'::jsonb,
    6000,
    array['WiFi', 'Terrasse', 'Climatisation', 'Prises électriques'],
    'active', 4.3, 34, now(), now()
  )
on conflict (id) do nothing;
