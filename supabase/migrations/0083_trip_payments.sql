-- ============================================================================
-- SOUTRA PLAYCE V2 — Migration 0083 : paiement des voyages (acompte / solde / reçu)
-- ============================================================================
-- Additive. Étend la fondation 0082 :
--   • trip_payments : grand livre des encaissements par réservation (reçus)
--   • get_trip_booking_payment_info : montant à payer faisant autorité (serveur)
--   • geniuspay_settle_trip_booking  : règlement idempotent après paiement
--   • geniuspay_settle_charge        : ajout de la branche purpose='trip_booking'
--                                      (version 0077 conservée à l'identique)
--   • expiration des réservations impayées (libère les places, 24 h)
--   • annulation client refusée si de l'argent a déjà été encaissé
--   • scan QR : retourne le voyageur et le solde restant dû
--   • corrige un risque de récursion RLS via des helpers security definer
-- Le paiement passe par l'Edge Function geniuspay-pay-trip (même contrat que
-- geniuspay-pay-booking). Paystack n'est pas étendu (comme pour les billets 0077).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Expiration des impayés + helpers RLS
-- ----------------------------------------------------------------------------
alter table public.trip_bookings
  add column if not exists expires_at timestamptz;

update public.trip_bookings
   set expires_at = created_at + interval '24 hours'
 where expires_at is null and status = 'pending';

-- Helpers security definer : évitent la récursion RLS trips <-> trip_bookings.
create or replace function public.is_trip_organizer(p_trip_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.trips t where t.id = p_trip_id and t.organizer_id = auth.uid());
$$;

create or replace function public.is_trip_booker(p_trip_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.trip_bookings b where b.trip_id = p_trip_id and b.user_id = auth.uid());
$$;

revoke execute on function public.is_trip_organizer(uuid) from public;
revoke execute on function public.is_trip_booker(uuid) from public;
grant execute on function public.is_trip_organizer(uuid) to authenticated;
grant execute on function public.is_trip_booker(uuid) to authenticated;

drop policy if exists trip_bookings_select on public.trip_bookings;
create policy trip_bookings_select on public.trip_bookings
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin() or public.is_trip_organizer(trip_id));

-- Un voyageur garde l'accès à son voyage même s'il est clos/annulé.
drop policy if exists trips_select_booker on public.trips;
create policy trips_select_booker on public.trips
  for select to authenticated using (public.is_trip_booker(id));

-- ----------------------------------------------------------------------------
-- 2) trip_payments — reçus
-- ----------------------------------------------------------------------------
create table if not exists public.trip_payments (
  id             uuid primary key default gen_random_uuid(),
  booking_id     uuid not null references public.trip_bookings(id),
  transaction_id uuid not null unique references public.transactions(id),
  kind           text not null check (kind in ('deposit','balance','full')),
  amount_xof     bigint not null check (amount_xof > 0),
  provider       text not null default 'geniuspay',
  receipt_number text not null unique,
  created_at     timestamptz not null default now()
);
create index if not exists idx_trip_payments_booking on public.trip_payments(booking_id, created_at);

alter table public.trip_payments enable row level security;
drop policy if exists trip_payments_select on public.trip_payments;
create policy trip_payments_select on public.trip_payments
  for select to authenticated
  using (exists (
    select 1 from public.trip_bookings b
     where b.id = booking_id
       and (b.user_id = auth.uid() or public.is_admin() or public.is_trip_organizer(b.trip_id))
  ));

-- ----------------------------------------------------------------------------
-- 3) create_trip_booking : version avec libération des impayés expirés
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
  v_freed integer;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_participants is null or p_participants < 1 or p_participants > 50 then
    raise exception 'INVALID_PARTICIPANTS';
  end if;

  select * into v_trip from public.trips where id = p_trip_id for update;
  if not found or v_trip.status not in ('published','full') then raise exception 'TRIP_NOT_AVAILABLE'; end if;
  if v_trip.starts_on <= current_date then raise exception 'TRIP_ALREADY_STARTED'; end if;

  -- Libère les places retenues par des réservations impayées expirées.
  with expired as (
    update public.trip_bookings
       set status = 'cancelled'
     where trip_id = p_trip_id and status = 'pending' and paid_xof = 0
       and expires_at is not null and expires_at < now()
    returning participants
  )
  select coalesce(sum(participants), 0) into v_freed from expired;
  if v_freed > 0 then
    update public.trips
       set seats_booked = greatest(0, seats_booked - v_freed),
           status = case when status = 'full' then 'published' else status end
     where id = p_trip_id
    returning * into v_trip;
  end if;

  if v_trip.status <> 'published' then raise exception 'TRIP_NOT_AVAILABLE'; end if;
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
    (reference, user_id, trip_id, package_id, participants, unit_price_xof, total_xof,
     contact_phone, notes, expires_at)
  values
    (v_ref, v_uid, p_trip_id, p_package_id, p_participants, v_price, v_price * p_participants,
     nullif(trim(p_phone), ''), nullif(trim(p_notes), ''), now() + interval '24 hours')
  returning id into v_id;

  update public.trips
     set seats_booked = seats_booked + p_participants,
         status = case when seats_booked + p_participants >= seats_total then 'full' else status end
   where id = p_trip_id;

  return jsonb_build_object('id', v_id, 'reference', v_ref,
                            'total_xof', v_price * p_participants,
                            'expires_at', now() + interval '24 hours');
end; $$;

-- ----------------------------------------------------------------------------
-- 4) cancel_trip_booking : jamais d'annulation silencieuse d'un montant payé
-- ----------------------------------------------------------------------------
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
  -- Un voyageur ne peut annuler seul qu'une réservation non payée : le
  -- remboursement d'un acompte/solde est traité par l'organisateur ou l'admin.
  if b.paid_xof > 0 and not public.is_admin() then raise exception 'REFUND_REQUIRED'; end if;
  update public.trip_bookings set status = 'cancelled' where id = b.id;
  update public.trips
     set seats_booked = greatest(0, seats_booked - b.participants),
         status = case when status = 'full' then 'published' else status end
   where id = b.trip_id;
  return jsonb_build_object('ok', true, 'refund_due_xof', b.paid_xof);
end; $$;

-- ----------------------------------------------------------------------------
-- 5) Montant à payer faisant autorité (appelée par l'Edge Function avec le JWT)
-- ----------------------------------------------------------------------------
create or replace function public.get_trip_booking_payment_info(
  p_booking_id uuid,
  p_kind       text default 'full'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  b     public.trip_bookings%rowtype;
  t     public.trips%rowtype;
  v_amount bigint;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_kind not in ('deposit','balance','full') then raise exception 'INVALID_KIND'; end if;

  select * into b from public.trip_bookings where id = p_booking_id;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if b.user_id <> v_uid then raise exception 'NOT_OWNER'; end if;
  select * into t from public.trips where id = b.trip_id;

  if b.status in ('cancelled','used') or b.paid_xof >= b.total_xof then
    return jsonb_build_object('payable', false, 'reason', 'NOT_PAYABLE');
  end if;
  if b.status = 'pending' and b.expires_at is not null and b.expires_at < now() and b.paid_xof = 0 then
    return jsonb_build_object('payable', false, 'reason', 'EXPIRED');
  end if;

  if p_kind = 'full' then
    if b.paid_xof > 0 then return jsonb_build_object('payable', false, 'reason', 'ALREADY_PARTIALLY_PAID'); end if;
    v_amount := b.total_xof;
  elsif p_kind = 'deposit' then
    if b.paid_xof > 0 or t.deposit_pct >= 100 then return jsonb_build_object('payable', false, 'reason', 'DEPOSIT_NOT_AVAILABLE'); end if;
    v_amount := ceil(b.total_xof * t.deposit_pct / 100.0)::bigint;
  else  -- balance
    if b.paid_xof = 0 then return jsonb_build_object('payable', false, 'reason', 'NO_DEPOSIT_YET'); end if;
    v_amount := b.total_xof - b.paid_xof;
  end if;

  return jsonb_build_object(
    'payable', true,
    'booking_id', b.id, 'reference', b.reference, 'trip_id', t.id, 'trip_title', t.title,
    'kind', p_kind, 'amount_xof', v_amount, 'total_xof', b.total_xof, 'paid_xof', b.paid_xof,
    'organizer_id', t.organizer_id
  );
end; $$;

revoke execute on function public.get_trip_booking_payment_info(uuid, text) from public;
grant execute on function public.get_trip_booking_payment_info(uuid, text) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 6) Règlement idempotent après encaissement
-- ----------------------------------------------------------------------------
create or replace function public.geniuspay_settle_trip_booking(p_tx_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx   record;
  b      public.trip_bookings%rowtype;
  v_kind text;
  v_new  bigint;
begin
  select id, user_id, amount_xof, provider_ref, metadata into v_tx
    from public.transactions where id = p_tx_id;
  if v_tx.id is null then raise exception 'TX_NOT_FOUND'; end if;

  if exists (select 1 from public.trip_payments where transaction_id = p_tx_id) then
    return jsonb_build_object('ok', false, 'reason', 'ALREADY_SETTLED');
  end if;

  select * into b from public.trip_bookings
   where id = (v_tx.metadata->>'booking_id')::uuid for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if b.user_id <> v_tx.user_id then raise exception 'BOOKING_USER_MISMATCH'; end if;

  v_kind := coalesce(v_tx.metadata->>'kind', 'full');
  -- Plafonné au total : un double paiement concurrent ne dépasse jamais le dû
  -- (l'excédent reste visible dans transactions pour remboursement manuel).
  v_new := least(b.total_xof, b.paid_xof + v_tx.amount_xof);

  insert into public.trip_payments (booking_id, transaction_id, kind, amount_xof, receipt_number)
  values (b.id, v_tx.id, v_kind, v_tx.amount_xof,
          'RCT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)));

  update public.trip_bookings
     set paid_xof = v_new,
         status = case
                    when status = 'cancelled' then status   -- paiement tardif : à rembourser
                    when status = 'used' then status
                    when v_new >= total_xof then 'paid'::trip_booking_status
                    else 'confirmed'::trip_booking_status
                  end
   where id = b.id;

  return jsonb_build_object('ok', true, 'booking_id', b.id, 'paid_xof', v_new,
                            'late_payment', b.status = 'cancelled');
end; $$;

revoke execute on function public.geniuspay_settle_trip_booking(uuid) from public;
grant execute on function public.geniuspay_settle_trip_booking(uuid) to service_role;

-- ----------------------------------------------------------------------------
-- 7) geniuspay_settle_charge : version 0077 + branche trip_booking
-- ----------------------------------------------------------------------------
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
  select * into v_tx
    from transactions
   where provider_ref = p_reference
   for update;

  if not found then
    return 'not_found';
  end if;
  if v_tx.status = 'success' then
    return 'already_settled';
  end if;
  if v_tx.status <> 'pending' then
    return 'not_pending';
  end if;
  if p_paid_amount_xof < v_tx.amount_xof then
    return 'amount_mismatch';
  end if;

  update transactions
     set status = 'success', completed_at = now()
   where id = v_tx.id;

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
  elsif v_tx.type = 'topup' then
    update wallets
       set balance_xof = balance_xof + v_tx.amount_xof
     where user_id = v_tx.user_id;
  elsif v_tx.type = 'payment' and v_tx.reservation_id is not null then
    update reservations
       set escrow_tx_id = v_tx.id
     where id = v_tx.reservation_id;
  end if;

  return 'settled';
end;
$$;

revoke execute on function public.geniuspay_settle_charge(text, bigint) from public;
grant execute on function public.geniuspay_settle_charge(text, bigint) to service_role;

-- ----------------------------------------------------------------------------
-- 8) Scan QR : voyageur + solde restant
-- ----------------------------------------------------------------------------
create or replace function public.scan_trip_ticket(p_qr_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.trip_bookings%rowtype;
  t public.trips%rowtype;
  v_name text;
begin
  select * into b from public.trip_bookings where qr_token = p_qr_token for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'UNKNOWN_TICKET'); end if;
  select * into t from public.trips where id = b.trip_id;
  if t.organizer_id <> auth.uid() and not public.is_admin() then
    raise exception 'NOT_AUTHORIZED';
  end if;
  select full_name into v_name from public.profiles where id = b.user_id;
  if b.status = 'used' then
    return jsonb_build_object('ok', false, 'error', 'ALREADY_USED', 'used_at', b.used_at, 'traveler', v_name);
  end if;
  if b.status not in ('paid','confirmed') then
    return jsonb_build_object('ok', false, 'error', 'NOT_PAID', 'status', b.status, 'traveler', v_name);
  end if;
  update public.trip_bookings set status = 'used', used_at = now() where id = b.id;
  return jsonb_build_object('ok', true, 'reference', b.reference, 'traveler', v_name,
                            'participants', b.participants, 'trip', t.title,
                            'balance_due_xof', b.total_xof - b.paid_xof);
end; $$;

revoke execute on function public.scan_trip_ticket(text) from public;
grant execute on function public.scan_trip_ticket(text) to authenticated;

comment on table public.trip_payments is 'Encaissements (acompte/solde/total) par réservation de voyage ; chaque ligne = un reçu. Écriture uniquement via geniuspay_settle_trip_booking.';

-- ----------------------------------------------------------------------------
-- 9) Correctif du garde trips (0082) : ne bride que les écritures directes des
--    clients (rôles RLS 'authenticated'/'anon'). Les RPC security definer
--    (create/cancel_trip_booking) s'exécutent sous le rôle propriétaire et
--    doivent pouvoir mettre à jour seats_booked / status. À l'INSERT, un
--    organisateur ne peut pas pré-remplir les compteurs ni la commission.
-- ----------------------------------------------------------------------------
-- Volontairement SANS security definer : current_user doit rester le rôle de la
-- session (authenticated/anon) pour les écritures directes, et le propriétaire
-- pour les RPC security definer.
create or replace function public.tg_trips_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user not in ('authenticated', 'anon') or public.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.seats_booked   := 0;
    new.commission_pct := null;
    new.status         := 'draft';
  else
    new.seats_booked   := old.seats_booked;
    new.commission_pct := old.commission_pct;
    new.organizer_id   := old.organizer_id;
    if new.status is distinct from old.status
       and new.status not in ('draft','closed','cancelled') then
      new.status := old.status;  -- la publication passe par la modération admin
    end if;
  end if;
  return new;
end; $$;
