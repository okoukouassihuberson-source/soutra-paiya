-- ============================================================================
-- SOUTRA-PAIYA — Migration 0059 : module HÔTELS (chambres + réservations)
-- ============================================================================
-- Module booking nuitées pour les venues catégorie 'hotel', 'villa', 'resort',
-- 'auberge', 'residence_meublee' (et toute catégorie business_type='hotel_rooms'
-- via la fonction get_venue_business_type de la migration 0057).
--
-- Pattern miroir du module boutique (migration 0055) mais adapté à la nuitée :
--   • rooms        : catalogue des chambres par venue
--   • room_bookings: réservations utilisateur (period DATE check-in/out)
--   • RLS + RPCs   : check availability (lock), create booking (atomique),
--                    update status (workflow merchant)
--
-- Différences clés vs orders :
--   - Période DATE (pas timestamptz) → resort en TZ Africa/Abidjan, on
--     considère la "nuit" comme un intervalle calendaire de check_in à
--     check_out (exclusif)
--   - Anti-double-booking : EXCLUSION CONSTRAINT GIST sur (room_id, daterange)
--     empêche au niveau DB qu'un même room soit réservé sur des nuits qui
--     se chevauchent → garanti même en cas de race condition
--   - Pas de notion de stock (1 chambre = 1 ressource indivisible)
--   - Workflow : pending → confirmed → checked_in → checked_out
--                                    ↓
--                                  cancelled / refunded
--
-- Non-cassant : aucune table existante modifiée. La fonction
-- paystack_settle_charge n'est PAS encore étendue pour 'room_booking' —
-- viendra dans la phase B (mobile + paiement).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Extension btree_gist pour EXCLUDE constraint (room_id + daterange)
-- ----------------------------------------------------------------------------

create extension if not exists btree_gist;

-- ----------------------------------------------------------------------------
-- 2) Enums
-- ----------------------------------------------------------------------------

do $$ begin
  create type room_status as enum (
    'active',        -- visible + réservable
    'maintenance',   -- visible mais non réservable (rénovation)
    'archived'       -- caché du catalogue
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type room_booking_status as enum (
    'pending',       -- créée, en attente de paiement
    'confirmed',     -- payée, le venue doit préparer
    'checked_in',    -- client arrivé
    'checked_out',   -- séjour terminé
    'cancelled',     -- annulée (user ou venue)
    'refunded'       -- remboursée
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type room_booking_payment_status as enum ('pending', 'paid', 'failed', 'refunded');
exception when duplicate_object then null;
end $$;

-- ----------------------------------------------------------------------------
-- 3) Table rooms — catalogue des chambres par venue
-- ----------------------------------------------------------------------------

create table if not exists public.rooms (
  id                  uuid primary key default gen_random_uuid(),
  venue_id            uuid not null references public.venues(id) on delete cascade,
  name                text not null check (length(trim(name)) between 1 and 200),
  description         text check (description is null or length(description) <= 2000),
  -- Capacité maximale en personnes
  capacity            integer not null default 2 check (capacity > 0 and capacity <= 20),
  -- Prix par nuit en FCFA
  price_per_night_xof bigint not null check (price_per_night_xof >= 0),
  -- Photos (URLs Supabase Storage, 1re est principale)
  photos              text[] not null default '{}'::text[],
  -- Équipements : "Wifi", "Climatisation", "TV", "Coffre-fort", etc.
  amenities           text[] not null default '{}'::text[],
  -- Type de chambre : "Standard", "Deluxe", "Suite", etc. (libre)
  room_type           text,
  status              room_status not null default 'active',
  position            integer,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_rooms_venue_status
  on public.rooms(venue_id, status, position nulls last, created_at desc);

create or replace function public.tg_rooms_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists trg_rooms_updated_at on public.rooms;
create trigger trg_rooms_updated_at
  before update on public.rooms
  for each row execute function public.tg_rooms_set_updated_at();

alter table public.rooms enable row level security;

drop policy if exists "rooms_select_public" on public.rooms;
create policy "rooms_select_public" on public.rooms
  for select to anon, authenticated
  using (status in ('active', 'maintenance'));

drop policy if exists "rooms_owner_all" on public.rooms;
create policy "rooms_owner_all" on public.rooms
  for all to authenticated
  using (
    exists (select 1 from public.venues v
            where v.id = rooms.venue_id and v.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.venues v
            where v.id = rooms.venue_id and v.owner_id = auth.uid())
  );

drop policy if exists "rooms_admin_all" on public.rooms;
create policy "rooms_admin_all" on public.rooms
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 4) Table room_bookings — réservations chambres
--    EXCLUDE constraint : empêche 2 bookings actifs (pending/confirmed/
--    checked_in) sur le même room avec des dates qui se chevauchent.
--    Anti-overbooking GARANTIE au niveau DB, indépendamment de la logique
--    applicative.
-- ----------------------------------------------------------------------------

create table if not exists public.room_bookings (
  id                  uuid primary key default gen_random_uuid(),
  booking_number      text not null,
  user_id             uuid not null references public.profiles(id),
  room_id             uuid not null references public.rooms(id),
  -- Denormalized pour faciliter les queries merchant côté Pro
  venue_id            uuid not null references public.venues(id),
  -- Période en DATE (pas timestamptz) : check_out exclusif (booking
  -- du 10/06 au 12/06 → 2 nuits : nuit du 10 + nuit du 11)
  check_in_date       date not null,
  check_out_date      date not null check (check_out_date > check_in_date),
  nights_count        integer not null check (nights_count > 0),
  guests_count        integer not null check (guests_count > 0),
  -- Prix au moment de la réservation (snapshot, immune aux changements)
  unit_price_xof      bigint not null check (unit_price_xof >= 0),
  total_xof           bigint not null check (total_xof >= 0),
  status              room_booking_status not null default 'pending',
  -- Contact snapshot
  contact_name        text,
  contact_phone       text,
  -- Notes du client (ex: "Arrivée tardive vers 23h")
  notes               text check (notes is null or length(notes) <= 1000),
  -- Paiement
  payment_status      room_booking_payment_status not null default 'pending',
  payment_provider    payment_provider,
  payment_ref         text,
  -- Timestamps workflow
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  confirmed_at        timestamptz,
  checked_in_at       timestamptz,
  checked_out_at      timestamptz,
  cancelled_at        timestamptz,
  cancellation_reason text
);

-- EXCLUSION : anti-double-booking au niveau DB.
-- N'inclut que les statuts qui "occupent" la chambre.
alter table public.room_bookings
  drop constraint if exists ux_room_bookings_no_overlap;
alter table public.room_bookings
  add constraint ux_room_bookings_no_overlap
  exclude using gist (
    room_id with =,
    daterange(check_in_date, check_out_date, '[)') with &&
  )
  where (status in ('pending', 'confirmed', 'checked_in'));

create unique index if not exists uq_room_bookings_number
  on public.room_bookings(venue_id, booking_number);
create index if not exists idx_room_bookings_venue_status
  on public.room_bookings(venue_id, status, check_in_date);
create index if not exists idx_room_bookings_user_recent
  on public.room_bookings(user_id, created_at desc);
create index if not exists idx_room_bookings_room_period
  on public.room_bookings(room_id, check_in_date, check_out_date)
  where status in ('pending', 'confirmed', 'checked_in');

create or replace function public.tg_room_bookings_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists trg_room_bookings_updated_at on public.room_bookings;
create trigger trg_room_bookings_updated_at
  before update on public.room_bookings
  for each row execute function public.tg_room_bookings_set_updated_at();

alter table public.room_bookings enable row level security;

drop policy if exists "room_bookings_select_client" on public.room_bookings;
create policy "room_bookings_select_client" on public.room_bookings
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "room_bookings_select_merchant" on public.room_bookings;
create policy "room_bookings_select_merchant" on public.room_bookings
  for select to authenticated
  using (
    exists (select 1 from public.venues v
            where v.id = room_bookings.venue_id and v.owner_id = auth.uid())
  );

drop policy if exists "room_bookings_select_admin" on public.room_bookings;
create policy "room_bookings_select_admin" on public.room_bookings
  for select to authenticated using (public.is_admin());

-- Pas de policy publique INSERT/UPDATE : passage exclusif par RPCs.

-- ----------------------------------------------------------------------------
-- 5) RPC : check_room_availability
--    Vérifie qu'une chambre est libre sur la période demandée.
--    Retourne {available, conflicts:[booking_ids]}.
-- ----------------------------------------------------------------------------

create or replace function public.check_room_availability(
  p_room_id   uuid,
  p_check_in  date,
  p_check_out date
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_conflicts uuid[];
  v_status    room_status;
begin
  if p_check_out <= p_check_in then
    return jsonb_build_object('available', false, 'reason', 'INVALID_PERIOD');
  end if;
  if p_check_in < current_date then
    return jsonb_build_object('available', false, 'reason', 'CHECK_IN_IN_PAST');
  end if;

  select status into v_status from public.rooms where id = p_room_id limit 1;
  if v_status is null then
    return jsonb_build_object('available', false, 'reason', 'ROOM_NOT_FOUND');
  end if;
  if v_status <> 'active' then
    return jsonb_build_object('available', false, 'reason', 'ROOM_NOT_BOOKABLE');
  end if;

  select array_agg(id) into v_conflicts
    from public.room_bookings
   where room_id = p_room_id
     and status in ('pending', 'confirmed', 'checked_in')
     and daterange(check_in_date, check_out_date, '[)') &&
         daterange(p_check_in, p_check_out, '[)');

  if v_conflicts is null or array_length(v_conflicts, 1) is null then
    return jsonb_build_object('available', true);
  end if;
  return jsonb_build_object('available', false, 'reason', 'PERIOD_TAKEN', 'conflicts', v_conflicts);
end;
$$;

grant execute on function public.check_room_availability(uuid, date, date) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 6) RPC : list_available_rooms
--    Liste les chambres d'un venue disponibles sur la période. Utilisé par
--    l'écran mobile "Hôtel" pour afficher uniquement les chambres bookables.
-- ----------------------------------------------------------------------------

create or replace function public.list_available_rooms(
  p_venue_id  uuid,
  p_check_in  date,
  p_check_out date,
  p_guests    integer default 1
) returns table (
  id                  uuid,
  name                text,
  description         text,
  room_type           text,
  capacity            integer,
  price_per_night_xof bigint,
  total_for_stay_xof  bigint,
  photos              text[],
  amenities           text[]
)
language sql
stable
security definer
set search_path = public
as $$
  with nights as (
    select greatest(1, (p_check_out - p_check_in))::integer as n
  )
  select
    r.id, r.name, r.description, r.room_type, r.capacity,
    r.price_per_night_xof,
    (r.price_per_night_xof * (select n from nights))::bigint as total_for_stay_xof,
    r.photos, r.amenities
  from public.rooms r
  cross join nights
  where r.venue_id = p_venue_id
    and r.status = 'active'
    and r.capacity >= coalesce(p_guests, 1)
    and not exists (
      select 1 from public.room_bookings b
       where b.room_id = r.id
         and b.status in ('pending', 'confirmed', 'checked_in')
         and daterange(b.check_in_date, b.check_out_date, '[)') &&
             daterange(p_check_in, p_check_out, '[)')
    )
  order by r.price_per_night_xof, r.position nulls last, r.created_at;
$$;

grant execute on function public.list_available_rooms(uuid, date, date, integer) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 7) RPC : create_room_booking (atomique)
--    Lock la chambre + insert booking. L'EXCLUDE constraint garantit qu'on
--    ne peut pas créer 2 bookings actifs sur des dates qui se chevauchent
--    (même en cas de race condition).
-- ----------------------------------------------------------------------------

create or replace function public.create_room_booking(
  p_room_id        uuid,
  p_check_in       date,
  p_check_out      date,
  p_guests         integer default 1,
  p_contact_name   text default null,
  p_contact_phone  text default null,
  p_notes          text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_room      record;
  v_nights    integer;
  v_total     bigint;
  v_booking_id uuid;
  v_number    text;
  v_year      text := to_char(now(), 'YYYY');
  v_seq       integer;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  if p_check_out <= p_check_in then
    raise exception 'INVALID_PERIOD';
  end if;
  if p_check_in < current_date then
    raise exception 'CHECK_IN_IN_PAST';
  end if;
  if p_guests is null or p_guests <= 0 then
    raise exception 'INVALID_GUESTS_COUNT';
  end if;

  -- Lock la chambre + check status/capacity
  select id, venue_id, status, capacity, price_per_night_xof
    into v_room
    from public.rooms
   where id = p_room_id
   for update;
  if v_room.id is null then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.status <> 'active' then raise exception 'ROOM_NOT_BOOKABLE'; end if;
  if v_room.capacity < p_guests then raise exception 'CAPACITY_EXCEEDED'; end if;

  v_nights := (p_check_out - p_check_in)::integer;
  v_total  := v_room.price_per_night_xof * v_nights;

  -- Numéro lisible BKG-YYYY-XXXX par venue
  select coalesce(max((regexp_match(booking_number, '\d+$'))[1]::integer), 0) + 1
    into v_seq
    from public.room_bookings
   where venue_id = v_room.venue_id
     and booking_number like 'BKG-' || v_year || '-%';
  v_number := 'BKG-' || v_year || '-' || lpad(v_seq::text, 4, '0');

  -- INSERT : si chevauchement avec un autre booking actif, l'EXCLUDE
  -- constraint lèvera une erreur SQLSTATE '23P01' (exclusion_violation).
  -- On la traduit en exception métier propre.
  begin
    insert into public.room_bookings (
      booking_number, user_id, room_id, venue_id,
      check_in_date, check_out_date, nights_count, guests_count,
      unit_price_xof, total_xof,
      status, contact_name, contact_phone, notes
    )
    values (
      v_number, v_uid, p_room_id, v_room.venue_id,
      p_check_in, p_check_out, v_nights, p_guests,
      v_room.price_per_night_xof, v_total,
      'pending',
      nullif(trim(coalesce(p_contact_name, '')), ''),
      nullif(trim(coalesce(p_contact_phone, '')), ''),
      nullif(trim(coalesce(p_notes, '')), '')
    )
    returning id into v_booking_id;
  exception when exclusion_violation then
    raise exception 'PERIOD_TAKEN';
  end;

  return jsonb_build_object(
    'ok', true,
    'booking_id', v_booking_id,
    'booking_number', v_number,
    'nights_count', v_nights,
    'total_xof', v_total
  );
end;
$$;

revoke execute on function public.create_room_booking(uuid, date, date, integer, text, text, text) from public;
grant execute on function public.create_room_booking(uuid, date, date, integer, text, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 8) RPC : update_room_booking_status (merchant workflow)
-- ----------------------------------------------------------------------------

create or replace function public.update_room_booking_status(
  p_booking_id uuid,
  p_status     text,
  p_reason     text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_booking record;
  v_status  room_booking_status;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  begin
    v_status := p_status::room_booking_status;
  exception when others then raise exception 'INVALID_STATUS'; end;

  select b.id, b.venue_id, b.status, b.user_id, v.owner_id
    into v_booking
    from public.room_bookings b
    join public.venues v on v.id = b.venue_id
   where b.id = p_booking_id
   limit 1;
  if v_booking.id is null then raise exception 'BOOKING_NOT_FOUND'; end if;

  -- Le client peut annuler sa propre réservation pending/confirmed
  -- Le merchant peut tout faire (confirmer, check-in/out, cancel, refund)
  if v_booking.owner_id <> v_uid
     and not public.is_admin()
     and not (v_booking.user_id = v_uid and v_status = 'cancelled' and v_booking.status in ('pending', 'confirmed'))
  then
    raise exception 'NOT_AUTHORIZED';
  end if;

  update public.room_bookings
     set status = v_status,
         confirmed_at   = case when v_status = 'confirmed' and confirmed_at is null then now() else confirmed_at end,
         checked_in_at  = case when v_status = 'checked_in' and checked_in_at is null then now() else checked_in_at end,
         checked_out_at = case when v_status = 'checked_out' and checked_out_at is null then now() else checked_out_at end,
         cancelled_at   = case when v_status = 'cancelled' and cancelled_at is null then now() else cancelled_at end,
         cancellation_reason = case when v_status = 'cancelled'
                                     then nullif(trim(coalesce(p_reason, '')), '')
                                     else cancellation_reason end,
         updated_at = now()
   where id = p_booking_id;

  return jsonb_build_object('ok', true, 'status', v_status::text);
end;
$$;

revoke execute on function public.update_room_booking_status(uuid, text, text) from public;
grant execute on function public.update_room_booking_status(uuid, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 9) RPC : list_my_room_bookings (client)
-- ----------------------------------------------------------------------------

create or replace function public.list_my_room_bookings(p_limit integer default 50)
returns table (
  booking_id          uuid,
  booking_number      text,
  venue_id            uuid,
  venue_name          text,
  venue_cover         text,
  room_id             uuid,
  room_name           text,
  check_in_date       date,
  check_out_date      date,
  nights_count        integer,
  guests_count        integer,
  total_xof           bigint,
  status              room_booking_status,
  payment_status      room_booking_payment_status,
  created_at          timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.id, b.booking_number, b.venue_id, v.name, v.cover_url,
    b.room_id, r.name, b.check_in_date, b.check_out_date,
    b.nights_count, b.guests_count, b.total_xof,
    b.status, b.payment_status, b.created_at
  from public.room_bookings b
  join public.venues v on v.id = b.venue_id
  join public.rooms r on r.id = b.room_id
  where b.user_id = auth.uid()
  order by b.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

grant execute on function public.list_my_room_bookings(integer) to authenticated;

-- ----------------------------------------------------------------------------
-- 10) Commentaires
-- ----------------------------------------------------------------------------

comment on table public.rooms is
  'Catalogue de chambres par venue (hôtel/villa/resort/auberge/résidence). RLS public read active/maintenance, write owner.';
comment on table public.room_bookings is
  'Réservations chambres avec EXCLUDE constraint GIST anti-overbooking au niveau DB. Booking_number BKG-YYYY-XXXX par venue.';
comment on function public.create_room_booking is
  'Atomique : lock chambre + EXCLUDE constraint anti-overlap. Lève PERIOD_TAKEN si conflit.';
