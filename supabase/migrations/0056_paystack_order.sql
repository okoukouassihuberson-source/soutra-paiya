-- ============================================================================
-- SOUTRA-PAIYA — Migration 0056 : paiement Paystack des commandes boutique
-- ============================================================================
-- Étend l'infrastructure Paystack (migrations 0007/0049) pour les orders
-- créées par le module boutique (migration 0055). Pattern miroir de
-- paystack_settle_subscription mais pour orders.
--
-- Flow :
--   1. Mobile crée order (status='pending', payment_status='pending') via
--      create_order_from_cart (0055)
--   2. Mobile invoke Edge Function paystack-pay-order avec order_id
--   3. Edge Function : créer tx pending metadata={purpose:'order', order_id}
--      + appel Paystack initialize → return authorization_url
--   4. User paie sur Paystack → callback → invoke paystack-verify
--   5. paystack_settle_charge (étendue) dispatch sur purpose='order' →
--      appelle paystack_settle_order → order.payment_status='paid' +
--      order.status='confirmed' → trigger send-push notifie le client +
--      le merchant
--
-- Backward compatible : aucune table modifiée, paystack_settle_charge
-- continue de gérer topup/payment/subscription comme avant.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) RPC paystack_settle_order — appelée par paystack_settle_charge
--    Activée quand metadata->>'purpose' = 'order' et metadata->>'order_id'
--    présent. Marque l'order payée + confirmée.
-- ----------------------------------------------------------------------------

create or replace function public.paystack_settle_order(p_tx_id uuid)
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

  -- order_id stocké dans metadata par l'Edge Function paystack-pay-order
  v_order_id := (v_tx.metadata->>'order_id')::uuid;
  if v_order_id is null then
    raise exception 'ORDER_ID_MISSING_IN_METADATA';
  end if;

  -- Lock + lecture de l'order
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

  -- Idempotent : si déjà payée, on ne refait rien
  if v_order.payment_status = 'paid' then
    return jsonb_build_object('ok', false, 'reason', 'ALREADY_PAID', 'order_id', v_order_id);
  end if;

  -- Marque l'order payée + confirmée. confirmed_at posé si pas déjà.
  update public.orders
     set payment_status   = 'paid',
         status           = case when status = 'pending' then 'confirmed'::order_status else status end,
         payment_provider = 'paystack',
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

revoke execute on function public.paystack_settle_order(uuid) from public;
grant execute on function public.paystack_settle_order(uuid) to service_role;

-- ----------------------------------------------------------------------------
-- 2) Étendre paystack_settle_charge avec dispatch purpose='order'
--    Préserve le comportement topup/payment/subscription existant.
--    Ajout du cas 'order' → paystack_settle_order.
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

  -- Dispatch selon le purpose
  v_purpose := v_tx.metadata->>'purpose';

  if v_purpose = 'subscription' then
    perform public.paystack_settle_subscription(v_tx.id);
  elsif v_purpose = 'order' then
    perform public.paystack_settle_order(v_tx.id);
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
-- 3) RPC helper côté Edge Function : prix authoritatif d'un order
--    Évite que l'Edge Function ne se base sur un total_xof envoyé par le
--    client (qu'on ne peut pas faire confiance).
-- ----------------------------------------------------------------------------

create or replace function public.get_order_payment_info(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_order record;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select o.id, o.user_id, o.venue_id, o.order_number, o.total_xof,
         o.status, o.payment_status, v.name as venue_name
    into v_order
    from public.orders o
    join public.venues v on v.id = o.venue_id
   where o.id = p_order_id
   limit 1;

  if v_order.id is null then
    raise exception 'ORDER_NOT_FOUND';
  end if;
  if v_order.user_id <> v_uid then
    raise exception 'NOT_OWNER';
  end if;

  return jsonb_build_object(
    'order_id', v_order.id,
    'venue_id', v_order.venue_id,
    'venue_name', v_order.venue_name,
    'order_number', v_order.order_number,
    'total_xof', v_order.total_xof,
    'status', v_order.status::text,
    'payment_status', v_order.payment_status::text,
    'payable', v_order.status = 'pending' and v_order.payment_status = 'pending'
  );
end;
$$;

revoke execute on function public.get_order_payment_info(uuid) from public;
grant execute on function public.get_order_payment_info(uuid) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4) Commentaires
-- ----------------------------------------------------------------------------

comment on function public.paystack_settle_order is
  'Marque l''order payée + confirmée après paiement Paystack. Idempotente, appelée par paystack_settle_charge (dispatch purpose=order).';
comment on function public.get_order_payment_info is
  'Prix authoritatif côté Edge Function paystack-pay-order. Vérifie owner + retourne montant à débiter.';
