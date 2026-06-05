-- ============================================================================
-- SOUTRA-PAIYA — Migration 0048 : Subscriptions + Cashback + Refunds
-- ============================================================================
-- Palier final de la migration CinetPay (Phase 14). Ajoute trois moteurs
-- transversaux qui s'appuient sur l'infra existante (wallets, transactions,
-- subscriptions de 0047, monetization_rules de 0041) :
--
--   1. RPCs subscribe / activate_subscription / cancel_subscription
--      → cycle de vie complet des abonnements (Standard / Pro / Premium /
--        Soutra Premium)
--   2. RPCs request_refund / process_refund + statut 'refunded' déjà dans
--      enum tx_status (0001)
--   3. Trigger SQL tg_cashback_on_payment_success qui crédite automatique-
--      ment l'utilisateur après chaque paiement (% configurable via
--      monetization_rules existant)
--   4. Helper admin list_recent_fraud_logs (lecture rapide depuis 0047)
--
-- Non-cassant : aucune table existante modifiée. Réutilise subscriptions,
-- fraud_logs (créées en 0047), wallets, transactions.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) RPC subscribe — crée un abonnement pending pour le caller
-- ----------------------------------------------------------------------------

create or replace function public.subscribe(
  p_plan_code   text,
  p_amount_xof  bigint default null,
  p_duration_days integer default 30
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sub_id uuid;
  v_reference text;
  v_existing_active uuid;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_plan_code is null or length(trim(p_plan_code)) = 0 then
    raise exception 'PLAN_CODE_REQUIRED';
  end if;
  if p_amount_xof is null or p_amount_xof < 0 then
    raise exception 'AMOUNT_REQUIRED';
  end if;
  if p_duration_days is null or p_duration_days < 1 or p_duration_days > 366 then
    raise exception 'DURATION_INVALID';
  end if;

  -- Empêche un double abonnement actif sur le même plan
  select id into v_existing_active
    from public.subscriptions
   where user_id = v_uid and plan_code = lower(p_plan_code)
     and status = 'active' and (expires_at is null or expires_at > now())
   limit 1;
  if v_existing_active is not null then
    raise exception 'ALREADY_SUBSCRIBED';
  end if;

  -- Référence pour le paiement : sp-sub-<uuid> (routé par cinetpay-webhook
  -- vers activate_subscription une fois le paiement réussi).
  v_reference := 'sp-sub-' || gen_random_uuid()::text;

  insert into public.subscriptions (
    user_id, plan_code, status, amount_xof, provider, provider_ref,
    auto_renew, next_renewal_at
  ) values (
    v_uid, lower(p_plan_code), 'pending', p_amount_xof, 'cinetpay', v_reference,
    true, null
  ) returning id into v_sub_id;

  return jsonb_build_object(
    'subscription_id', v_sub_id,
    'reference', v_reference,
    'amount_xof', p_amount_xof,
    'duration_days', p_duration_days
  );
end;
$$;

revoke execute on function public.subscribe(text, bigint, integer) from public;
grant execute on function public.subscribe(text, bigint, integer) to authenticated;

-- ----------------------------------------------------------------------------
-- 2) RPC activate_subscription — appelée par webhook après paiement OK
--    Idempotente : si déjà active, no-op.
-- ----------------------------------------------------------------------------

create or replace function public.activate_subscription(
  p_reference     text,
  p_duration_days integer default 30
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub subscriptions;
  v_started timestamptz := now();
  v_expires timestamptz;
begin
  select * into v_sub from public.subscriptions where provider_ref = p_reference for update;
  if not found then return 'not_found'; end if;
  if v_sub.status = 'active' then return 'already_active'; end if;
  if v_sub.status = 'cancelled' then return 'cancelled'; end if;

  v_expires := v_started + (p_duration_days || ' days')::interval;
  update public.subscriptions
     set status = 'active',
         started_at = v_started,
         expires_at = v_expires,
         next_renewal_at = v_expires
   where id = v_sub.id;
  return 'activated';
end;
$$;

revoke execute on function public.activate_subscription(text, integer) from public;
grant execute on function public.activate_subscription(text, integer) to service_role;

-- ----------------------------------------------------------------------------
-- 3) RPC cancel_subscription — user-initiated cancel, garde l'expiration
--    en cours (cancelled_at marqué, status reste 'active' jusqu'à expires_at,
--    puis bascule 'expired' via cron — pour Phase 14b).
-- ----------------------------------------------------------------------------

create or replace function public.cancel_subscription(
  p_subscription_id uuid,
  p_reason text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sub subscriptions;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_sub from public.subscriptions where id = p_subscription_id;
  if not found then return 'not_found'; end if;
  if v_sub.user_id <> v_uid and not public.is_admin() then
    raise exception 'NOT_OWNER';
  end if;
  if v_sub.status = 'cancelled' then return 'already_cancelled'; end if;

  update public.subscriptions
     set status = 'cancelled',
         auto_renew = false,
         cancelled_at = now(),
         cancellation_reason = nullif(trim(coalesce(p_reason, '')), '')
   where id = v_sub.id;
  return 'cancelled';
end;
$$;

revoke execute on function public.cancel_subscription(uuid, text) from public;
grant execute on function public.cancel_subscription(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 4) Cashback automatique : trigger sur transactions success
--    Crédite l'user d'un % du montant payé. Le % est lu via monetization_rules
--    (champ cashback_user_pct, 0041). Si pas de règle qui match → pas de
--    cashback (silencieux).
-- ----------------------------------------------------------------------------

create or replace function public.tg_cashback_on_payment_success()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venue_id uuid;
  v_ctx record;
  v_fee jsonb;
  v_cashback_pct numeric;
  v_cashback_xof bigint;
  v_cashback_tx uuid;
begin
  -- Filtre : tx qui devient success, type payment ou split, non-cashback
  if new.status <> 'success' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'success' then return new; end if;
  if new.type not in ('payment', 'split') then return new; end if;
  if new.amount_xof is null or new.amount_xof <= 0 then return new; end if;
  if new.user_id is null then return new; end if;

  -- Récupère le venue (via la résa si présente) pour matcher la règle
  if new.reservation_id is not null then
    select r.venue_id into v_venue_id
      from public.reservations r where r.id = new.reservation_id;
    if v_venue_id is not null then
      select * into v_ctx from public.get_venue_context(v_venue_id);
    end if;
  end if;

  -- Récupère le % cashback de la règle qui match (NULL si rien)
  v_fee := public.compute_fee_amount(
    new.amount_xof, 'payment',
    v_ctx.category, v_ctx.city, v_ctx.commune
  );
  v_cashback_pct := coalesce((v_fee->>'cashback_user_pct')::numeric, 0);
  if v_cashback_pct <= 0 then return new; end if;

  v_cashback_xof := floor(new.amount_xof * v_cashback_pct / 100.0)::bigint;
  if v_cashback_xof <= 0 then return new; end if;

  -- Best-effort : si insert/crédit plante, on ne casse pas la tx initiale
  begin
    insert into public.transactions (
      user_id, type, amount_xof, status, provider, description,
      reservation_id, completed_at, metadata
    ) values (
      new.user_id, 'fee', v_cashback_xof, 'success', 'wallet',
      'Cashback Soutra-Pay (' || v_cashback_pct || '%)',
      new.reservation_id, now(),
      jsonb_build_object(
        'kind', 'cashback',
        'source_tx_id', new.id,
        'source_amount_xof', new.amount_xof,
        'cashback_pct', v_cashback_pct
      )
    ) returning id into v_cashback_tx;

    -- Crédite le wallet
    update public.wallets
       set balance_xof = balance_xof + v_cashback_xof
     where user_id = new.user_id;
  exception when others then
    raise notice 'cashback insert ignored: %', sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists trg_cashback_on_payment_success on public.transactions;
create trigger trg_cashback_on_payment_success
  after insert or update of status on public.transactions
  for each row execute function public.tg_cashback_on_payment_success();

comment on function public.tg_cashback_on_payment_success is
  'Trigger : crédite automatiquement le wallet user d''un % du paiement réussi (taux configurable via monetization_rules.cashback_user_pct, 0041). Best-effort — n''affecte pas la tx source si l''insert cashback plante.';

-- ----------------------------------------------------------------------------
-- 5) Refunds — RPC user request + admin process
-- ----------------------------------------------------------------------------

create or replace function public.request_refund(
  p_transaction_id uuid,
  p_reason         text,
  p_amount_xof     bigint default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_tx transactions;
  v_refund_amount bigint;
  v_refund_id uuid;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'REASON_REQUIRED';
  end if;

  select * into v_tx from public.transactions where id = p_transaction_id;
  if not found then raise exception 'TX_NOT_FOUND'; end if;
  if v_tx.user_id <> v_uid then raise exception 'NOT_OWNER'; end if;
  if v_tx.status <> 'success' then raise exception 'TX_NOT_SUCCESS'; end if;
  if v_tx.type not in ('payment', 'split', 'topup') then
    raise exception 'TX_TYPE_NOT_REFUNDABLE';
  end if;

  -- Empêche un double refund
  if exists (
    select 1 from public.transactions
     where metadata->>'kind' = 'refund_request'
       and (metadata->>'source_tx_id')::uuid = v_tx.id
       and status in ('pending', 'success')
  ) then
    raise exception 'REFUND_ALREADY_REQUESTED';
  end if;

  -- Montant : partiel ou total
  v_refund_amount := coalesce(p_amount_xof, v_tx.amount_xof);
  if v_refund_amount <= 0 or v_refund_amount > v_tx.amount_xof then
    raise exception 'INVALID_REFUND_AMOUNT';
  end if;

  -- Crée la demande en status pending (admin doit approuver ensuite)
  insert into public.transactions (
    user_id, type, amount_xof, status, provider, description, reservation_id,
    metadata
  ) values (
    v_uid, 'refund', v_refund_amount, 'pending', v_tx.provider,
    'Demande de remboursement', v_tx.reservation_id,
    jsonb_build_object(
      'kind', 'refund_request',
      'source_tx_id', v_tx.id,
      'reason', trim(p_reason),
      'requested_at', now()
    )
  ) returning id into v_refund_id;

  return jsonb_build_object(
    'refund_id', v_refund_id,
    'amount_xof', v_refund_amount,
    'status', 'pending'
  );
end;
$$;

revoke execute on function public.request_refund(uuid, text, bigint) from public;
grant execute on function public.request_refund(uuid, text, bigint) to authenticated;

create or replace function public.process_refund(
  p_refund_id  uuid,
  p_approve    boolean,
  p_admin_note text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_refund transactions;
  v_amount bigint;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;

  select * into v_refund from public.transactions
   where id = p_refund_id and type = 'refund'
   for update;
  if not found then return 'not_found'; end if;
  if v_refund.status <> 'pending' then return 'already_processed'; end if;

  v_amount := v_refund.amount_xof;

  if p_approve then
    -- Crédite le wallet user
    update public.wallets
       set balance_xof = balance_xof + v_amount
     where user_id = v_refund.user_id;

    update public.transactions
       set status = 'success',
           completed_at = now(),
           metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
             'processed_at', now(),
             'processed_by', v_uid,
             'admin_note', nullif(trim(coalesce(p_admin_note, '')), '')
           )
     where id = v_refund.id;
    return 'approved';
  else
    update public.transactions
       set status = 'failed',
           completed_at = now(),
           metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
             'rejected_at', now(),
             'rejected_by', v_uid,
             'admin_note', nullif(trim(coalesce(p_admin_note, '')), '')
           )
     where id = v_refund.id;
    return 'rejected';
  end if;
end;
$$;

revoke execute on function public.process_refund(uuid, boolean, text) from public;
grant execute on function public.process_refund(uuid, boolean, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 6) Admin helper : list_recent_fraud_logs (lecture rapide pour UI dashboard)
-- ----------------------------------------------------------------------------

create or replace function public.list_recent_fraud_logs(
  p_limit    integer default 50,
  p_resolved boolean default false
) returns table (
  id              uuid,
  user_id         uuid,
  user_phone      text,
  kind            text,
  severity        text,
  context         jsonb,
  transaction_id  uuid,
  resolved        boolean,
  created_at      timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  return query
    select fl.id, fl.user_id, p.phone,
           fl.kind::text, fl.severity::text, fl.context,
           fl.transaction_id, fl.resolved, fl.created_at
      from public.fraud_logs fl
      left join public.profiles p on p.id = fl.user_id
     where fl.resolved = p_resolved
     order by fl.created_at desc
     limit greatest(1, least(coalesce(p_limit, 50), 500));
end;
$$;

revoke execute on function public.list_recent_fraud_logs(integer, boolean) from public;
grant execute on function public.list_recent_fraud_logs(integer, boolean) to authenticated;

comment on function public.list_recent_fraud_logs is
  'Admin only : liste les fraud_logs récents pour le dashboard de modération.';
