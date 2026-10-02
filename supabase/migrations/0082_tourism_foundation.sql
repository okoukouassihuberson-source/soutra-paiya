-- ============================================================================
-- SOUTRA PLAYCE V2 — Migration 0082 : fondation touristique (100 % additive)
-- ============================================================================
-- Ajoute les structures manquantes pour la plateforme touristique, SANS
-- modifier ni supprimer quoi que ce soit d'existant :
--   • destinations        : pays / régions / villes / communes / sites
--   • trips               : voyages groupés NATIONAUX et INTERNATIONAUX
--   • trip_itineraries    : programme jour par jour (voyages ET circuits)
--   • trip_packages       : formules (Essentielle/Confort/Premium/VIP/custom)
--   • trip_bookings       : réservations de places (anti-surbooking atomique)
--   • rôle 'guide' ajouté à user_role
--
-- Déjà couvert par le système existant (réutilisé, non recréé) :
--   venues (hébergement, restauration, loisirs, sites), rooms/room_bookings,
--   reservations, events/tickets (QR), reviews, favorites, notifications,
--   promo_codes, subscriptions, loyalty, paiements Paystack/GeniusPay.
-- Le paiement des trip_bookings sera branché sur les Edge Functions de
-- paiement existantes dans la phase suivante (voir docs/V2_AUDIT.md).
-- ============================================================================

-- Rôle GUIDE (ADD VALUE est non destructif ; non utilisé dans cette migration).
alter type user_role add value if not exists 'guide';

-- ----------------------------------------------------------------------------
-- 1) Enums
-- ----------------------------------------------------------------------------
do $$ begin
  create type destination_kind as enum ('country','region','city','commune','site');
exception when duplicate_object then null; end $$;

do $$ begin
  create type trip_scope as enum ('national','international');
exception when duplicate_object then null; end $$;

do $$ begin
  create type trip_status as enum ('draft','published','full','closed','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type trip_booking_status as enum ('pending','paid','confirmed','cancelled','used');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- 2) destinations
-- ----------------------------------------------------------------------------
create table if not exists public.destinations (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name          text not null check (length(trim(name)) between 1 and 200),
  kind          destination_kind not null default 'city',
  parent_id     uuid references public.destinations(id) on delete set null,
  country_code  text not null default 'CI' check (country_code ~ '^[A-Z]{2}$'),
  tagline       text check (tagline is null or length(tagline) <= 200),
  description   text,
  history       text,
  cover_url     text,
  gallery_urls  text[] not null default '{}',
  video_urls    text[] not null default '{}',
  latitude      double precision check (latitude  between -90  and 90),
  longitude     double precision check (longitude between -180 and 180),
  -- Nom de ville tel qu'écrit dans venues.city : sert à relier la destination
  -- aux établissements existants sans toucher à la table venues.
  venue_city    text,
  is_featured   boolean not null default false,
  is_published  boolean not null default true,
  position      integer,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_destinations_kind on public.destinations(kind, is_published);
create index if not exists idx_destinations_country on public.destinations(country_code);
create index if not exists idx_destinations_parent on public.destinations(parent_id);
create index if not exists idx_destinations_venue_city on public.destinations(lower(venue_city));

-- ----------------------------------------------------------------------------
-- 3) trips
-- ----------------------------------------------------------------------------
create table if not exists public.trips (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  organizer_id     uuid not null references public.profiles(id),
  scope            trip_scope not null,
  title            text not null check (length(trim(title)) between 1 and 200),
  summary          text check (summary is null or length(summary) <= 500),
  description      text,
  destination_id   uuid references public.destinations(id) on delete set null,
  country          text not null default 'Côte d''Ivoire',
  country_code     text not null default 'CI' check (country_code ~ '^[A-Z]{2}$'),
  continent        text check (continent in ('afrique','europe','asie','amerique','oceanie')),
  city             text,
  cover_url        text,
  gallery_urls     text[] not null default '{}',
  starts_on        date not null,
  ends_on          date not null,
  duration_days    integer generated always as ((ends_on - starts_on) + 1) stored,
  base_price_xof   bigint not null check (base_price_xof >= 0),
  deposit_pct      integer not null default 100 check (deposit_pct between 10 and 100),
  seats_total      integer not null check (seats_total > 0),
  seats_booked     integer not null default 0 check (seats_booked >= 0),
  departure_point  text,
  departure_time   time,
  return_time      time,
  -- Inclusions détaillées : transport, hébergement, repas, activités, vol,
  -- hôtel, transfert, visites, assurance, visa… (affichées en liste)
  transport        text,
  lodging          text,
  meals            text,
  activities       text[] not null default '{}',
  inclusions       text[] not null default '{}',
  exclusions       text[] not null default '{}',
  flight_info      text,
  hotel_info       text,
  transfer_info    text,
  insurance_info   text,
  visa_info        text,
  conditions       text,
  contact_phone    text,
  contact_whatsapp text,
  contact_email    text,
  highlight        text check (highlight in ('a_la_une','populaire','nouveau','promotion','coup_de_coeur','recommande')),
  is_circuit       boolean not null default false,
  commission_pct   numeric(5,2) check (commission_pct is null or commission_pct between 0 and 100),
  status           trip_status not null default 'draft',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint trips_dates_check check (ends_on >= starts_on),
  constraint trips_seats_check check (seats_booked <= seats_total)
);
create index if not exists idx_trips_listing on public.trips(scope, status, starts_on);
create index if not exists idx_trips_destination on public.trips(destination_id);
create index if not exists idx_trips_organizer on public.trips(organizer_id);
create index if not exists idx_trips_country on public.trips(country_code, continent);

-- ----------------------------------------------------------------------------
-- 4) trip_itineraries — programme jour par jour (voyages & circuits)
-- ----------------------------------------------------------------------------
create table if not exists public.trip_itineraries (
  id             uuid primary key default gen_random_uuid(),
  trip_id        uuid not null references public.trips(id) on delete cascade,
  day_number     integer not null check (day_number >= 1),
  title          text not null,
  description    text,
  stops          text[] not null default '{}',
  destination_id uuid references public.destinations(id) on delete set null,
  meals          text,
  lodging        text,
  unique (trip_id, day_number)
);

-- ----------------------------------------------------------------------------
-- 5) trip_packages — formules (propres à un voyage)
-- ----------------------------------------------------------------------------
create table if not exists public.trip_packages (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid not null references public.trips(id) on delete cascade,
  code         text not null default 'custom'
               check (code in ('essentielle','confort','premium','vip','custom')),
  name         text not null,
  description  text,
  includes     text[] not null default '{}',
  price_xof    bigint not null check (price_xof >= 0),
  position     integer not null default 0,
  is_active    boolean not null default true,
  unique (trip_id, name)
);
create index if not exists idx_trip_packages_trip on public.trip_packages(trip_id, position);

-- ----------------------------------------------------------------------------
-- 6) trip_bookings
-- ----------------------------------------------------------------------------
create table if not exists public.trip_bookings (
  id             uuid primary key default gen_random_uuid(),
  reference      text not null unique,
  user_id        uuid not null references public.profiles(id),
  trip_id        uuid not null references public.trips(id),
  package_id     uuid references public.trip_packages(id),
  participants   integer not null check (participants between 1 and 50),
  unit_price_xof bigint not null check (unit_price_xof >= 0),
  total_xof      bigint not null check (total_xof >= 0),
  paid_xof       bigint not null default 0 check (paid_xof >= 0),
  status         trip_booking_status not null default 'pending',
  contact_phone  text,
  notes          text check (notes is null or length(notes) <= 1000),
  -- Jeton opaque encodé dans le QR code du billet (scan organisateur).
  qr_token       text not null unique default replace(gen_random_uuid()::text, '-', ''),
  used_at        timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint trip_bookings_paid_check check (paid_xof <= total_xof)
);
create index if not exists idx_trip_bookings_user on public.trip_bookings(user_id, created_at desc);
create index if not exists idx_trip_bookings_trip on public.trip_bookings(trip_id, status);

-- updated_at
create or replace function public.tg_tourism_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

do $$
declare t text;
begin
  foreach t in array array['destinations','trips','trip_bookings'] loop
    execute format('drop trigger if exists trg_%1$s_updated_at on public.%1$s', t);
    execute format('create trigger trg_%1$s_updated_at before update on public.%1$s
                    for each row execute function public.tg_tourism_set_updated_at()', t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 7) RLS
-- ----------------------------------------------------------------------------
alter table public.destinations     enable row level security;
alter table public.trips            enable row level security;
alter table public.trip_itineraries enable row level security;
alter table public.trip_packages    enable row level security;
alter table public.trip_bookings    enable row level security;

-- destinations : lecture publique, écriture admin
drop policy if exists destinations_select_public on public.destinations;
create policy destinations_select_public on public.destinations
  for select to anon, authenticated using (is_published or public.is_admin());
drop policy if exists destinations_admin_write on public.destinations;
create policy destinations_admin_write on public.destinations
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- trips : lecture publique des voyages publiés ; l'organisateur gère les siens
drop policy if exists trips_select_public on public.trips;
create policy trips_select_public on public.trips
  for select to anon, authenticated
  using (status in ('published','full') or organizer_id = auth.uid() or public.is_admin());
drop policy if exists trips_organizer_insert on public.trips;
create policy trips_organizer_insert on public.trips
  for insert to authenticated
  with check (
    organizer_id = auth.uid()
    and status = 'draft'
    and exists (select 1 from public.profiles p
                where p.id = auth.uid() and p.role::text in ('organizer','venue_owner','guide','admin'))
  );
drop policy if exists trips_organizer_update on public.trips;
create policy trips_organizer_update on public.trips
  for update to authenticated
  using (organizer_id = auth.uid() or public.is_admin())
  with check (organizer_id = auth.uid() or public.is_admin());
drop policy if exists trips_admin_delete on public.trips;
create policy trips_admin_delete on public.trips
  for delete to authenticated using (public.is_admin());

-- Un organisateur non-admin ne peut ni publier lui-même, ni toucher aux
-- compteurs/commission : verrouillé par trigger (la RLS ne voit pas les colonnes).
create or replace function public.tg_trips_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() or auth.uid() is null then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    new.seats_booked   := old.seats_booked;
    new.commission_pct := old.commission_pct;
    new.organizer_id   := old.organizer_id;
    if new.status is distinct from old.status
       and not (new.status in ('draft','closed','cancelled')) then
      new.status := old.status;  -- la publication passe par la modération admin
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists trg_trips_guard on public.trips;
create trigger trg_trips_guard before insert or update on public.trips
  for each row execute function public.tg_trips_guard();

-- itinéraires / formules : lecture si le voyage est lisible, écriture organisateur
drop policy if exists trip_itineraries_select on public.trip_itineraries;
create policy trip_itineraries_select on public.trip_itineraries
  for select to anon, authenticated
  using (exists (select 1 from public.trips t where t.id = trip_id));  -- RLS de trips s'applique
drop policy if exists trip_itineraries_owner_write on public.trip_itineraries;
create policy trip_itineraries_owner_write on public.trip_itineraries
  for all to authenticated
  using (exists (select 1 from public.trips t where t.id = trip_id
                 and (t.organizer_id = auth.uid() or public.is_admin())))
  with check (exists (select 1 from public.trips t where t.id = trip_id
                 and (t.organizer_id = auth.uid() or public.is_admin())));

drop policy if exists trip_packages_select on public.trip_packages;
create policy trip_packages_select on public.trip_packages
  for select to anon, authenticated
  using (is_active and exists (select 1 from public.trips t where t.id = trip_id));
drop policy if exists trip_packages_owner_write on public.trip_packages;
create policy trip_packages_owner_write on public.trip_packages
  for all to authenticated
  using (exists (select 1 from public.trips t where t.id = trip_id
                 and (t.organizer_id = auth.uid() or public.is_admin())))
  with check (exists (select 1 from public.trips t where t.id = trip_id
                 and (t.organizer_id = auth.uid() or public.is_admin())));

-- trip_bookings : lecture par le client, l'organisateur du voyage et l'admin.
-- AUCUNE écriture directe : tout passe par les RPC security definer ci-dessous.
drop policy if exists trip_bookings_select on public.trip_bookings;
create policy trip_bookings_select on public.trip_bookings
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_admin()
    or exists (select 1 from public.trips t where t.id = trip_id and t.organizer_id = auth.uid())
  );

-- ----------------------------------------------------------------------------
-- 8) RPC : réserver des places (prix et disponibilité faisant autorité)
-- ----------------------------------------------------------------------------
create or replace function public.create_trip_booking(
  p_trip_id      uuid,
  p_participants integer,
  p_package_id   uuid default null,
  p_phone        text default null,
  p_notes        text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_trip  public.trips%rowtype;
  v_price bigint;
  v_id    uuid;
  v_ref   text;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_participants is null or p_participants < 1 or p_participants > 50 then
    raise exception 'INVALID_PARTICIPANTS';
  end if;

  -- Verrou de ligne : pas de surbooking en cas de réservations concurrentes.
  select * into v_trip from public.trips where id = p_trip_id for update;
  if not found or v_trip.status <> 'published' then raise exception 'TRIP_NOT_AVAILABLE'; end if;
  if v_trip.starts_on <= current_date then raise exception 'TRIP_ALREADY_STARTED'; end if;
  if v_trip.seats_total - v_trip.seats_booked < p_participants then
    raise exception 'NOT_ENOUGH_SEATS';
  end if;

  if p_package_id is not null then
    select price_xof into v_price from public.trip_packages
     where id = p_package_id and trip_id = p_trip_id and is_active;
    if v_price is null then raise exception 'PACKAGE_NOT_FOUND'; end if;
  else
    v_price := v_trip.base_price_xof;
  end if;

  v_ref := 'TRP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into public.trip_bookings
    (reference, user_id, trip_id, package_id, participants, unit_price_xof, total_xof, contact_phone, notes)
  values
    (v_ref, v_uid, p_trip_id, p_package_id, p_participants, v_price, v_price * p_participants,
     nullif(trim(p_phone), ''), nullif(trim(p_notes), ''))
  returning id into v_id;

  update public.trips
     set seats_booked = seats_booked + p_participants,
         status = case when seats_booked + p_participants >= seats_total then 'full' else status end
   where id = p_trip_id;

  return jsonb_build_object('id', v_id, 'reference', v_ref,
                            'total_xof', v_price * p_participants);
end; $$;

-- Annulation par le client (libère les places tant que rien n'est utilisé).
create or replace function public.cancel_trip_booking(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare b public.trip_bookings%rowtype;
begin
  select * into b from public.trip_bookings where id = p_booking_id for update;
  if not found or (b.user_id <> auth.uid() and not public.is_admin()) then
    raise exception 'NOT_FOUND';
  end if;
  if b.status in ('cancelled','used') then raise exception 'INVALID_STATE'; end if;
  update public.trip_bookings set status = 'cancelled' where id = b.id;
  update public.trips
     set seats_booked = greatest(0, seats_booked - b.participants),
         status = case when status = 'full' then 'published' else status end
   where id = b.trip_id;
  return jsonb_build_object('ok', true);
end; $$;

-- Scan QR par l'organisateur du voyage : passe la réservation à 'used'.
create or replace function public.scan_trip_ticket(p_qr_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare b public.trip_bookings%rowtype; t public.trips%rowtype;
begin
  select * into b from public.trip_bookings where qr_token = p_qr_token for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'UNKNOWN_TICKET'); end if;
  select * into t from public.trips where id = b.trip_id;
  if t.organizer_id <> auth.uid() and not public.is_admin() then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if b.status = 'used' then
    return jsonb_build_object('ok', false, 'error', 'ALREADY_USED', 'used_at', b.used_at);
  end if;
  if b.status not in ('paid','confirmed') then
    return jsonb_build_object('ok', false, 'error', 'NOT_PAID', 'status', b.status);
  end if;
  update public.trip_bookings set status = 'used', used_at = now() where id = b.id;
  return jsonb_build_object('ok', true, 'reference', b.reference,
                            'participants', b.participants, 'trip', t.title);
end; $$;

revoke execute on function public.create_trip_booking(uuid,integer,uuid,text,text) from public;
revoke execute on function public.cancel_trip_booking(uuid) from public;
revoke execute on function public.scan_trip_ticket(text) from public;
grant execute on function public.create_trip_booking(uuid,integer,uuid,text,text) to authenticated;
grant execute on function public.cancel_trip_booking(uuid) to authenticated;
grant execute on function public.scan_trip_ticket(text) to authenticated;

comment on table public.trips is 'Voyages groupés nationaux/internationaux et circuits (is_circuit). Création organisateur en draft, publication via admin.';
comment on table public.trip_bookings is 'Réservations de places. Écriture uniquement via create_trip_booking / cancel_trip_booking / scan_trip_ticket.';
