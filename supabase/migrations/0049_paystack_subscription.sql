-- ============================================================================
-- SOUTRA-PAIYA — Migration 0049 : paiement Paystack des abonnements
-- ============================================================================
-- Branche les abonnements (migration 0046) sur l'infrastructure Paystack
-- existante (migrations 0007/0042). Aucune nouvelle Edge Function de
-- règlement : on étend la RPC paystack_settle_charge pour qu'elle dispatche
-- selon metadata->>'purpose'.
--
-- Flow :
--   1. Edge Function paystack-subscribe (nouvelle) crée une transaction
--      pending avec metadata = {purpose: 'subscription', plan_code, billing_period}
--      puis appelle Paystack initialize → retourne authorization_url.
--   2. User paie sur Paystack (carte / mobile money via Paystack UI).
--   3. paystack-verify (existant) ou paystack-webhook (existant) appelle
--      paystack_settle_charge(ref, paid_subunit).
--   4. Cette RPC, étendue ci-dessous, voit purpose=subscription dans la
--      metadata et appelle paystack_settle_subscription(tx_id) qui crée
--      l'abonnement actif.
--
-- Atomique et idempotent. Compatible avec le flow topup/payment existant
-- (le dispatch ne change pas le comportement pour ces purposes).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Nouvelle RPC : paystack_settle_subscription
--    Appelée par paystack_settle_charge quand purpose='subscription'.
--    Crée la subscription, annule la précédente, log l'event success.
-- ----------------------------------------------------------------------------

create or replace function public.paystack_settle_subscription(p_tx_id uuid)
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

  -- Crée la nouvelle subscription, liée à la transaction Paystack.
  insert into public.subscriptions (
    user_id, plan_code, status, billing_period,
    current_period_start, current_period_end,
    payment_provider, payment_ref,
    metadata
  )
  values (
    v_tx.user_id, v_plan.code, 'active', v_period,
    now(), v_end,
    'paystack', v_tx.provider_ref,
    jsonb_build_object(
      'tx_id', v_tx.id,
      'paid_amount_xof', v_tx.amount_xof,
      'source', 'paystack'
    )
  )
  returning id into v_id;

  -- Event analytics.
  insert into public.subscription_events (user_id, kind, plan_code, metadata)
  values (
    v_tx.user_id, 'subscribe_success', v_plan.code,
    jsonb_build_object(
      'billing_period', v_period::text,
      'subscription_id', v_id,
      'tx_id', v_tx.id,
      'provider', 'paystack',
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

revoke execute on function public.paystack_settle_subscription(uuid) from public;
grant execute on function public.paystack_settle_subscription(uuid) to service_role;

-- ----------------------------------------------------------------------------
-- 2) Étendre paystack_settle_charge pour dispatcher selon purpose
--    Préserve le comportement topup/payment existant. Ajoute le cas
--    purpose='subscription' → appel paystack_settle_subscription.
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

  -- Dispatch selon le purpose.
  v_purpose := v_tx.metadata->>'purpose';

  if v_purpose = 'subscription' then
    perform public.paystack_settle_subscription(v_tx.id);
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

-- Les grants existants (service_role) sont préservés par CREATE OR REPLACE.

-- ----------------------------------------------------------------------------
-- 3) RPC helper côté front : prix calculé serveur pour éviter les fraudes
--    L'Edge Function paystack-subscribe l'appelle pour avoir le montant
--    authoritatif (le front ne peut pas mentir sur le prix).
-- ----------------------------------------------------------------------------

create or replace function public.get_subscription_price(
  p_plan_code      text,
  p_billing_period text default 'monthly'
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_plan   record;
  v_period subscription_billing_period;
  v_amount bigint;
begin
  select * into v_plan from public.subscription_plans
   where code = p_plan_code::subscription_plan_code limit 1;
  if v_plan.code is null then
    raise exception 'PLAN_NOT_FOUND';
  end if;

  begin
    v_period := p_billing_period::subscription_billing_period;
  exception when others then
    raise exception 'INVALID_BILLING_PERIOD';
  end;

  v_amount := case
    when v_period = 'monthly' then v_plan.price_monthly_xof
    else v_plan.price_yearly_xof
  end;

  return jsonb_build_object(
    'plan_code', v_plan.code::text,
    'billing_period', v_period::text,
    'amount_xof', v_amount,
    'display_name', v_plan.display_name,
    'is_free', v_amount = 0
  );
end;
$$;

grant execute on function public.get_subscription_price(text, text) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4) Commentaires
-- ----------------------------------------------------------------------------

comment on function public.paystack_settle_subscription is
  'Crée la subscription après paiement Paystack confirmé. Idempotent via la transaction qui la précède (paystack_settle_charge UPDATE ... WHERE status pending).';
comment on function public.get_subscription_price is
  'Retourne le prix authoritatif pour un (plan, période). Utilisé par l''Edge Function paystack-subscribe pour calculer le montant à débiter.';
