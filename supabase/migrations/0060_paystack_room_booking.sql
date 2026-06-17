-- ============================================================================
-- SOUTRA-PAIYA — Migration 0060 : paiement Paystack des bookings hôtel
-- ============================================================================
-- Étend l'infrastructure Paystack (migrations 0007/0049/0056) pour les
-- room_bookings créés par le module hôtel (migration 0059). Pattern miroir
-- de paystack_settle_order mais pour room_bookings.
--
-- Flow :
--   1. Mobile crée booking (status='pending', payment_status='pending') via
--      create_room_booking (0059)
--   2. Mobile invoke Edge Function paystack-pay-booking avec booking_id
--   3. Edge Function : créer tx pending metadata={purpose:'room_booking',
--      booking_id} + Paystack initialize → return authorization_url
--   4. User paie → callback → paystack-verify → paystack_settle_charge →
--      dispatch sur purpose='room_booking' → paystack_settle_room_booking →
--      booking.payment_status='paid' + booking.status='confirmed' →
--      trigger send-push notifie le client + le merchant
--
-- Backward compatible : aucune table modifiée, paystack_settle_charge
-- continue de gérer topup/payment/subscription/order comme avant.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) RPC paystack_settle_room_booking — appelée par paystack_settle_charge
--    Activée quand metadata->>'purpose' = 'room_booking' et
--    metadata->>'booking_id' présent.
-- ----------------------------------------------------------------------------

create or replace function public.paystack_settle_room_booking(p_tx_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx         record;
  v_booking_id uuid;
  v_booking    record;
begin
  select id, user_id, amount_xof, provider_ref, metadata
    into v_tx
    from public.transactions
   where id = p_tx_id
   limit 1;
  if v_tx.id is null then
    raise exception 'TX_NOT_FOUND';
  end if;

  v_booking_id := (v_tx.metadata->>'booking_id')::uuid;
  if v_booking_id is null then
    raise exception 'BOOKING_ID_MISSING_IN_METADATA';
  end if;

  -- Lock + lecture du booking
  select id, user_id, status, payment_status, total_xof
    into v_booking
    from public.room_bookings
   where id = v_booking_id
   for update;
  if v_booking.id is null then
    raise exception 'BOOKING_NOT_FOUND';
  end if;
  if v_booking.user_id <> v_tx.user_id then
    raise exception 'BOOKING_USER_MISMATCH';
  end if;

  -- Idempotent : si déjà payé, on ne refait rien
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

  return jsonb_build_object(
    'ok', true,
    'booking_id', v_booking_id,
    'amount_xof', v_tx.amount_xof
  );
end;
$$;

revoke execute on function public.paystack_settle_room_booking(uuid) from public;
grant execute on function public.paystack_settle_room_booking(uuid) to service_role;

-- ----------------------------------------------------------------------------
-- 2) Étendre paystack_settle_charge avec dispatch purpose='room_booking'
--    Préserve le comportement existant.
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

  if not found then
    return 'not_found';
  end if;
  if v_tx.status = 'success' then
    return 'already_settled';
  end if;
  if v_tx.status <> 'pending' then
    return 'not_pending';
  end if;
  if p_paid_subunit < v_tx.amount_xof * 100 then
    return 'amount_mismatch';
  end if;

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

-- ----------------------------------------------------------------------------
-- 3) RPC helper côté Edge Function : prix authoritatif d'un booking
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
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select b.id, b.user_id, b.venue_id, b.booking_number, b.total_xof,
         b.status, b.payment_status, b.check_in_date, b.check_out_date,
         b.nights_count, v.name as venue_name
    into v_booking
    from public.room_bookings b
    join public.venues v on v.id = b.venue_id
   where b.id = p_booking_id
   limit 1;

  if v_booking.id is null then
    raise exception 'BOOKING_NOT_FOUND';
  end if;
  if v_booking.user_id <> v_uid then
    raise exception 'NOT_OWNER';
  end if;

  return jsonb_build_object(
    'booking_id', v_booking.id,
    'venue_id', v_booking.venue_id,
    'venue_name', v_booking.venue_name,
    'booking_number', v_booking.booking_number,
    'total_xof', v_booking.total_xof,
    'nights_count', v_booking.nights_count,
    'check_in_date', v_booking.check_in_date,
    'check_out_date', v_booking.check_out_date,
    'status', v_booking.status::text,
    'payment_status', v_booking.payment_status::text,
    'payable', v_booking.status = 'pending' and v_booking.payment_status = 'pending'
  );
end;
$$;

revoke execute on function public.get_room_booking_payment_info(uuid) from public;
grant execute on function public.get_room_booking_payment_info(uuid) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4) Commentaires
-- ----------------------------------------------------------------------------

comment on function public.paystack_settle_room_booking is
  'Marque le room_booking payé + confirmé après paiement Paystack. Idempotente, appelée par paystack_settle_charge (dispatch purpose=room_booking).';
comment on function public.get_room_booking_payment_info is
  'Prix authoritatif côté Edge Function paystack-pay-booking. Vérifie owner + retourne montant à débiter.';
