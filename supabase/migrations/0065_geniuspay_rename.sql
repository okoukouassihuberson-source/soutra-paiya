-- ============================================================================
-- SOUTRA-PAIYA — Migration 0065 : socle SQL GeniusPay (additif Paystack)
-- ============================================================================
-- Migration PURE additive : aucune fonction ni colonne paystack_* n'est
-- supprimée par cette migration. La suppression finale arrivera en PR #4 une
-- fois que plus aucune Edge Function n'invoque les RPC paystack_*.
--
-- Ce que cette migration ajoute :
--   1. La valeur 'geniuspay' dans l'enum payment_provider.
--   2. Les RPC de règlement GeniusPay, miroir des paystack_* mais sans la
--      multiplication subunit ×100 (GeniusPay paie en XOF entier).
--   3. Le dispatch geniuspay_settle_charge → geniuspay_settle_subscription /
--      geniuspay_settle_order / geniuspay_settle_room_booking selon
--      metadata->>'purpose'.
--   4. Le règlement des payouts (geniuspay_settle_payout), équivalent de
--      paystack_settle_transfer mais sans contrainte de subunit.
--
-- Les Edge Functions de PR #2/3/4 utiliseront ces nouvelles RPC ; les écrans
-- existants continuent de fonctionner sur les RPC paystack_* jusqu'au switch.
-- ============================================================================

-- 1. Nouveau fournisseur de paiement.
--    ⚠️ Doit rester la 1re instruction du fichier : une valeur d'enum
--    nouvellement ajoutée ne peut pas être utilisée dans la même transaction
--    que son ajout. Aucune instruction ci-dessous ne référence 'geniuspay'.
alter type payment_provider add value if not exists 'geniuspay';

-- ============================================================================
-- 2. Règlement d'un abonnement après paiement GeniusPay confirmé.
--    Miroir de paystack_settle_subscription : crée la subscription, annule la
--    précédente, log l'event 'subscribe_success'. La différence principale est
--    le marqueur 'source' = 'geniuspay' pour la traçabilité analytics.
-- ============================================================================
create or replace function public.geniuspay_settle_subscription(p_tx_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx          record;
  v_plan_code   text;
  v_period_text text;
  v_plan        record;
  v_period      subscription_billing_period;
  v_end         timestamptz;
  v_id          uuid;
begin
  select id, user_id, amount_xof, provider_ref, metadata
    into v_tx
    from public.transactions
   where id = p_tx_id
   limit 1;
  if v_tx.id is null then
    raise exception 'TX_NOT_FOUND';
  end if;

  v_plan_code   := v_tx.metadata->>'plan_code';
  v_period_text := coalesce(v_tx.metadata->>'billing_period', 'monthly');

  if v_plan_code is null then
    raise exception 'PLAN_CODE_MISSING_IN_METADATA';
  end if;

  select * into v_plan from public.subscription_plans
   where code = v_plan_code::subscription_plan_code limit 1;
  if v_plan.code is null then
    raise exception 'PLAN_NOT_FOUND';
  end if;

  begin
    v_period := v_period_text::subscription_billing_period;
  exception when others then
    v_period := 'monthly';
  end;

  v_end := case
    when v_period = 'monthly' then now() + interval '30 days'
    else now() + interval '365 days'
  end;

  -- Annule toute autre subscription active pour ce user.
  update public.subscriptions
     set status = 'cancelled',
         cancel_at_period_end = true,
         updated_at = now()
   where user_id = v_tx.user_id
     and status in ('active', 'trialing', 'past_due');

  insert into public.subscriptions (
    user_id, plan_code, status, billing_period,
    current_period_start, current_period_end,
    payment_provider, payment_ref,
    metadata
  )
  values (
    v_tx.user_id, v_plan.code, 'active', v_period,
    now(), v_end,
    'geniuspay', v_tx.provider_ref,
    jsonb_build_object(
      'tx_id', v_tx.id,
      'paid_amount_xof', v_tx.amount_xof,
      'source', 'geniuspay',
      'subscription_uuid', v_tx.metadata->>'subscription_uuid'
    )
  )
  returning id into v_id;

  insert into public.subscription_events (user_id, kind, plan_code, metadata)
  values (
    v_tx.user_id, 'subscribe_success', v_plan.code,
    jsonb_build_object(
      'billing_period', v_period::text,
      'subscription_id', v_id,
      'tx_id', v_tx.id,
      'provider', 'geniuspay',
      'amount_xof', v_tx.amount_xof
    )
  );

  return jsonb_build_object(
    'ok', true,
    'subscription_id', v_id,
    'plan_code', v_plan.code::text
  );
end;
$$;

revoke execute on function public.geniuspay_settle_subscription(uuid) from public;
grant execute on function public.geniuspay_settle_subscription(uuid) to service_role;

-- ============================================================================
-- 3. Règlement d'un order boutique après paiement GeniusPay confirmé.
-- ============================================================================
create or replace function public.geniuspay_settle_order(p_tx_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx       record;
  v_order_id uuid;
  v_order    record;
begin
  select id, user_id, amount_xof, provider_ref, metadata
    into v_tx
    from public.transactions
   where id = p_tx_id
   limit 1;
  if v_tx.id is null then
    raise exception 'TX_NOT_FOUND';
  end if;

  v_order_id := (v_tx.metadata->>'order_id')::uuid;
  if v_order_id is null then
    raise exception 'ORDER_ID_MISSING_IN_METADATA';
  end if;

  select id, user_id, status, payment_status, total_xof
    into v_order
    from public.orders
   where id = v_order_id
   for update;
  if v_order.id is null then
    raise exception 'ORDER_NOT_FOUND';
  end if;
  if v_order.user_id <> v_tx.user_id then
    raise exception 'ORDER_USER_MISMATCH';
  end if;

  if v_order.payment_status = 'paid' then
    return jsonb_build_object('ok', false, 'reason', 'ALREADY_PAID', 'order_id', v_order_id);
  end if;

  update public.orders
     set payment_status   = 'paid',
         status           = case when status = 'pending' then 'confirmed'::order_status else status end,
         payment_provider = 'geniuspay',
         payment_ref      = v_tx.provider_ref,
         confirmed_at     = case when confirmed_at is null then now() else confirmed_at end,
         updated_at       = now()
   where id = v_order_id;

  return jsonb_build_object(
    'ok', true,
    'order_id', v_order_id,
    'amount_xof', v_tx.amount_xof
  );
end;
$$;

revoke execute on function public.geniuspay_settle_order(uuid) from public;
grant execute on function public.geniuspay_settle_order(uuid) to service_role;

-- ============================================================================
-- 4. Règlement d'un room_booking hôtel après paiement GeniusPay confirmé.
-- ============================================================================
create or replace function public.geniuspay_settle_room_booking(p_tx_id uuid)
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

  if v_booking.payment_status = 'paid' then
    return jsonb_build_object('ok', false, 'reason', 'ALREADY_PAID', 'booking_id', v_booking_id);
  end if;

  update public.room_bookings
     set payment_status   = 'paid',
         status           = case when status = 'pending' then 'confirmed'::room_booking_status else status end,
         payment_provider = 'geniuspay',
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

revoke execute on function public.geniuspay_settle_room_booking(uuid) from public;
grant execute on function public.geniuspay_settle_room_booking(uuid) to service_role;

-- ============================================================================
-- 5. Règlement d'un encaissement GeniusPay (recharge / acompte / order /
--    booking / subscription). Dispatch selon metadata->>'purpose'.
--
--    Différence critique vs paystack_settle_charge :
--       p_paid_amount_xof EST en XOF entier (pas en subunit ×100).
--       Donc la comparaison directe : p_paid_amount_xof < v_tx.amount_xof.
-- ============================================================================
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
  -- GeniusPay : XOF entier, comparaison directe.
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

-- ============================================================================
-- 6. Règlement d'un payout (retrait wallet ou payout venue).
--    Sur succès : marque la transaction success. Sur échec : marque failed et
--    rembourse le wallet (le débit a été fait à l'initiation).
-- ============================================================================
create or replace function public.geniuspay_settle_payout(p_reference text, p_outcome text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx transactions;
begin
  select * into v_tx
    from transactions
   where provider_ref = p_reference
   for update;

  if not found then
    return 'not_found';
  end if;
  if v_tx.status <> 'pending' then
    return 'already_settled';
  end if;

  if p_outcome = 'success' then
    update transactions
       set status = 'success', completed_at = now()
     where id = v_tx.id;
  else
    update transactions
       set status = 'failed', completed_at = now()
     where id = v_tx.id;
    -- Remboursement du wallet (le retrait avait débité à l'initiation).
    update wallets
       set balance_xof = balance_xof + v_tx.amount_xof
     where user_id = v_tx.user_id;
  end if;

  return 'settled';
end;
$$;

revoke execute on function public.geniuspay_settle_payout(text, text) from public;
grant execute on function public.geniuspay_settle_payout(text, text) to service_role;

-- ============================================================================
-- 7. Commentaires
-- ============================================================================
comment on function public.geniuspay_settle_charge is
  'Règle un encaissement GeniusPay confirmé (XOF entier, pas de subunit). Dispatch selon metadata->>purpose vers settle_subscription / settle_order / settle_room_booking. Idempotente : SELECT FOR UPDATE + transition pending → success.';
comment on function public.geniuspay_settle_subscription is
  'Crée la subscription Soutra après paiement GeniusPay confirmé. Le récurrent est ensuite géré côté GeniusPay (POST /subscriptions avec billing_cycle) ; cette RPC n''enregistre que la 1re activation.';
comment on function public.geniuspay_settle_order is
  'Marque l''order boutique payée + confirmée après paiement GeniusPay confirmé. Idempotente.';
comment on function public.geniuspay_settle_room_booking is
  'Marque le room_booking hôtel payé + confirmé après paiement GeniusPay confirmé. Idempotente.';
comment on function public.geniuspay_settle_payout is
  'Règle un payout GeniusPay : success → tx success ; failed → tx failed + reversement du wallet. Idempotente.';
