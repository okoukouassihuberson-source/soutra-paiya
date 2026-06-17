-- ============================================================================
-- SOUTRA-PAIYA — Migration 0060 : paiement Paystack des réservations chambres
-- ============================================================================
-- Pattern miroir de la migration 0056 (paystack_settle_order) mais pour les
-- room_bookings (migration 0059). Branche l'infrastructure Paystack existante
-- au workflow hôtel : payment_status=paid + status=confirmed atomique.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) RPC paystack_settle_room_booking
--    Appelée par paystack_settle_charge quand metadata.purpose='room_booking'.
--    Idempotent (skip si ALREADY_PAID).
-- ----------------------------------------------------------------------------

create or replace function public.paystack_settle_room_booking(p_tx_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx        record;
  v_booking_id uuid;
  v_booking   record;
begin
  select id, user_id, amount_xof, provider_ref, metadata
    into v_tx
    from public.transactions
   where id = p_tx_id
   limit 1;
  if v_tx.id is null then raise exception 'TX_NOT_FOUND'; end if;

  v_booking_id := (v_tx.metadata->>'booking_id')::uuid;
  if v_booking_id is null then
    raise exception 'BOOKING_ID_MISSING_IN_METADATA';
  end if;

  select id, user_id, status, payment_status, total_xof
    into v_booking
    from public.room_bookings
   where id = v_booking_id
   for update;
  if v_booking.id is null then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.user_id <> v_tx.user_id then raise exception 'BOOKING_USER_MISMATCH'; end if;

  if v_booking.payment_status = 'paid' then
    return jsonb_build_object('ok', false, 'reason', 'ALREADY_PAID', 'booking_id', v_booking_id);
  end if;

  update public.room_bookings
     set payment_status   = 'paid',
         status           = case when status = 'pending' then 'confirmed'::room_booking_status else status end,
         payment_provider = 'paystack',
         payment_ref      = v_tx.provider_ref,
         confirmed_at     = case when confirmed_at is null then now() else confirmed_at end,
         updated_at       = now()
   where id = v_booking_id;

  return jsonb_build_object('ok', true, 'booking_id', v_booking_id, 'amount_xof', v_tx.amount_xof);
end;
$$;

revoke execute on function public.paystack_settle_room_booking(uuid) from public;
grant execute on function public.paystack_settle_room_booking(uuid) to service_role;

-- ----------------------------------------------------------------------------
-- 2) Étendre paystack_settle_charge avec dispatch purpose='room_booking'
-- ----------------------------------------------------------------------------

create or replace function public.paystack_settle_charge(
  p_reference    text,
  p_paid_subunit bigint
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

  if not found then return 'not_found'; end if;
  if v_tx.status = 'success' then return 'already_settled'; end if;
  if v_tx.status <> 'pending' then return 'not_pending'; end if;
  if p_paid_subunit < v_tx.amount_xof * 100 then return 'amount_mismatch'; end if;

  update transactions
     set status = 'success', completed_at = now()
   where id = v_tx.id;

  v_purpose := v_tx.metadata->>'purpose';

  if v_purpose = 'subscription' then
    perform public.paystack_settle_subscription(v_tx.id);
  elsif v_purpose = 'order' then
    perform public.paystack_settle_order(v_tx.id);
  elsif v_purpose = 'room_booking' then
    perform public.paystack_settle_room_booking(v_tx.id);
  elsif v_tx.type = 'topup' then
    update wallets set balance_xof = balance_xof + v_tx.amount_xof where user_id = v_tx.user_id;
  elsif v_tx.type = 'payment' and v_tx.reservation_id is not null then
    update reservations set escrow_tx_id = v_tx.id where id = v_tx.reservation_id;
  end if;

  return 'settled';
end;
$$;

-- ----------------------------------------------------------------------------
-- 3) RPC helper : prix authoritatif d'un room_booking
-- ----------------------------------------------------------------------------

create or replace function public.get_room_booking_payment_info(p_booking_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_booking record;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select b.id, b.user_id, b.venue_id, b.booking_number, b.total_xof,
         b.status, b.payment_status, v.name as venue_name, r.name as room_name
    into v_booking
    from public.room_bookings b
    join public.venues v on v.id = b.venue_id
    join public.rooms  r on r.id = b.room_id
   where b.id = p_booking_id
   limit 1;
  if v_booking.id is null then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.user_id <> v_uid then raise exception 'NOT_OWNER'; end if;

  return jsonb_build_object(
    'booking_id', v_booking.id,
    'venue_id', v_booking.venue_id,
    'venue_name', v_booking.venue_name,
    'room_name', v_booking.room_name,
    'booking_number', v_booking.booking_number,
    'total_xof', v_booking.total_xof,
    'status', v_booking.status::text,
    'payment_status', v_booking.payment_status::text,
    'payable', v_booking.status = 'pending' and v_booking.payment_status = 'pending'
  );
end;
$$;

revoke execute on function public.get_room_booking_payment_info(uuid) from public;
grant execute on function public.get_room_booking_payment_info(uuid) to authenticated, service_role;

comment on function public.paystack_settle_room_booking is
  'Marque room_booking payée+confirmée après paiement Paystack. Idempotente. Appelée par paystack_settle_charge (dispatch purpose=room_booking).';
