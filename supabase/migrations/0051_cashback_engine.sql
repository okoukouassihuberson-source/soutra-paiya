-- ============================================================================
-- SOUTRA-PAIYA — Migration 0051 : cashback automatique selon plan actif
-- ============================================================================
-- À chaque transaction de paiement marchand confirmée (type='payment',
-- status: pending → success), on calcule le cashback selon le plan actif
-- de l'utilisateur et on crédite son wallet automatiquement.
--
-- Mécanique :
--   1. Lookup du plan actif (status active|trialing, NOT cancel_at_period_end)
--      via subscriptions ; fallback sur 'free' (1 % par défaut)
--   2. Cashback = amount_xof × cashback_bps / 10000
--   3. Si cashback < 1 FCFA, on skip (pas de poussière)
--   4. INSERT d'une nouvelle transaction type='cashback' avec
--      metadata.cashback_for_tx = id de la tx source (anti-doublon)
--   5. UPDATE wallets.balance_xof += cashback
--
-- Idempotent : un UNIQUE INDEX sur metadata.cashback_for_tx empêche
-- l'application multiple du cashback pour la même tx source.
--
-- ⚠️ Pas appliqué sur les flux : topup, withdraw, transfer P2P, escrow,
-- fee, refund, et bien sûr cashback lui-même. Seulement payment.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Ajout de 'cashback' à l'enum tx_type
--    DOIT être la première instruction. Les fonctions plus bas qui castent
--    'cashback'::tx_type ne sont validées qu'à l'exécution (check_function_
--    bodies est false côté Supabase par défaut sur les CREATE FUNCTION SQL).
-- ----------------------------------------------------------------------------

alter type tx_type add value if not exists 'cashback';

-- ----------------------------------------------------------------------------
-- 2) Index unique : empêche le double crédit pour une même tx source
-- ----------------------------------------------------------------------------

-- L'index est partiel sur les rows qui ont metadata->>'cashback_for_tx',
-- ce qui le rend non-bloquant pour les autres types de tx.
create unique index if not exists uq_transactions_cashback_for_tx
  on public.transactions ((metadata->>'cashback_for_tx'))
  where (metadata->>'cashback_for_tx') is not null;

-- Helper : index sur le type pour le scan rapide cashback_stats
create index if not exists idx_transactions_user_type_date
  on public.transactions (user_id, type, created_at desc);

-- ----------------------------------------------------------------------------
-- 3) RPC : calcule + crédite le cashback pour une transaction donnée
--    Idempotente. Utilisée par le trigger ET disponible pour backfill admin.
-- ----------------------------------------------------------------------------

create or replace function public.apply_cashback_for_tx(p_tx_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx          record;
  v_plan_code   subscription_plan_code;
  v_cashback_bps integer;
  v_cashback    bigint;
  v_existing_id uuid;
  v_new_tx_id   uuid;
begin
  -- Lock + lecture de la tx source.
  select id, user_id, type, amount_xof, status, metadata
    into v_tx
    from public.transactions
   where id = p_tx_id
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'TX_NOT_FOUND');
  end if;

  -- Filtres : seulement les paiements marchand confirmés.
  if v_tx.status <> 'success' then
    return jsonb_build_object('ok', false, 'reason', 'TX_NOT_SUCCESS');
  end if;
  if v_tx.type <> 'payment' then
    return jsonb_build_object('ok', false, 'reason', 'TX_NOT_PAYMENT');
  end if;
  -- Ne pas auto-cashback sur les paiements d'abonnement (sinon boucle
  -- absurde : tu paies 5000 pour Pro et tu récupères 100 FCFA cashback).
  if v_tx.metadata->>'purpose' = 'subscription' then
    return jsonb_build_object('ok', false, 'reason', 'TX_IS_SUBSCRIPTION');
  end if;
  -- Ne pas cashback un montant nul.
  if v_tx.amount_xof <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'TX_AMOUNT_ZERO');
  end if;

  -- Anti-doublon : si une tx cashback existe déjà pour cette tx source.
  select id into v_existing_id
    from public.transactions
   where metadata->>'cashback_for_tx' = p_tx_id::text
   limit 1;
  if v_existing_id is not null then
    return jsonb_build_object(
      'ok', false,
      'reason', 'ALREADY_APPLIED',
      'cashback_tx_id', v_existing_id
    );
  end if;

  -- Lookup du plan actif du user (annulation programmée comptée comme actif
  -- jusqu'à la fin de la période — c'est ce que l'user a payé).
  select s.plan_code into v_plan_code
    from public.subscriptions s
   where s.user_id = v_tx.user_id
     and s.status in ('active', 'trialing')
   order by s.created_at desc
   limit 1;
  if v_plan_code is null then
    v_plan_code := 'free';
  end if;

  -- Lookup du taux cashback du plan.
  select cashback_bps into v_cashback_bps
    from public.subscription_plans
   where code = v_plan_code
   limit 1;
  if v_cashback_bps is null then
    v_cashback_bps := 100; -- défaut free = 1 %
  end if;

  -- Calcul. bps = basis points : 100 = 1 %, 200 = 2 %, etc.
  v_cashback := (v_tx.amount_xof * v_cashback_bps) / 10000;
  if v_cashback < 1 then
    -- Pas de poussière : on n'insert pas un cashback de 0 FCFA (CHECK
    -- amount > 0 sur transactions le refuserait de toute façon).
    return jsonb_build_object(
      'ok', false,
      'reason', 'AMOUNT_TOO_SMALL',
      'computed', v_cashback
    );
  end if;

  -- INSERT de la transaction cashback (atomique avec le crédit wallet).
  insert into public.transactions (
    user_id, type, amount_xof, status, provider,
    description, metadata, completed_at
  ) values (
    v_tx.user_id, 'cashback', v_cashback, 'success', 'wallet',
    'Cashback ' || (v_cashback_bps / 100.0)::text || ' % — plan ' || v_plan_code::text,
    jsonb_build_object(
      'cashback_for_tx', p_tx_id::text,
      'source_amount_xof', v_tx.amount_xof,
      'plan_code', v_plan_code::text,
      'cashback_bps', v_cashback_bps
    ),
    now()
  )
  returning id into v_new_tx_id;

  -- Crédit wallet (atomique, RLS bypassée par SECURITY DEFINER).
  update public.wallets
     set balance_xof = balance_xof + v_cashback
   where user_id = v_tx.user_id;

  return jsonb_build_object(
    'ok', true,
    'cashback_tx_id', v_new_tx_id,
    'amount_xof', v_cashback,
    'plan_code', v_plan_code::text,
    'cashback_bps', v_cashback_bps
  );
end;
$$;

revoke execute on function public.apply_cashback_for_tx(uuid) from public;
grant execute on function public.apply_cashback_for_tx(uuid) to service_role;

-- ----------------------------------------------------------------------------
-- 4) Trigger AFTER UPDATE transactions : déclenche le cashback automatiquement
--    Fires only on status pending → success pour type=payment.
-- ----------------------------------------------------------------------------

create or replace function public.tg_transactions_apply_cashback()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Filtre rapide pour éviter l'overhead sur tous les UPDATE.
  if new.type <> 'payment' then return new; end if;
  if new.status <> 'success' then return new; end if;
  if old.status = 'success' then return new; end if; -- déjà traité
  -- Exclut explicitement les paiements d'abonnement (la RPC le refait, mais
  -- on évite l'appel inutile).
  if new.metadata->>'purpose' = 'subscription' then return new; end if;

  -- Appel asynchrone idéalement, mais on garde synchrone pour la simplicité :
  -- le cashback est généralement < 5 ms à calculer + 1 INSERT + 1 UPDATE.
  perform public.apply_cashback_for_tx(new.id);
  return new;
end;
$$;

drop trigger if exists trg_transactions_apply_cashback on public.transactions;
create trigger trg_transactions_apply_cashback
  after update of status on public.transactions
  for each row execute function public.tg_transactions_apply_cashback();

-- ----------------------------------------------------------------------------
-- 5) RPC user-facing : statistiques de cashback du user courant
--    Affichée dans /account et /subscribe pour la motivation.
-- ----------------------------------------------------------------------------

create or replace function public.get_my_cashback_stats(p_window_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_window  integer := greatest(1, least(coalesce(p_window_days, 30), 365));
  v_since   timestamptz := now() - (v_window || ' days')::interval;
  v_total   bigint;
  v_period  bigint;
  v_count   integer;
  v_avg     numeric;
  v_plan    record;
  v_lastest record;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'NOT_AUTHENTICATED');
  end if;

  -- Total all-time
  select coalesce(sum(amount_xof), 0)::bigint
    into v_total
    from public.transactions
   where user_id = v_uid
     and type = 'cashback'
     and status = 'success';

  -- Cashback sur la fenêtre
  select coalesce(sum(amount_xof), 0)::bigint, count(*),
         coalesce(avg(amount_xof), 0)
    into v_period, v_count, v_avg
    from public.transactions
   where user_id = v_uid
     and type = 'cashback'
     and status = 'success'
     and created_at >= v_since;

  -- Plan actif courant (pour afficher "Tu gagnes X % à chaque dépense")
  select sp.code::text as code, sp.display_name, sp.cashback_bps
    into v_plan
    from public.subscriptions s
    join public.subscription_plans sp on sp.code = s.plan_code
   where s.user_id = v_uid
     and s.status in ('active', 'trialing')
   order by s.created_at desc
   limit 1;

  if v_plan.code is null then
    select 'free'::text as code, sp.display_name, sp.cashback_bps
      into v_plan
      from public.subscription_plans sp
     where sp.code = 'free';
  end if;

  -- Dernière transaction cashback (pour afficher "Dernier cashback : il y a 2h")
  select amount_xof, created_at, metadata
    into v_lastest
    from public.transactions
   where user_id = v_uid
     and type = 'cashback'
     and status = 'success'
   order by created_at desc
   limit 1;

  return jsonb_build_object(
    'ok', true,
    'window_days', v_window,
    'total_all_time_xof', v_total,
    'period_xof', v_period,
    'period_count', v_count,
    'avg_per_tx_xof', round(v_avg, 0),
    'current_plan', jsonb_build_object(
      'code', v_plan.code,
      'display_name', v_plan.display_name,
      'cashback_bps', v_plan.cashback_bps
    ),
    'latest', case
      when v_lastest.amount_xof is null then null
      else jsonb_build_object(
        'amount_xof', v_lastest.amount_xof,
        'created_at', v_lastest.created_at,
        'source_amount_xof', v_lastest.metadata->>'source_amount_xof'
      )
    end
  );
end;
$$;

grant execute on function public.get_my_cashback_stats(integer) to authenticated;

-- ----------------------------------------------------------------------------
-- 6) RPC admin : stats globales cashback (pour dashboard analytics futur)
-- ----------------------------------------------------------------------------

create or replace function public.admin_cashback_stats(p_window_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_window integer := greatest(1, least(coalesce(p_window_days, 30), 365));
  v_since  timestamptz := now() - (v_window || ' days')::interval;
begin
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED';
  end if;

  return jsonb_build_object(
    'window_days', v_window,
    'total_paid_out_xof', (
      select coalesce(sum(amount_xof), 0)::bigint
        from public.transactions
       where type = 'cashback' and status = 'success'
         and created_at >= v_since
    ),
    'count_paid_out', (
      select count(*)
        from public.transactions
       where type = 'cashback' and status = 'success'
         and created_at >= v_since
    ),
    'unique_users', (
      select count(distinct user_id)
        from public.transactions
       where type = 'cashback' and status = 'success'
         and created_at >= v_since
    ),
    'by_plan', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'plan_code', plan_code,
        'paid_out_xof', total,
        'count', cnt
      )), '[]'::jsonb)
      from (
        select
          metadata->>'plan_code' as plan_code,
          sum(amount_xof)::bigint as total,
          count(*) as cnt
        from public.transactions
        where type = 'cashback' and status = 'success'
          and created_at >= v_since
        group by metadata->>'plan_code'
        order by sum(amount_xof) desc
      ) sub
    )
  );
end;
$$;

revoke execute on function public.admin_cashback_stats(integer) from public;
grant execute on function public.admin_cashback_stats(integer) to authenticated;

-- ----------------------------------------------------------------------------
-- 7) Commentaires
-- ----------------------------------------------------------------------------

comment on function public.apply_cashback_for_tx is
  'Calcule et crédite le cashback pour une tx payment confirmée. Idempotent via metadata.cashback_for_tx + uq_transactions_cashback_for_tx. Skip si tx subscription, montant nul, ou cashback < 1 FCFA.';
comment on function public.get_my_cashback_stats is
  'Stats cashback du user courant : total all-time, sur la fenêtre, plan actif, dernière tx.';
comment on function public.admin_cashback_stats is
  'Stats globales cashback pour le dashboard admin : total payé, par plan, unique users.';
