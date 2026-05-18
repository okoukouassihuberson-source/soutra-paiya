-- ============================================================================
-- SOUTRA-PAIYA — Schéma initial
-- Migration 0001 : tables, enums, RLS, fonctions
-- ============================================================================

-- Extensions (Supabase les installe dans le schéma "extensions" par défaut)
create schema if not exists extensions;
create extension if not exists "uuid-ossp" schema extensions;
create extension if not exists "postgis" schema extensions;
create extension if not exists "pgcrypto" schema extensions;

-- Permet d'utiliser uuid_generate_v4(), gen_random_bytes(), geography(...), etc.
-- sans devoir préfixer par "extensions." partout dans le reste du script.
set search_path to public, extensions, pg_catalog;

-- ============================================================================
-- ENUMS
-- ============================================================================
create type kyc_status as enum ('none','pending','verified','rejected');
create type venue_category as enum ('maquis','restaurant','hotel','club','sport','cafe','event_space');
create type venue_status as enum ('draft','active','suspended','closed');
create type event_status as enum ('draft','published','sold_out','cancelled','done');
create type tx_type as enum ('topup','withdraw','payment','transfer','refund','split','escrow_hold','escrow_release','fee');
create type tx_status as enum ('pending','success','failed','reversed');
create type payment_provider as enum ('orange','mtn','wave','moov','card','wallet','cinetpay');
create type reservation_status as enum ('pending','confirmed','arrived','no_show','cancelled','refunded');
create type ticket_status as enum ('valid','scanned','refunded','transferred');
create type user_role as enum ('user','venue_owner','organizer','staff','admin');

-- ============================================================================
-- PROFILES (étend auth.users)
-- ============================================================================
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  phone text unique,
  email text,
  full_name text,
  avatar_url text,
  bio text,
  city text default 'Abidjan',
  role user_role not null default 'user',
  kyc_status kyc_status not null default 'none',
  kyc_doc_url text,
  pin_hash text,           -- 4-digit PIN pour transactions (bcrypt)
  referral_code text unique,
  referred_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_profiles_phone on profiles(phone);
create index idx_profiles_role on profiles(role);

-- ============================================================================
-- WALLETS
-- ============================================================================
create table wallets (
  user_id uuid primary key references profiles(id) on delete cascade,
  balance_xof bigint not null default 0 check (balance_xof >= 0),
  locked_xof bigint not null default 0 check (locked_xof >= 0),
  daily_limit_xof bigint not null default 200000,
  monthly_limit_xof bigint not null default 2000000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- TRANSACTIONS
-- ============================================================================
create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  counterparty_id uuid references profiles(id), -- pour les transferts P2P
  type tx_type not null,
  amount_xof bigint not null check (amount_xof > 0),
  fee_xof bigint not null default 0,
  status tx_status not null default 'pending',
  provider payment_provider,
  provider_ref text,
  description text,
  metadata jsonb default '{}'::jsonb,
  reservation_id uuid,           -- FK ajouté après création de la table
  ticket_id uuid,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index idx_tx_user_date on transactions(user_id, created_at desc);
create index idx_tx_status on transactions(status) where status = 'pending';
create index idx_tx_provider_ref on transactions(provider_ref);

-- ============================================================================
-- VENUES (établissements)
-- ============================================================================
create table venues (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id),
  name text not null,
  slug text unique not null,
  category venue_category not null,
  description text,
  cover_url text,
  gallery_urls text[] default '{}',
  address text not null,
  location geography(point, 4326),
  city text not null default 'Abidjan',
  district text,
  phone text,
  email text,
  opening_hours jsonb default '{}'::jsonb, -- {mon:["12:00","02:00"], ...}
  avg_price_xof int,
  amenities text[] default '{}',
  status venue_status not null default 'draft',
  rating_avg numeric(2,1) default 0,
  rating_count int default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_venues_location on venues using gist(location);
create index idx_venues_city_status on venues(city, status) where status = 'active';
create index idx_venues_owner on venues(owner_id);

-- ============================================================================
-- EVENTS
-- ============================================================================
create table events (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references profiles(id),
  venue_id uuid references venues(id),
  title text not null,
  slug text unique not null,
  description text,
  cover_url text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity int,
  ticket_tiers jsonb not null default '[]'::jsonb, -- [{name,price_xof,qty,sold}]
  status event_status not null default 'draft',
  city text not null default 'Abidjan',
  created_at timestamptz not null default now()
);
create index idx_events_starts on events(starts_at) where status = 'published';
create index idx_events_organizer on events(organizer_id);

-- ============================================================================
-- RESERVATIONS
-- ============================================================================
create table reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  venue_id uuid not null references venues(id),
  date_time timestamptz not null,
  party_size int not null check (party_size > 0),
  deposit_xof bigint not null default 0,
  escrow_tx_id uuid references transactions(id),
  status reservation_status not null default 'pending',
  qr_code text unique not null default replace(gen_random_uuid()::text, '-', ''),
  notes text,
  created_at timestamptz not null default now(),
  arrived_at timestamptz,
  cancelled_at timestamptz
);
create index idx_resa_venue_date on reservations(venue_id, date_time);
create index idx_resa_user on reservations(user_id, created_at desc);

alter table transactions
  add constraint fk_tx_reservation foreign key (reservation_id) references reservations(id);

-- ============================================================================
-- TICKETS
-- ============================================================================
create table tickets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id),
  user_id uuid not null references profiles(id),
  tier_name text not null,
  price_xof bigint not null,
  qr_code text unique not null default replace(gen_random_uuid()::text, '-', ''),
  status ticket_status not null default 'valid',
  scanned_at timestamptz,
  scanned_by uuid references profiles(id),
  transaction_id uuid references transactions(id),
  created_at timestamptz not null default now()
);
create index idx_tickets_event on tickets(event_id);
create index idx_tickets_user on tickets(user_id);

alter table transactions
  add constraint fk_tx_ticket foreign key (ticket_id) references tickets(id);

-- ============================================================================
-- REVIEWS (avis vérifiés — uniquement après transaction confirmée)
-- ============================================================================
create table reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  venue_id uuid references venues(id),
  event_id uuid references events(id),
  reservation_id uuid references reservations(id),
  ticket_id uuid references tickets(id),
  rating int not null check (rating between 1 and 5),
  body text,
  photos text[] default '{}',
  created_at timestamptz not null default now(),
  check (venue_id is not null or event_id is not null),
  check (reservation_id is not null or ticket_id is not null) -- garantit "vérifié"
);
create index idx_reviews_venue on reviews(venue_id, created_at desc);
create unique index uniq_review_per_resa on reviews(reservation_id) where reservation_id is not null;

-- ============================================================================
-- STORIES (24h)
-- ============================================================================
create table stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  venue_id uuid references venues(id),
  event_id uuid references events(id),
  media_url text not null,
  media_type text not null check (media_type in ('image','video')),
  caption text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);
-- Pas de WHERE avec now() (non-IMMUTABLE). Le filtre se fait à la requête.
create index idx_stories_expires on stories(expires_at desc);
create index idx_stories_user on stories(user_id, created_at desc);

-- ============================================================================
-- SOCIAL (follows + chat)
-- ============================================================================
create table follows (
  follower_id uuid not null references profiles(id) on delete cascade,
  followed_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id),
  check (follower_id <> followed_id)
);

create table chats (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('dm','group')),
  title text,
  created_at timestamptz not null default now()
);

create table chat_members (
  chat_id uuid not null references chats(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (chat_id, user_id)
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references chats(id) on delete cascade,
  sender_id uuid not null references profiles(id),
  body text,
  attachment_url text,
  created_at timestamptz not null default now()
);
create index idx_messages_chat on messages(chat_id, created_at desc);

-- ============================================================================
-- SOS
-- ============================================================================
create table sos_contacts (
  user_id uuid not null references profiles(id) on delete cascade,
  contact_name text not null,
  contact_phone text not null,
  position int not null check (position between 1 and 3),
  primary key (user_id, position)
);

create table sos_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  contacts_notified jsonb default '[]'::jsonb,
  status text not null default 'active' check (status in ('active','resolved','false_alarm'))
);

create table sos_pings (
  id bigserial primary key,
  alert_id uuid not null references sos_alerts(id) on delete cascade,
  location geography(point, 4326) not null,
  accuracy_m numeric,
  created_at timestamptz not null default now()
);
create index idx_sos_pings_alert on sos_pings(alert_id, created_at);

-- ============================================================================
-- AUDIT LOG (immuable)
-- ============================================================================
create table audit_events (
  id bigserial primary key,
  actor_id uuid references profiles(id),
  action text not null,
  resource_type text not null,
  resource_id uuid,
  metadata jsonb default '{}'::jsonb,
  ip inet,
  created_at timestamptz not null default now()
);
create index idx_audit_actor on audit_events(actor_id, created_at desc);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at
create or replace function tg_set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;

create trigger set_updated_at before update on profiles
  for each row execute function tg_set_updated_at();
create trigger set_updated_at before update on wallets
  for each row execute function tg_set_updated_at();
create trigger set_updated_at before update on venues
  for each row execute function tg_set_updated_at();

-- Création automatique du profil + wallet à l'inscription
create or replace function tg_handle_new_user() returns trigger as $$
begin
  insert into profiles (id, phone, email, full_name, referral_code)
  values (
    new.id,
    new.phone,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    upper(substr(md5(new.id::text), 1, 6))
  );
  insert into wallets (user_id) values (new.id);
  return new;
end; $$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function tg_handle_new_user();

-- Recalcule la note moyenne d'un venue après chaque review
create or replace function tg_update_venue_rating() returns trigger as $$
begin
  if new.venue_id is not null then
    update venues set
      rating_avg = (select round(avg(rating)::numeric, 1) from reviews where venue_id = new.venue_id),
      rating_count = (select count(*) from reviews where venue_id = new.venue_id)
    where id = new.venue_id;
  end if;
  return new;
end; $$ language plpgsql;

create trigger update_venue_rating after insert on reviews
  for each row execute function tg_update_venue_rating();

-- ============================================================================
-- RLS — Row Level Security
-- ============================================================================
alter table profiles enable row level security;
alter table wallets enable row level security;
alter table transactions enable row level security;
alter table venues enable row level security;
alter table events enable row level security;
alter table reservations enable row level security;
alter table tickets enable row level security;
alter table reviews enable row level security;
alter table stories enable row level security;
alter table follows enable row level security;
alter table chats enable row level security;
alter table chat_members enable row level security;
alter table messages enable row level security;
alter table sos_contacts enable row level security;
alter table sos_alerts enable row level security;
alter table sos_pings enable row level security;

-- PROFILES : lecture publique limitée, écriture self
create policy "profiles_select_public" on profiles for select using (true);
create policy "profiles_update_self" on profiles for update using (auth.uid() = id);

-- WALLETS : strictement privé
create policy "wallets_self" on wallets for all using (auth.uid() = user_id);

-- TRANSACTIONS : user voit les siennes
create policy "tx_self" on transactions for select
  using (auth.uid() = user_id or auth.uid() = counterparty_id);

-- VENUES : tous voient les actifs ; owner gère les siens
create policy "venues_select_active" on venues for select
  using (status = 'active' or owner_id = auth.uid());
create policy "venues_owner_all" on venues for all using (auth.uid() = owner_id);

-- EVENTS : tous voient les publiés ; organizer gère les siens
create policy "events_select_published" on events for select
  using (status = 'published' or organizer_id = auth.uid());
create policy "events_organizer_all" on events for all using (auth.uid() = organizer_id);

-- RESERVATIONS : user voit les siennes + venue owner voit celles de son venue
create policy "resa_user" on reservations for select using (auth.uid() = user_id);
create policy "resa_owner" on reservations for select
  using (exists (select 1 from venues v where v.id = venue_id and v.owner_id = auth.uid()));
create policy "resa_insert" on reservations for insert with check (auth.uid() = user_id);

-- TICKETS : user voit les siens + organizer voit ceux de son event
create policy "tickets_user" on tickets for select using (auth.uid() = user_id);
create policy "tickets_organizer" on tickets for select
  using (exists (select 1 from events e where e.id = event_id and e.organizer_id = auth.uid()));

-- REVIEWS : lecture publique ; user peut créer/modifier les siennes
create policy "reviews_select_public" on reviews for select using (true);
create policy "reviews_user_write" on reviews for insert with check (auth.uid() = user_id);
create policy "reviews_user_update" on reviews for update using (auth.uid() = user_id);

-- STORIES : lecture publique des actives ; user écrit les siennes
create policy "stories_select_active" on stories for select
  using (expires_at > now() or user_id = auth.uid());
create policy "stories_user_write" on stories for all using (auth.uid() = user_id);

-- FOLLOWS : lecture publique ; user gère les siens
create policy "follows_select_public" on follows for select using (true);
create policy "follows_self" on follows for all using (auth.uid() = follower_id);

-- CHATS / MESSAGES : seuls les membres voient
create policy "chats_member_select" on chats for select
  using (exists (select 1 from chat_members where chat_id = id and user_id = auth.uid()));
create policy "messages_member_select" on messages for select
  using (exists (select 1 from chat_members where chat_id = messages.chat_id and user_id = auth.uid()));
create policy "messages_member_insert" on messages for insert
  with check (
    auth.uid() = sender_id
    and exists (select 1 from chat_members where chat_id = messages.chat_id and user_id = auth.uid())
  );
create policy "chat_members_self" on chat_members for select using (auth.uid() = user_id);

-- SOS : strictement privé
create policy "sos_contacts_self" on sos_contacts for all using (auth.uid() = user_id);
create policy "sos_alerts_self" on sos_alerts for all using (auth.uid() = user_id);
create policy "sos_pings_self" on sos_pings for all
  using (exists (select 1 from sos_alerts a where a.id = alert_id and a.user_id = auth.uid()));
