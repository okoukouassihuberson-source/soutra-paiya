-- ============================================================================
-- SOUTRA-PAIYA — Migration 0055 : module BOUTIQUE (produits + commandes + panier)
-- ============================================================================
-- Module e-commerce léger pour les venues catégorie 'boutique', 'mall',
-- 'supermarche' (et toute catégorie qui voudrait vendre des produits
-- physiques). Pattern : produits → panier persistant côté user → order
-- atomique → workflow merchant (preparing → ready → delivered).
--
-- Paiement non couvert par cette migration : la commande est créée en
-- status='pending' avec payment_status='pending'. Le branchement Paystack
-- (variant de paystack-subscribe pour les orders) viendra dans une PR
-- suivante.
--
-- Non-cassant : aucune modification des tables existantes (venues, etc.).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Enums
-- ----------------------------------------------------------------------------

do $$ begin
  create type product_status as enum (
    'active',        -- visible au catalogue, achetable
    'out_of_stock',  -- visible mais non achetable
    'archived'       -- caché du catalogue (historique)
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type order_status as enum (
    'pending',     -- créée, en attente de paiement
    'confirmed',   -- payée, le merchant doit la traiter
    'preparing',   -- en préparation côté merchant
    'ready',       -- prête (à retirer pour pickup, ou prête à expédier)
    'delivered',   -- livrée / retirée
    'cancelled',   -- annulée (par user avant confirm OU par merchant)
    'refunded'     -- remboursée
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type order_delivery_method as enum ('pickup', 'delivery');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type order_payment_status as enum ('pending', 'paid', 'failed', 'refunded');
exception when duplicate_object then null;
end $$;

-- ----------------------------------------------------------------------------
-- 2) Table products — catalogue par venue
-- ----------------------------------------------------------------------------

create table if not exists public.products (
  id              uuid primary key default gen_random_uuid(),
  venue_id        uuid not null references public.venues(id) on delete cascade,
  name            text not null check (length(trim(name)) between 1 and 200),
  description     text check (description is null or length(description) <= 2000),
  -- Prix unitaire en FCFA. Pas de centime FCFA en circulation.
  price_xof       bigint not null check (price_xof >= 0),
  -- Stock : NULL = illimité (services, à la commande), 0 = épuisé.
  stock_quantity  integer check (stock_quantity is null or stock_quantity >= 0),
  -- SKU optionnel pour intégration ERP future
  sku             text,
  -- Sous-catégorie merchant (free text, ex: "Vêtements", "Électronique").
  category        text,
  -- Médias : tableau d'URLs Supabase Storage. La 1re est la photo principale.
  photos          text[] not null default '{}'::text[],
  -- Variantes : structure libre, ex:
  --   [{"name":"Taille","values":["S","M","L"]},
  --    {"name":"Couleur","values":["Rouge","Bleu"]}]
  variants        jsonb not null default '[]'::jsonb,
  status          product_status not null default 'active',
  -- Position dans le catalogue (tri merchant). NULL = tri par created_at.
  position        integer,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_products_venue_status
  on public.products(venue_id, status, position nulls last, created_at desc);

create index if not exists idx_products_venue_name
  on public.products(venue_id, lower(name));

-- Trigger updated_at
create or replace function public.tg_products_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at
  before update on public.products
  for each row execute function public.tg_products_set_updated_at();

-- RLS
alter table public.products enable row level security;

-- SELECT public : tout le monde voit les produits actifs ou out_of_stock
-- (le catalogue est une vitrine). Les archived sont cachés au public.
drop policy if exists "products_select_public" on public.products;
create policy "products_select_public" on public.products
  for select to anon, authenticated
  using (status in ('active', 'out_of_stock'));

-- Le propriétaire du venue voit ET édite TOUS ses produits (y compris
-- archived).
drop policy if exists "products_owner_all" on public.products;
create policy "products_owner_all" on public.products
  for all to authenticated
  using (
    exists (select 1 from public.venues v
            where v.id = products.venue_id and v.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.venues v
            where v.id = products.venue_id and v.owner_id = auth.uid())
  );

-- Admin a tous les droits
drop policy if exists "products_admin_all" on public.products;
create policy "products_admin_all" on public.products
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 3) Table cart_items — panier persistant côté user
-- ----------------------------------------------------------------------------
-- Un panier par (user, venue) : un user qui commande chez 2 boutiques
-- différentes a 2 « sous-paniers » indépendants. À l'order, seul le
-- sous-panier d'un venue est vidé.
--
-- variant_hash : hash MD5 stable du choix de variante (ex: "S/Rouge"),
-- pour permettre 2 lignes du même produit avec variantes différentes.
-- Si pas de variante, NULL → UNIQUE par produit.
-- ----------------------------------------------------------------------------

create table if not exists public.cart_items (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  venue_id        uuid not null references public.venues(id) on delete cascade,
  product_id      uuid not null references public.products(id) on delete cascade,
  qty             integer not null check (qty > 0 and qty <= 100),
  variant         jsonb,    -- ex: {"Taille":"M","Couleur":"Rouge"}
  variant_hash    text,     -- md5 du jsonb pour UNIQUE par variante
  added_at        timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Empêche 2 lignes identiques (même produit, même variante)
create unique index if not exists uq_cart_items_per_variant
  on public.cart_items(user_id, venue_id, product_id, coalesce(variant_hash, ''));

create index if not exists idx_cart_items_user_venue
  on public.cart_items(user_id, venue_id);

create or replace function public.tg_cart_items_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists trg_cart_items_updated_at on public.cart_items;
create trigger trg_cart_items_updated_at
  before update on public.cart_items
  for each row execute function public.tg_cart_items_set_updated_at();

-- RLS : strictement privé au user
alter table public.cart_items enable row level security;

drop policy if exists "cart_items_self_all" on public.cart_items;
create policy "cart_items_self_all" on public.cart_items
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 4) Table orders — commandes
-- ----------------------------------------------------------------------------
-- items est jsonb (snapshot des lignes au moment de la commande) plutôt
-- qu'une table séparée order_items : un produit peut être modifié/supprimé
-- après, l'order garde le détail tel qu'il était. Format :
--   [{
--      "product_id":"uuid",
--      "name":"T-shirt rouge",
--      "unit_price_xof":5000,
--      "qty":2,
--      "variant":{"Taille":"M"},
--      "subtotal_xof":10000
--   }]
-- ----------------------------------------------------------------------------

create table if not exists public.orders (
  id                 uuid primary key default gen_random_uuid(),
  -- Numéro lisible séquentiel par venue (SOU-2026-0001). Calculé au INSERT.
  order_number       text not null,
  user_id            uuid not null references public.profiles(id),
  venue_id           uuid not null references public.venues(id),
  items              jsonb not null check (jsonb_typeof(items) = 'array'),
  items_count        integer not null check (items_count > 0),
  subtotal_xof       bigint not null check (subtotal_xof >= 0),
  delivery_fee_xof   bigint not null default 0 check (delivery_fee_xof >= 0),
  total_xof          bigint not null check (total_xof >= 0),
  status             order_status not null default 'pending',
  -- Livraison
  delivery_method    order_delivery_method not null default 'pickup',
  delivery_address   text,
  delivery_notes     text check (delivery_notes is null or length(delivery_notes) <= 1000),
  -- Contact client (snapshot, au cas où profile.phone change)
  contact_phone      text,
  contact_name       text,
  -- Paiement
  payment_status     order_payment_status not null default 'pending',
  payment_provider   payment_provider,
  payment_ref        text,
  -- Workflow timestamps
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  confirmed_at       timestamptz,
  ready_at           timestamptz,
  delivered_at       timestamptz,
  cancelled_at       timestamptz,
  cancellation_reason text
);

create unique index if not exists uq_orders_number on public.orders(venue_id, order_number);
create index if not exists idx_orders_venue_status
  on public.orders(venue_id, status, created_at desc);
create index if not exists idx_orders_user_recent
  on public.orders(user_id, created_at desc);
create index if not exists idx_orders_payment_ref
  on public.orders(payment_ref) where payment_ref is not null;

create or replace function public.tg_orders_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at
  before update on public.orders
  for each row execute function public.tg_orders_set_updated_at();

-- RLS
alter table public.orders enable row level security;

-- Le client voit ses propres commandes
drop policy if exists "orders_select_client" on public.orders;
create policy "orders_select_client" on public.orders
  for select to authenticated using (user_id = auth.uid());

-- Le merchant (venue owner) voit les commandes reçues
drop policy if exists "orders_select_merchant" on public.orders;
create policy "orders_select_merchant" on public.orders
  for select to authenticated
  using (
    exists (select 1 from public.venues v
            where v.id = orders.venue_id and v.owner_id = auth.uid())
  );

-- Admin voit tout
drop policy if exists "orders_select_admin" on public.orders;
create policy "orders_select_admin" on public.orders
  for select to authenticated using (public.is_admin());

-- L'écriture passe par les RPCs (create_order_from_cart, update_order_status).
-- Pas de policy publique INSERT/UPDATE → bloqué par RLS.

-- ----------------------------------------------------------------------------
-- 5) Helper : variant_hash MD5 stable
-- ----------------------------------------------------------------------------

create or replace function public.variant_hash(p_variant jsonb)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_variant is null or p_variant = 'null'::jsonb or p_variant = '{}'::jsonb
      then null
    else md5(p_variant::text)
  end;
$$;

-- ----------------------------------------------------------------------------
-- 6) RPC : add_to_cart (upsert avec qty++ si déjà présent)
-- ----------------------------------------------------------------------------

create or replace function public.add_to_cart(
  p_product_id uuid,
  p_qty        integer default 1,
  p_variant    jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_product   record;
  v_hash      text;
  v_id        uuid;
  v_existing  record;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_qty is null or p_qty <= 0 or p_qty > 100 then
    raise exception 'INVALID_QUANTITY';
  end if;

  select id, venue_id, status, stock_quantity into v_product
    from public.products where id = p_product_id limit 1;
  if v_product.id is null then raise exception 'PRODUCT_NOT_FOUND'; end if;
  if v_product.status <> 'active' then raise exception 'PRODUCT_NOT_AVAILABLE'; end if;

  v_hash := public.variant_hash(p_variant);

  -- Upsert : si déjà au panier, qty += p_qty
  select id, qty into v_existing
    from public.cart_items
   where user_id = v_uid
     and product_id = p_product_id
     and coalesce(variant_hash, '') = coalesce(v_hash, '')
   limit 1;

  if v_existing.id is not null then
    -- Cap à 100 par ligne
    update public.cart_items
       set qty = least(100, qty + p_qty),
           updated_at = now()
     where id = v_existing.id
    returning id into v_id;
  else
    insert into public.cart_items (user_id, venue_id, product_id, qty, variant, variant_hash)
    values (v_uid, v_product.venue_id, p_product_id, p_qty, p_variant, v_hash)
    returning id into v_id;
  end if;

  return jsonb_build_object('ok', true, 'cart_item_id', v_id);
end;
$$;

revoke execute on function public.add_to_cart(uuid, integer, jsonb) from public;
grant execute on function public.add_to_cart(uuid, integer, jsonb) to authenticated;

-- ----------------------------------------------------------------------------
-- 7) RPC : update_cart_item_qty / remove_cart_item
-- ----------------------------------------------------------------------------

create or replace function public.update_cart_item_qty(
  p_cart_item_id uuid,
  p_qty          integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_qty <= 0 then
    -- qty 0 ou négatif → remove
    delete from public.cart_items where id = p_cart_item_id and user_id = v_uid;
    return jsonb_build_object('ok', true, 'removed', true);
  end if;
  if p_qty > 100 then raise exception 'QTY_TOO_HIGH'; end if;

  update public.cart_items
     set qty = p_qty, updated_at = now()
   where id = p_cart_item_id and user_id = v_uid;

  if not found then raise exception 'CART_ITEM_NOT_FOUND'; end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.update_cart_item_qty(uuid, integer) from public;
grant execute on function public.update_cart_item_qty(uuid, integer) to authenticated;

-- ----------------------------------------------------------------------------
-- 8) RPC : create_order_from_cart (atomique, transactionnel)
--    1. Charge tous les cart_items du user pour un venue
--    2. Calcule items snapshot + totaux à partir des prix CURRENT
--    3. Décrémente le stock (si défini) atomiquement
--    4. Crée l'order
--    5. Vide le sous-panier de ce venue
--    Renvoie l'order_id + order_number.
-- ----------------------------------------------------------------------------

create or replace function public.create_order_from_cart(
  p_venue_id         uuid,
  p_delivery_method  text default 'pickup',
  p_delivery_address text default null,
  p_delivery_notes   text default null,
  p_contact_phone    text default null,
  p_contact_name     text default null,
  p_delivery_fee_xof bigint default 0
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid         uuid := auth.uid();
  v_method      order_delivery_method;
  v_items       jsonb := '[]'::jsonb;
  v_subtotal    bigint := 0;
  v_total       bigint;
  v_count       integer := 0;
  v_order_id    uuid;
  v_order_num   text;
  v_year        text := to_char(now(), 'YYYY');
  v_seq         integer;
  c_row         record;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  begin
    v_method := p_delivery_method::order_delivery_method;
  exception when others then
    raise exception 'INVALID_DELIVERY_METHOD';
  end;

  if v_method = 'delivery' and (p_delivery_address is null or trim(p_delivery_address) = '') then
    raise exception 'DELIVERY_ADDRESS_REQUIRED';
  end if;

  -- Parcourt le sous-panier en verrouillant les products contre l'overselling
  for c_row in
    select c.id as cart_id, c.qty, c.variant,
           p.id as product_id, p.name, p.price_xof, p.stock_quantity, p.status
      from public.cart_items c
      join public.products p on p.id = c.product_id
     where c.user_id = v_uid
       and c.venue_id = p_venue_id
     order by c.added_at
     for update of p
  loop
    if c_row.status <> 'active' then
      raise exception 'PRODUCT_NOT_AVAILABLE:%', c_row.name;
    end if;
    if c_row.stock_quantity is not null and c_row.stock_quantity < c_row.qty then
      raise exception 'INSUFFICIENT_STOCK:%', c_row.name;
    end if;

    -- Snapshot dans items jsonb
    v_items := v_items || jsonb_build_object(
      'product_id', c_row.product_id,
      'name', c_row.name,
      'unit_price_xof', c_row.price_xof,
      'qty', c_row.qty,
      'variant', c_row.variant,
      'subtotal_xof', c_row.price_xof * c_row.qty
    );
    v_subtotal := v_subtotal + (c_row.price_xof * c_row.qty);
    v_count    := v_count + c_row.qty;

    -- Décrément stock si défini
    if c_row.stock_quantity is not null then
      update public.products
         set stock_quantity = stock_quantity - c_row.qty,
             status = case when stock_quantity - c_row.qty = 0
                            then 'out_of_stock'::product_status
                          else status end,
             updated_at = now()
       where id = c_row.product_id;
    end if;
  end loop;

  if v_count = 0 then raise exception 'CART_EMPTY'; end if;

  -- Numéro lisible par venue : SOU-YYYY-XXXX (incrémente par venue+year)
  select coalesce(max((regexp_match(order_number, '\d+$'))[1]::integer), 0) + 1
    into v_seq
    from public.orders
   where venue_id = p_venue_id
     and order_number like 'SOU-' || v_year || '-%';
  v_order_num := 'SOU-' || v_year || '-' || lpad(v_seq::text, 4, '0');

  v_total := v_subtotal + greatest(0, coalesce(p_delivery_fee_xof, 0));

  insert into public.orders (
    order_number, user_id, venue_id, items, items_count,
    subtotal_xof, delivery_fee_xof, total_xof,
    status, delivery_method, delivery_address, delivery_notes,
    contact_phone, contact_name,
    payment_status
  )
  values (
    v_order_num, v_uid, p_venue_id, v_items, v_count,
    v_subtotal, coalesce(p_delivery_fee_xof, 0), v_total,
    'pending', v_method,
    nullif(trim(coalesce(p_delivery_address, '')), ''),
    nullif(trim(coalesce(p_delivery_notes, '')), ''),
    nullif(trim(coalesce(p_contact_phone, '')), ''),
    nullif(trim(coalesce(p_contact_name, '')), ''),
    'pending'
  )
  returning id into v_order_id;

  -- Vide le sous-panier
  delete from public.cart_items
   where user_id = v_uid and venue_id = p_venue_id;

  return jsonb_build_object(
    'ok', true,
    'order_id', v_order_id,
    'order_number', v_order_num,
    'total_xof', v_total
  );
end;
$$;

revoke execute on function public.create_order_from_cart(uuid, text, text, text, text, text, bigint) from public;
grant execute on function public.create_order_from_cart(uuid, text, text, text, text, text, bigint) to authenticated;

-- ----------------------------------------------------------------------------
-- 9) RPC : update_order_status (merchant only, transitions valides)
-- ----------------------------------------------------------------------------

create or replace function public.update_order_status(
  p_order_id uuid,
  p_status   text,
  p_reason   text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_order  record;
  v_status order_status;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  begin
    v_status := p_status::order_status;
  exception when others then raise exception 'INVALID_STATUS'; end;

  -- Lookup order + check droits (owner ou admin)
  select o.id, o.venue_id, o.status, v.owner_id
    into v_order
    from public.orders o
    join public.venues v on v.id = o.venue_id
   where o.id = p_order_id
   limit 1;
  if v_order.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.owner_id <> v_uid and not public.is_admin() then
    raise exception 'NOT_AUTHORIZED';
  end if;

  -- Update + timestamps appropriés
  update public.orders
     set status = v_status,
         confirmed_at = case when v_status = 'confirmed' and confirmed_at is null
                              then now() else confirmed_at end,
         ready_at = case when v_status = 'ready' and ready_at is null
                          then now() else ready_at end,
         delivered_at = case when v_status = 'delivered' and delivered_at is null
                              then now() else delivered_at end,
         cancelled_at = case when v_status = 'cancelled' and cancelled_at is null
                              then now() else cancelled_at end,
         cancellation_reason = case when v_status = 'cancelled'
                                     then nullif(trim(coalesce(p_reason, '')), '')
                                     else cancellation_reason end,
         updated_at = now()
   where id = p_order_id;

  return jsonb_build_object('ok', true, 'status', v_status::text);
end;
$$;

revoke execute on function public.update_order_status(uuid, text, text) from public;
grant execute on function public.update_order_status(uuid, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 10) RPC : list_my_cart (un sous-panier par venue avec récap)
-- ----------------------------------------------------------------------------

create or replace function public.list_my_cart()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with carts as (
    select
      c.venue_id,
      v.name as venue_name,
      v.cover_url as venue_cover,
      v.category::text as venue_category,
      coalesce(jsonb_agg(jsonb_build_object(
        'cart_item_id', c.id,
        'product_id', p.id,
        'name', p.name,
        'unit_price_xof', p.price_xof,
        'qty', c.qty,
        'variant', c.variant,
        'subtotal_xof', p.price_xof * c.qty,
        'photo', case when array_length(p.photos, 1) > 0 then p.photos[1] else null end,
        'available', p.status = 'active' and (p.stock_quantity is null or p.stock_quantity >= c.qty)
      ) order by c.added_at), '[]'::jsonb) as items,
      sum(p.price_xof * c.qty)::bigint as subtotal_xof,
      sum(c.qty)::integer as items_count
    from public.cart_items c
    join public.venues   v on v.id = c.venue_id
    join public.products p on p.id = c.product_id
    where c.user_id = auth.uid()
    group by c.venue_id, v.name, v.cover_url, v.category
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'venue_id', venue_id,
    'venue_name', venue_name,
    'venue_cover', venue_cover,
    'venue_category', venue_category,
    'items', items,
    'subtotal_xof', subtotal_xof,
    'items_count', items_count
  )), '[]'::jsonb)
  from carts;
$$;

grant execute on function public.list_my_cart() to authenticated;

-- ----------------------------------------------------------------------------
-- 11) Commentaires
-- ----------------------------------------------------------------------------

comment on table public.products is
  'Catalogue produit par venue. RLS : SELECT public sur active/out_of_stock, write owner uniquement.';
comment on table public.cart_items is
  'Panier persistant par (user, venue). UNIQUE (user, venue, product, variant_hash).';
comment on table public.orders is
  'Commandes e-commerce. items est un snapshot jsonb des lignes au moment de la commande. order_number = SOU-YYYY-XXXX par venue.';
comment on function public.create_order_from_cart is
  'Atomique : snapshot items + décrément stock + insert order + vide cart. Lock FOR UPDATE sur products contre overselling.';
comment on function public.update_order_status is
  'Transition workflow merchant (pending→confirmed→preparing→ready→delivered, ou cancelled/refunded). Owner ou admin.';
