-- ============================================================================
-- SOUTRA PLAYCE V2 — Migration 0087 : marketplace d'activités touristiques
-- ============================================================================
-- 100 % additive. Modèle calqué sur les voyages (0082/0083/0085) :
--   activities            : fiche (balade en bateau, safari, randonnée…)
--   activity_slots        : créneaux datés avec capacité (disponibilité)
--   activity_bookings     : réservations (verrou de créneau anti-surbooking)
--   activity_payments     : encaissements / reçus (paiement intégral)
--   activity_reviews      : avis 1-5 (uniquement après réservation), modération
--   activity_review_reports : signalements d'avis
-- + RPC de réservation / annulation / paiement / scan QR / avis / modération,
--   liste publique filtrée (list_activities) et branche 'activity_booking' dans
--   geniuspay_settle_charge (versions 0077/0083 conservées).
-- ============================================================================

do $$ begin
  create type activity_status as enum ('draft','published','paused','archived');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- 1) Tables
-- ----------------------------------------------------------------------------
create table if not exists public.activities (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  organizer_id     uuid not null references public.profiles(id),
  venue_id         uuid references public.venues(id) on delete set null,
  destination_id   uuid references public.destinations(id) on delete set null,
  title            text not null check (length(trim(title)) between 1 and 200),
  summary          text check (summary is null or length(summary) <= 500),
  description      text,
  category         text not null check (category in (
                     'balade_bateau','visite_guidee','randonnee','safari','peche','plongee','jet_ski','quad',
                     'visite_culturelle','atelier_cuisine','artisanat','excursion','photographie','autre')),
  city             text,
  address          text,
  latitude         double precision check (latitude  between -90  and 90),
  longitude        double precision check (longitude between -180 and 180),
  cover_url        text,
  gallery_urls     text[] not null default '{}',
  price_xof        bigint not null check (price_xof >= 0),
  duration_minutes integer not null check (duration_minutes between 15 and 20160),
  min_age          integer not null default 0 check (min_age between 0 and 99),
  min_participants integer not null default 1 check (min_participants between 1 and 500),
  max_group_size   integer not null default 20 check (max_group_size between 1 and 50),
  languages        text[] not null default '{}',
  includes         text[] not null default '{}',
  excludes         text[] not null default '{}',
  conditions       text,
  contact_phone    text,
  contact_whatsapp text,
  highlight        text check (highlight in ('a_la_une','populaire','nouveau','promotion','coup_de_coeur','recommande')),
  commission_pct   numeric(5,2) check (commission_pct is null or commission_pct between 0 and 100),
  status           activity_status not null default 'draft',
  submitted_at     timestamptz,
  approved_at      timestamptz,
  rating_avg       numeric(2,1) not null default 0,
  rating_count     integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_activities_listing on public.activities(status, category, city);
create index if not exists idx_activities_organizer on public.activities(organizer_id);
create index if not exists idx_activities_destination on public.activities(destination_id);
create index if not exists idx_activities_title_trgm
  on public.activities using gin (title extensions.gin_trgm_ops) where status = 'published';

create table if not exists public.activity_slots (
  id          uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  starts_at   timestamptz not null,
  capacity    integer not null check (capacity between 1 and 500),
  booked      integer not null default 0 check (booked >= 0),
  price_xof   bigint check (price_xof is null or price_xof >= 0),
  status      text not null default 'open' check (status in ('open','closed')),
  unique (activity_id, starts_at),
  constraint activity_slots_booked_le_capacity check (booked <= capacity)
);
create index if not exists idx_activity_slots_activity on public.activity_slots(activity_id, starts_at);

create table if not exists public.activity_bookings (
  id             uuid primary key default gen_random_uuid(),
  reference      text not null unique,
  user_id        uuid not null references public.profiles(id),
  activity_id    uuid not null references public.activities(id),
  slot_id        uuid not null references public.activity_slots(id),
  participants   integer not null check (participants between 1 and 50),
  unit_price_xof bigint not null check (unit_price_xof >= 0),
  total_xof      bigint not null check (total_xof >= 0),
  paid_xof       bigint not null default 0 check (paid_xof >= 0),
  status         trip_booking_status not null default 'pending',
  contact_phone  text,
  notes          text check (notes is null or length(notes) <= 1000),
  qr_token       text not null unique default replace(gen_random_uuid()::text, '-', ''),
  used_at        timestamptz,
  expires_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint activity_bookings_paid_check check (paid_xof <= total_xof)
);
create index if not exists idx_activity_bookings_user on public.activity_bookings(user_id, created_at desc);
create index if not exists idx_activity_bookings_slot on public.activity_bookings(slot_id, status);
create index if not exists idx_activity_bookings_activity on public.activity_bookings(activity_id, status);

create table if not exists public.activity_payments (
  id             uuid primary key default gen_random_uuid(),
  booking_id     uuid not null references public.activity_bookings(id),
  transaction_id uuid not null unique references public.transactions(id),
  amount_xof     bigint not null check (amount_xof > 0),
  provider       text not null default 'geniuspay',
  receipt_number text not null unique,
  created_at     timestamptz not null default now()
);
create index if not exists idx_activity_payments_booking on public.activity_payments(booking_id);

create table if not exists public.activity_reviews (
  id          uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  booking_id  uuid not null unique references public.activity_bookings(id),
  user_id     uuid not null references public.profiles(id),
  rating      smallint not null check (rating between 1 and 5),
  comment     text check (comment is null or length(comment) <= 2000),
  status      text not null default 'published' check (status in ('published','hidden')),
  created_at  timestamptz not null default now()
);
create index if not exists idx_activity_reviews_activity on public.activity_reviews(activity_id, status, created_at desc);

create table if not exists public.activity_review_reports (
  review_id  uuid not null references public.activity_reviews(id) on delete cascade,
  user_id    uuid not null references public.profiles(id),
  reason     text check (reason is null or length(reason) <= 500),
  created_at timestamptz not null default now(),
  primary key (review_id, user_id)
);

do $$
declare t text;
begin
  foreach t in array array['activities','activity_bookings'] loop
    execute format('drop trigger if exists trg_%1$s_updated_at on public.%1$s', t);
    execute format('create trigger trg_%1$s_updated_at before update on public.%1$s
                    for each row execute function public.tg_tourism_set_updated_at()', t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 2) Helpers RLS (security definer : évitent les récursions)
-- ----------------------------------------------------------------------------
create or replace function public.is_activity_organizer(p_activity_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.activities a where a.id = p_activity_id and a.organizer_id = auth.uid());
$$;
create or replace function public.is_activity_booker(p_activity_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.activity_bookings b where b.activity_id = p_activity_id and b.user_id = auth.uid());
$$;
revoke execute on function public.is_activity_organizer(uuid) from public;
revoke execute on function public.is_activity_booker(uuid) from public;
grant execute on function public.is_activity_organizer(uuid) to authenticated;
grant execute on function public.is_activity_booker(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 3) RLS
-- ----------------------------------------------------------------------------
alter table public.activities               enable row level security;
alter table public.activity_slots           enable row level security;
alter table public.activity_bookings        enable row level security;
alter table public.activity_payments        enable row level security;
alter table public.activity_reviews         enable row level security;
alter table public.activity_review_reports  enable row level security;

drop policy if exists activities_select on public.activities;
create policy activities_select on public.activities for select to anon, authenticated
  using (status = 'published' or organizer_id = auth.uid() or public.is_admin());
drop policy if exists activities_select_booker on public.activities;
create policy activities_select_booker on public.activities for select to authenticated
  using (public.is_activity_booker(id));
drop policy if exists activities_insert on public.activities;
create policy activities_insert on public.activities for insert to authenticated
  with check (organizer_id = auth.uid() and status = 'draft'
    and exists (select 1 from public.profiles p where p.id = auth.uid()
                and p.role::text in ('organizer','venue_owner','guide','admin')));
drop policy if exists activities_update on public.activities;
create policy activities_update on public.activities for update to authenticated
  using (organizer_id = auth.uid() or public.is_admin())
  with check (organizer_id = auth.uid() or public.is_admin());
drop policy if exists activities_delete on public.activities;
create policy activities_delete on public.activities for delete to authenticated using (public.is_admin());

-- Garde (écritures directes des clients uniquement ; admin et RPC definer libres).
create or replace function public.tg_activities_guard()
returns trigger language plpgsql set search_path = public as $$
declare
  v_cols text[] := array['status','updated_at','submitted_at'];
  k text; n jsonb; o jsonb;
begin
  if current_user not in ('authenticated','anon') or public.is_admin() then return new; end if;
  if tg_op = 'INSERT' then
    new.status := 'draft'; new.commission_pct := null; new.highlight := null;
    new.submitted_at := null; new.approved_at := null; new.rating_avg := 0; new.rating_count := 0;
    return new;
  end if;
  new.commission_pct := old.commission_pct; new.highlight := old.highlight; new.organizer_id := old.organizer_id;
  new.approved_at := old.approved_at; new.rating_avg := old.rating_avg; new.rating_count := old.rating_count;
  n := to_jsonb(new); o := to_jsonb(old);
  foreach k in array v_cols loop n := n - k; o := o - k; end loop;

  if old.status = 'draft' then
    new.status := 'draft';
    new.submitted_at := old.submitted_at;
    if old.submitted_at is not null and n is distinct from o then new.submitted_at := null; end if;
    return new;
  end if;
  -- Publiée / en pause : contenu verrouillé ; seule la mise en pause / reprise est permise
  -- (reprise uniquement d'une activité déjà approuvée par la modération).
  if n is distinct from o then raise exception 'ACTIVITY_LOCKED'; end if;
  if new.status is distinct from old.status then
    if not ((old.status = 'published' and new.status = 'paused')
         or (old.status = 'paused' and new.status = 'published' and old.approved_at is not null)) then
      raise exception 'ACTIVITY_LOCKED';
    end if;
  end if;
  new.submitted_at := old.submitted_at;
  return new;
end; $$;
drop trigger if exists trg_activities_guard on public.activities;
create trigger trg_activities_guard before insert or update on public.activities
  for each row execute function public.tg_activities_guard();

-- Créneaux : lecture publique des créneaux d'activités visibles ; gestion par l'organisateur.
drop policy if exists activity_slots_select on public.activity_slots;
create policy activity_slots_select on public.activity_slots for select to anon, authenticated
  using (exists (select 1 from public.activities a where a.id = activity_id));
drop policy if exists activity_slots_write on public.activity_slots;
create policy activity_slots_write on public.activity_slots for all to authenticated
  using (public.is_activity_organizer(activity_id) or public.is_admin())
  with check (public.is_activity_organizer(activity_id) or public.is_admin());

create or replace function public.tg_activity_slots_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user not in ('authenticated','anon') or public.is_admin() then return new; end if;
  if tg_op = 'INSERT' then
    new.booked := 0;
    if new.starts_at <= now() then raise exception 'SLOT_IN_PAST'; end if;
  else
    new.booked := old.booked;
    new.activity_id := old.activity_id;
  end if;
  return new;
end; $$;
drop trigger if exists trg_activity_slots_guard on public.activity_slots;
create trigger trg_activity_slots_guard before insert or update on public.activity_slots
  for each row execute function public.tg_activity_slots_guard();

-- Réservations / paiements : lecture client, organisateur de l'activité, admin. Aucune écriture directe.
drop policy if exists activity_bookings_select on public.activity_bookings;
create policy activity_bookings_select on public.activity_bookings for select to authenticated
  using (user_id = auth.uid() or public.is_admin() or public.is_activity_organizer(activity_id));
drop policy if exists activity_payments_select on public.activity_payments;
create policy activity_payments_select on public.activity_payments for select to authenticated
  using (exists (select 1 from public.activity_bookings b where b.id = booking_id
    and (b.user_id = auth.uid() or public.is_admin() or public.is_activity_organizer(b.activity_id))));

-- Avis : lecture publique des avis publiés ; admin voit tout ; écriture via RPC uniquement.
drop policy if exists activity_reviews_select on public.activity_reviews;
create policy activity_reviews_select on public.activity_reviews for select to anon, authenticated
  using (status = 'published' or user_id = auth.uid() or public.is_admin());
drop policy if exists activity_review_reports_admin on public.activity_review_reports;
create policy activity_review_reports_admin on public.activity_review_reports for select to authenticated
  using (public.is_admin());

-- ----------------------------------------------------------------------------
-- 4) Note moyenne automatique
-- ----------------------------------------------------------------------------
create or replace function public.tg_activity_reviews_rating()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_id uuid := coalesce(new.activity_id, old.activity_id);
begin
  update public.activities a
     set rating_count = x.c, rating_avg = coalesce(round(x.avg::numeric, 1), 0)
    from (select count(*)::int as c, avg(rating) as avg
            from public.activity_reviews where activity_id = v_id and status = 'published') x
   where a.id = v_id;
  return null;
end; $$;
drop trigger if exists trg_activity_reviews_rating on public.activity_reviews;
create trigger trg_activity_reviews_rating after insert or update or delete on public.activity_reviews
  for each row execute function public.tg_activity_reviews_rating();

-- ----------------------------------------------------------------------------
-- 5) Réservation / annulation
-- ----------------------------------------------------------------------------
create or replace function public.create_activity_booking(
  p_slot_id      uuid,
  p_participants integer,
  p_phone        text default null,
  p_notes        text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  s      public.activity_slots%rowtype;
  a      public.activities%rowtype;
  v_price bigint; v_id uuid; v_ref text; v_freed integer; v_exp timestamptz := now() + interval '1 hour';
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_participants is null or p_participants < 1 or p_participants > 50 then raise exception 'INVALID_PARTICIPANTS'; end if;

  select * into s from public.activity_slots where id = p_slot_id for update;
  if not found then raise exception 'SLOT_NOT_FOUND'; end if;
  select * into a from public.activities where id = s.activity_id;
  if a.status <> 'published' then raise exception 'ACTIVITY_NOT_AVAILABLE'; end if;
  if s.status <> 'open' or s.starts_at <= now() + interval '1 hour' then raise exception 'SLOT_CLOSED'; end if;
  if p_participants > a.max_group_size then raise exception 'GROUP_TOO_LARGE'; end if;

  -- Libère les places retenues par des réservations impayées expirées.
  with expired as (
    update public.activity_bookings set status = 'cancelled'
     where slot_id = p_slot_id and status = 'pending' and paid_xof = 0
       and expires_at is not null and expires_at < now()
    returning participants)
  select coalesce(sum(participants), 0) into v_freed from expired;
  if v_freed > 0 then
    update public.activity_slots set booked = greatest(0, booked - v_freed) where id = p_slot_id returning * into s;
  end if;

  if s.capacity - s.booked < p_participants then raise exception 'NOT_ENOUGH_SEATS'; end if;
  v_price := coalesce(s.price_xof, a.price_xof);
  v_ref := 'ACT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into public.activity_bookings
    (reference, user_id, activity_id, slot_id, participants, unit_price_xof, total_xof, contact_phone, notes, expires_at)
  values (v_ref, v_uid, a.id, s.id, p_participants, v_price, v_price * p_participants,
          nullif(trim(p_phone), ''), nullif(trim(p_notes), ''), v_exp)
  returning id into v_id;

  update public.activity_slots set booked = booked + p_participants where id = s.id;
  return jsonb_build_object('id', v_id, 'reference', v_ref, 'total_xof', v_price * p_participants, 'expires_at', v_exp);
end; $$;

create or replace function public.cancel_activity_booking(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare b public.activity_bookings%rowtype;
begin
  select * into b from public.activity_bookings where id = p_booking_id for update;
  if not found or (b.user_id <> auth.uid() and not public.is_admin()) then raise exception 'NOT_FOUND'; end if;
  if b.status in ('cancelled','used') then raise exception 'INVALID_STATE'; end if;
  if b.paid_xof > 0 and not public.is_admin() then raise exception 'REFUND_REQUIRED'; end if;
  update public.activity_bookings set status = 'cancelled' where id = b.id;
  update public.activity_slots set booked = greatest(0, booked - b.participants) where id = b.slot_id;
  return jsonb_build_object('ok', true, 'refund_due_xof', b.paid_xof);
end; $$;

-- ----------------------------------------------------------------------------
-- 6) Paiement (GeniusPay) : montant faisant autorité + règlement idempotent
-- ----------------------------------------------------------------------------
create or replace function public.get_activity_booking_payment_info(p_booking_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare b public.activity_bookings%rowtype; a public.activities%rowtype;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into b from public.activity_bookings where id = p_booking_id;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if b.user_id <> auth.uid() then raise exception 'NOT_OWNER'; end if;
  select * into a from public.activities where id = b.activity_id;
  if b.status <> 'pending' or b.paid_xof > 0 then return jsonb_build_object('payable', false, 'reason', 'NOT_PAYABLE'); end if;
  if b.expires_at is not null and b.expires_at < now() then return jsonb_build_object('payable', false, 'reason', 'EXPIRED'); end if;
  return jsonb_build_object('payable', true, 'booking_id', b.id, 'reference', b.reference,
                            'activity_id', a.id, 'activity_title', a.title, 'amount_xof', b.total_xof);
end; $$;

create or replace function public.geniuspay_settle_activity_booking(p_tx_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_tx record; b public.activity_bookings%rowtype; v_new bigint;
begin
  select id, user_id, amount_xof, metadata into v_tx from public.transactions where id = p_tx_id;
  if v_tx.id is null then raise exception 'TX_NOT_FOUND'; end if;
  if exists (select 1 from public.activity_payments where transaction_id = p_tx_id) then
    return jsonb_build_object('ok', false, 'reason', 'ALREADY_SETTLED');
  end if;
  select * into b from public.activity_bookings where id = (v_tx.metadata->>'booking_id')::uuid for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if b.user_id <> v_tx.user_id then raise exception 'BOOKING_USER_MISMATCH'; end if;
  v_new := least(b.total_xof, b.paid_xof + v_tx.amount_xof);
  insert into public.activity_payments (booking_id, transaction_id, amount_xof, receipt_number)
  values (b.id, v_tx.id, v_tx.amount_xof, 'RCT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)));
  update public.activity_bookings
     set paid_xof = v_new,
         status = case when status in ('cancelled','used') then status
                       when v_new >= total_xof then 'paid'::trip_booking_status
                       else 'confirmed'::trip_booking_status end
   where id = b.id;
  return jsonb_build_object('ok', true, 'booking_id', b.id, 'paid_xof', v_new, 'late_payment', b.status = 'cancelled');
end; $$;
revoke execute on function public.geniuspay_settle_activity_booking(uuid) from public;
grant execute on function public.geniuspay_settle_activity_booking(uuid) to service_role;
revoke execute on function public.get_activity_booking_payment_info(uuid) from public;
grant execute on function public.get_activity_booking_payment_info(uuid) to authenticated, service_role;

create or replace function public.geniuspay_settle_charge(
  p_reference      text,
  p_paid_amount_xof bigint
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx       transactions;
  v_purpose  text;
begin
  select * into v_tx from transactions where provider_ref = p_reference for update;
  if not found then return 'not_found'; end if;
  if v_tx.status = 'success' then return 'already_settled'; end if;
  if v_tx.status <> 'pending' then return 'not_pending'; end if;
  if p_paid_amount_xof < v_tx.amount_xof then return 'amount_mismatch'; end if;

  update transactions set status = 'success', completed_at = now() where id = v_tx.id;
  v_purpose := v_tx.metadata->>'purpose';

  if v_purpose = 'subscription' then
    perform public.geniuspay_settle_subscription(v_tx.id);
  elsif v_purpose = 'order' then
    perform public.geniuspay_settle_order(v_tx.id);
  elsif v_purpose = 'room_booking' then
    perform public.geniuspay_settle_room_booking(v_tx.id);
  elsif v_purpose = 'ticket_purchase' then
    perform public.geniuspay_settle_ticket_purchase(v_tx.id);
  elsif v_purpose = 'trip_booking' then
    perform public.geniuspay_settle_trip_booking(v_tx.id);
  elsif v_purpose = 'activity_booking' then
    perform public.geniuspay_settle_activity_booking(v_tx.id);
  elsif v_tx.type = 'topup' then
    update wallets set balance_xof = balance_xof + v_tx.amount_xof where user_id = v_tx.user_id;
  elsif v_tx.type = 'payment' and v_tx.reservation_id is not null then
    update reservations set escrow_tx_id = v_tx.id where id = v_tx.reservation_id;
  end if;
  return 'settled';
end;
$$;
revoke execute on function public.geniuspay_settle_charge(text, bigint) from public;
grant execute on function public.geniuspay_settle_charge(text, bigint) to service_role;

-- ----------------------------------------------------------------------------
-- 7) Scan QR par l'organisateur
-- ----------------------------------------------------------------------------
create or replace function public.scan_activity_ticket(p_qr_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare b public.activity_bookings%rowtype; a public.activities%rowtype; s public.activity_slots%rowtype; v_name text;
begin
  select * into b from public.activity_bookings where qr_token = p_qr_token for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'UNKNOWN_TICKET'); end if;
  select * into a from public.activities where id = b.activity_id;
  if a.organizer_id <> auth.uid() and not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  select * into s from public.activity_slots where id = b.slot_id;
  select full_name into v_name from public.profiles where id = b.user_id;
  if b.status = 'used' then
    return jsonb_build_object('ok', false, 'error', 'ALREADY_USED', 'used_at', b.used_at, 'traveler', v_name);
  end if;
  if b.status not in ('paid','confirmed') then
    return jsonb_build_object('ok', false, 'error', 'NOT_PAID', 'status', b.status, 'traveler', v_name);
  end if;
  if now() < s.starts_at - interval '6 hours'
     or now() > s.starts_at + make_interval(mins => a.duration_minutes) + interval '12 hours' then
    return jsonb_build_object('ok', false, 'error', 'OUT_OF_WINDOW', 'starts_at', s.starts_at, 'traveler', v_name);
  end if;
  update public.activity_bookings set status = 'used', used_at = now() where id = b.id;
  return jsonb_build_object('ok', true, 'reference', b.reference, 'traveler', v_name,
                            'participants', b.participants, 'activity', a.title, 'starts_at', s.starts_at,
                            'balance_due_xof', b.total_xof - b.paid_xof);
end; $$;

-- ----------------------------------------------------------------------------
-- 8) Avis
-- ----------------------------------------------------------------------------
create or replace function public.submit_activity_review(p_booking_id uuid, p_rating integer, p_comment text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare b public.activity_bookings%rowtype; s public.activity_slots%rowtype; v_id uuid;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_rating is null or p_rating not between 1 and 5 then raise exception 'INVALID_RATING'; end if;
  select * into b from public.activity_bookings where id = p_booking_id;
  if not found or b.user_id <> auth.uid() then raise exception 'BOOKING_NOT_FOUND'; end if;
  select * into s from public.activity_slots where id = b.slot_id;
  -- Avis uniquement pour une activité réellement vécue : billet scanné, ou payée et créneau passé.
  if not (b.status = 'used' or (b.status = 'paid' and s.starts_at < now())) then raise exception 'NOT_ELIGIBLE'; end if;
  if exists (select 1 from public.activity_reviews where booking_id = p_booking_id) then raise exception 'ALREADY_REVIEWED'; end if;
  insert into public.activity_reviews (activity_id, booking_id, user_id, rating, comment)
  values (b.activity_id, b.id, auth.uid(), p_rating, nullif(trim(p_comment), ''))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end; $$;

create or replace function public.report_activity_review(p_review_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not exists (select 1 from public.activity_reviews where id = p_review_id and status = 'published') then
    raise exception 'REVIEW_NOT_FOUND';
  end if;
  insert into public.activity_review_reports (review_id, user_id, reason)
  values (p_review_id, auth.uid(), left(nullif(trim(p_reason), ''), 500))
  on conflict do nothing;
  return jsonb_build_object('ok', true);
end; $$;

-- ----------------------------------------------------------------------------
-- 9) Soumission, modération admin, tableaux de bord
-- ----------------------------------------------------------------------------
create or replace function public.submit_activity_for_review(p_activity_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare a public.activities%rowtype;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into a from public.activities where id = p_activity_id for update;
  if not found or a.organizer_id <> auth.uid() then raise exception 'ACTIVITY_NOT_FOUND'; end if;
  if a.status <> 'draft' then raise exception 'INVALID_STATE'; end if;
  if a.cover_url is null then raise exception 'COVER_REQUIRED'; end if;
  if a.contact_phone is null and a.contact_whatsapp is null then raise exception 'CONTACT_REQUIRED'; end if;
  if not exists (select 1 from public.activity_slots s where s.activity_id = a.id and s.status = 'open' and s.starts_at > now()) then
    raise exception 'SLOT_REQUIRED';
  end if;
  update public.activities set submitted_at = now() where id = a.id;
  insert into public.audit_events (actor_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'activity_submitted', 'activity', a.id, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end; $$;

create or replace function public.admin_moderate_activity(
  p_activity_id uuid,
  p_status activity_status default null,
  p_commission_pct numeric default null,
  p_highlight text default null,
  p_clear_highlight boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare a public.activities%rowtype;
begin
  if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  if p_commission_pct is not null and (p_commission_pct < 0 or p_commission_pct > 100) then raise exception 'INVALID_COMMISSION'; end if;
  if p_highlight is not null and p_highlight not in ('a_la_une','populaire','nouveau','promotion','coup_de_coeur','recommande') then
    raise exception 'INVALID_HIGHLIGHT';
  end if;
  select * into a from public.activities where id = p_activity_id for update;
  if not found then raise exception 'ACTIVITY_NOT_FOUND'; end if;
  if p_status is not null and p_status <> a.status then
    if not ((a.status = 'draft' and p_status in ('published','archived'))
         or (a.status = 'published' and p_status in ('paused','archived'))
         or (a.status = 'paused' and p_status in ('published','archived'))
         or (a.status = 'archived' and p_status = 'paused')) then
      raise exception 'INVALID_TRANSITION';
    end if;
  end if;
  update public.activities
     set status = coalesce(p_status, status),
         approved_at = case when p_status = 'published' and approved_at is null then now() else approved_at end,
         commission_pct = coalesce(p_commission_pct, commission_pct),
         highlight = case when p_clear_highlight then null else coalesce(p_highlight, highlight) end
   where id = p_activity_id;
  insert into public.audit_events (actor_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'activity_moderated', 'activity', p_activity_id,
          jsonb_build_object('from_status', a.status, 'to_status', coalesce(p_status, a.status),
                             'commission_pct', p_commission_pct, 'highlight', p_highlight, 'clear_highlight', p_clear_highlight));
  return jsonb_build_object('ok', true);
end; $$;

create or replace function public.admin_moderate_activity_review(p_review_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  if p_status not in ('published','hidden') then raise exception 'INVALID_STATUS'; end if;
  update public.activity_reviews set status = p_status where id = p_review_id;
  if not found then raise exception 'REVIEW_NOT_FOUND'; end if;
  insert into public.audit_events (actor_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'activity_review_moderated', 'activity_review', p_review_id, jsonb_build_object('status', p_status));
  return jsonb_build_object('ok', true);
end; $$;

create or replace function public.admin_activity_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  return jsonb_build_object(
    'activities_published', (select count(*) from activities where status = 'published'),
    'activities_pending',   (select count(*) from activities where status = 'draft' and submitted_at is not null),
    'bookings',             (select count(*) from activity_bookings where status <> 'cancelled'),
    'participants',         (select coalesce(sum(participants), 0) from activity_bookings where status <> 'cancelled'),
    'revenue_xof',          (select coalesce(sum(paid_xof), 0) from activity_bookings where status <> 'cancelled'),
    'commission_xof',       (select coalesce(round(sum(b.paid_xof * coalesce(a.commission_pct, 0) / 100.0)), 0)
                               from activity_bookings b join activities a on a.id = b.activity_id where b.status <> 'cancelled'),
    'by_category', coalesce((select jsonb_agg(jsonb_build_object('category', c, 'bookings', n, 'revenue_xof', r) order by r desc)
                               from (select a.category c, count(*) n, coalesce(sum(b.paid_xof), 0) r
                                       from activity_bookings b join activities a on a.id = b.activity_id
                                      where b.status <> 'cancelled' group by 1) x), '[]'::jsonb),
    'reported_reviews', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'activity', a.title, 'rating', r.rating,
                                         'comment', r.comment, 'status', r.status, 'reports', x.n) order by x.n desc)
                               from (select review_id, count(*) n from activity_review_reports group by 1) x
                               join activity_reviews r on r.id = x.review_id join activities a on a.id = r.activity_id), '[]'::jsonb)
  );
end; $$;

create or replace function public.get_organizer_activity_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  return jsonb_build_object(
    'activities', coalesce((select jsonb_agg(row_to_json(x) order by x.created_at desc) from (
        select a.id, a.slug, a.title, a.category, a.status, a.price_xof, a.submitted_at, a.approved_at, a.rating_avg, a.rating_count, a.created_at,
               (select count(*) from activity_slots s where s.activity_id = a.id and s.status = 'open' and s.starts_at > now()) as upcoming_slots,
               (select count(*) from activity_bookings b where b.activity_id = a.id and b.status <> 'cancelled') as bookings,
               (select coalesce(sum(b.paid_xof), 0) from activity_bookings b where b.activity_id = a.id and b.status <> 'cancelled') as paid_xof
          from activities a where a.organizer_id = auth.uid()) x), '[]'::jsonb),
    'totals', (select jsonb_build_object(
        'bookings', count(*) filter (where b.status <> 'cancelled'),
        'participants', coalesce(sum(b.participants) filter (where b.status <> 'cancelled'), 0),
        'paid_xof', coalesce(sum(b.paid_xof) filter (where b.status <> 'cancelled'), 0))
        from activity_bookings b join activities a on a.id = b.activity_id where a.organizer_id = auth.uid()));
end; $$;

create or replace function public.get_organizer_activity_bookings(p_activity_id uuid)
returns table (
  id uuid, reference text, traveler_name text, contact_phone text, participants integer, starts_at timestamptz,
  total_xof bigint, paid_xof bigint, status trip_booking_status, used_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not exists (select 1 from activities a where a.id = p_activity_id and (a.organizer_id = auth.uid() or public.is_admin())) then
    raise exception 'ACTIVITY_NOT_FOUND';
  end if;
  return query
    select b.id, b.reference, p.full_name, b.contact_phone, b.participants, s.starts_at, b.total_xof, b.paid_xof, b.status, b.used_at
      from activity_bookings b
      join activity_slots s on s.id = b.slot_id
      left join profiles p on p.id = b.user_id
     where b.activity_id = p_activity_id
     order by s.starts_at desc, b.created_at desc;
end; $$;

-- ----------------------------------------------------------------------------
-- 10) Liste publique filtrée (marketplace)
-- ----------------------------------------------------------------------------
create or replace function public.list_activities(
  p_q          text default null,
  p_category   text default null,
  p_city       text default null,
  p_min_price  integer default null,
  p_max_price  integer default null,
  p_date       date default null,
  p_max_age    integer default null,
  p_destination uuid default null,
  p_sort       text default 'popular',
  p_limit      integer default 24,
  p_offset     integer default 0
)
returns table (
  id uuid, slug text, title text, summary text, category text, city text, cover_url text,
  price_xof bigint, duration_minutes integer, min_age integer, highlight text,
  rating_avg numeric, rating_count integer, latitude double precision, longitude double precision,
  next_slot_at timestamptz, seats_left integer, total_count bigint
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_q text := nullif(trim(p_q), '');
  v_limit integer := greatest(1, least(coalesce(p_limit, 24), 100));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
begin
  return query
  select s.id, s.slug, s.title, s.summary, s.category, s.city, s.cover_url, s.price_xof, s.duration_minutes,
         s.min_age, s.highlight, s.rating_avg, s.rating_count, s.latitude, s.longitude, s.next_slot_at, s.seats_left, s.total_count
  from (
    select a.id, a.slug, a.title, a.summary, a.category, a.city, a.cover_url, a.price_xof, a.duration_minutes,
           a.min_age, a.highlight, a.rating_avg, a.rating_count, a.latitude, a.longitude, a.created_at,
           ns.starts_at as next_slot_at, ns.left_ as seats_left, count(*) over () as total_count
      from public.activities a
      join lateral (
        select sl.starts_at, (sl.capacity - sl.booked) as left_
          from public.activity_slots sl
         where sl.activity_id = a.id and sl.status = 'open'
           and sl.starts_at > now() + interval '1 hour'
           and sl.capacity > sl.booked
           and (p_date is null or (sl.starts_at at time zone 'UTC')::date = p_date)
         order by sl.starts_at limit 1) ns on true
     where a.status = 'published'
       and (v_q is null or a.title ilike '%' || replace(replace(v_q, '%', ''), '_', ' ') || '%'
                        or a.city ilike '%' || replace(replace(v_q, '%', ''), '_', ' ') || '%')
       and (p_category is null or a.category = p_category)
       and (p_city is null or a.city ilike p_city)
       and (p_destination is null or a.destination_id = p_destination)
       and (p_min_price is null or a.price_xof >= p_min_price)
       and (p_max_price is null or a.price_xof <= p_max_price)
       and (p_max_age is null or a.min_age <= p_max_age)
  ) s
  order by
    case when p_sort = 'price_asc'  then s.price_xof end asc nulls last,
    case when p_sort = 'price_desc' then s.price_xof end desc nulls last,
    case when p_sort = 'soon'       then s.next_slot_at end asc,
    case when p_sort = 'new'        then s.created_at end desc,
    (s.highlight is not null) desc, s.rating_avg desc, s.rating_count desc, s.title asc
  limit v_limit offset v_offset;
end; $$;

-- ----------------------------------------------------------------------------
-- 11) Droits
-- ----------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'create_activity_booking(uuid,integer,text,text)', 'cancel_activity_booking(uuid)', 'scan_activity_ticket(text)',
    'submit_activity_review(uuid,integer,text)', 'report_activity_review(uuid,text)', 'submit_activity_for_review(uuid)',
    'admin_moderate_activity(uuid,activity_status,numeric,text,boolean)', 'admin_moderate_activity_review(uuid,text)',
    'admin_activity_overview()', 'get_organizer_activity_dashboard()', 'get_organizer_activity_bookings(uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke execute on function public.list_activities(text,text,text,integer,integer,date,integer,uuid,text,integer,integer) from public;
grant execute on function public.list_activities(text,text,text,integer,integer,date,integer,uuid,text,integer,integer) to anon, authenticated;
