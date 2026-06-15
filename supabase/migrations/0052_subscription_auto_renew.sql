-- ============================================================================
-- SOUTRA-PAIYA — Migration 0052 : auto-renouvellement Paystack des abonnements
-- ============================================================================
-- Permet aux utilisateurs abonnés par CARTE d'être prélevés automatiquement
-- à chaque échéance (via Paystack /transaction/charge_authorization). Le
-- mobile money n'est pas supporté par l'API recurring de Paystack en Côte
-- d'Ivoire : les utilisateurs mobile money continuent à recevoir des rappels
-- J-7 / J-1 et doivent re-payer manuellement.
--
-- Architecture :
--   1. Colonnes ajoutées à subscriptions : auto_renew, last_authorization_code,
--      last_card_brand, last_card_last4, last_renew_attempt_at,
--      last_renew_outcome.
--   2. Trigger ALTER paystack_settle_charge pour extraire l'authorization
--      depuis metadata.paystack_authorization (passée par paystack-verify
--      après vérification) et la stocker sur la subscription.
--   3. RPC list_subscriptions_to_renew(p_horizon_hours) : liste les subs
--      dont current_period_end est dans les X prochaines heures, auto_renew
--      = true, status active|past_due, plan != free, authorization_code
--      présent → utilisée par l'Edge Function paystack-renew-subscriptions.
--   4. RPC renew_subscription_success(p_sub_id, p_paid_amount, p_paystack_ref)
--      → étend current_period_end de 30/365 jours selon billing_period, log
--      transaction cashback (oui : un renew est un payment), reset past_due.
--   5. RPC renew_subscription_failed(p_sub_id, p_reason) → status='past_due',
--      log event subscribe_failed (déclenche notif via Database Webhook).
--   6. RPC set_auto_renew(p_sub_id, p_value) : appelable par l'user pour
--      activer/désactiver son auto-renouvellement.
--   7. pg_cron daily 08:00 UTC qui invoque paystack-renew-subscriptions.
--
-- Non-cassant : auto_renew default = true pour ne pas surprendre, mais peut
-- être désactivé via UI. Les subs existantes prennent la valeur par défaut.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Colonnes ajoutées à subscriptions
-- ----------------------------------------------------------------------------

alter table public.subscriptions
  add column if not exists auto_renew boolean not null default true;

alter table public.subscriptions
  add column if not exists last_authorization_code text;

alter table public.subscriptions
  add column if not exists last_card_brand text;        -- 'visa', 'mastercard', 'verve'…

alter table public.subscriptions
  add column if not exists last_card_last4 text;        -- '4081'

alter table public.subscriptions
  add column if not exists last_card_exp_month text;    -- '03'

alter table public.subscriptions
  add column if not exists last_card_exp_year text;     -- '2028'

alter table public.subscriptions
  add column if not exists last_renew_attempt_at timestamptz;

alter table public.subscriptions
  add column if not exists last_renew_outcome text;     -- 'success' | 'failed' | reason

-- Index pour le scan du cron (rapide même avec beaucoup de subs).
create index if not exists idx_subscriptions_renew_scan
  on public.subscriptions(current_period_end)
  where status in ('active', 'past_due')
    and auto_renew = true
    and plan_code <> 'free';

-- ----------------------------------------------------------------------------
-- 1bis) RPC set_transaction_paystack_authorization
--    Appelée par paystack-verify pour patcher metadata.paystack_authorization
--    sur la transaction. Le trigger ci-dessous (tg_subscriptions_capture_
--    authorization) lit cette metadata pour propager l'authorization à la
--    subscription nouvellement créée.
-- ----------------------------------------------------------------------------

create or replace function public.set_transaction_paystack_authorization(
  p_reference     text,
  p_authorization jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx_id uuid;
begin
  update public.transactions
     set metadata = coalesce(metadata, '{}'::jsonb)
                    || jsonb_build_object('paystack_authorization', p_authorization)
   where provider_ref = p_reference
   returning id into v_tx_id;

  if v_tx_id is null then
    return jsonb_build_object('ok', false, 'reason', 'TX_NOT_FOUND');
  end if;
  return jsonb_build_object('ok', true, 'tx_id', v_tx_id);
end;
$$;

revoke execute on function public.set_transaction_paystack_authorization(text, jsonb) from public;
grant execute on function public.set_transaction_paystack_authorization(text, jsonb) to service_role;

-- ----------------------------------------------------------------------------
-- 2) Capture de l'authorization Paystack au moment du paiement initial
--    On étend paystack_settle_charge pour extraire metadata.paystack_authorization
--    (ajoutée par paystack-verify après l'appel /transaction/verify) et la
--    propager sur la subscription. Anti-régression : si la metadata n'existe
--    pas, on ne touche rien.
--
--    NOTE : on ne ré-écrit pas tout paystack_settle_charge. On ajoute juste
--    un trigger AFTER UPDATE sur subscriptions qui se déclenche quand une
--    nouvelle subscription est créée par paystack_settle_subscription, et qui
--    cherche l'authorization dans la transaction liée.
-- ----------------------------------------------------------------------------

create or replace function public.tg_subscriptions_capture_authorization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx record;
  v_auth jsonb;
begin
  -- On agit uniquement à la création d'une sub liée à une tx Paystack
  -- (payment_provider='paystack' et payment_ref défini).
  if new.payment_provider <> 'paystack' or new.payment_ref is null then
    return new;
  end if;

  -- Lookup de la transaction Paystack pour extraire l'authorization.
  select metadata into v_tx
    from public.transactions
   where provider_ref = new.payment_ref
   limit 1;
  if v_tx.metadata is null then
    return new;
  end if;

  v_auth := v_tx.metadata->'paystack_authorization';
  if v_auth is null or v_auth = 'null'::jsonb then
    return new;
  end if;

  -- Mise à jour des colonnes d'autorisation. Reusable=true côté Paystack
  -- garanti par leur API si la carte est tokenisable.
  update public.subscriptions
     set last_authorization_code = coalesce(v_auth->>'authorization_code', last_authorization_code),
         last_card_brand         = coalesce(v_auth->>'brand',               last_card_brand),
         last_card_last4         = coalesce(v_auth->>'last4',               last_card_last4),
         last_card_exp_month     = coalesce(v_auth->>'exp_month',           last_card_exp_month),
         last_card_exp_year      = coalesce(v_auth->>'exp_year',            last_card_exp_year)
   where id = new.id;

  return new;
end;
$$;

drop trigger if exists trg_subscriptions_capture_authorization on public.subscriptions;
create trigger trg_subscriptions_capture_authorization
  after insert on public.subscriptions
  for each row execute function public.tg_subscriptions_capture_authorization();

-- ----------------------------------------------------------------------------
-- 3) RPC : liste des subs à renouveler (scan cron)
--    Renvoie les subs qui expirent dans les `p_horizon_hours` prochaines
--    heures, auto_renew = true, avec une authorization présente.
-- ----------------------------------------------------------------------------

create or replace function public.list_subscriptions_to_renew(
  p_horizon_hours integer default 24
) returns table (
  subscription_id      uuid,
  user_id              uuid,
  plan_code            subscription_plan_code,
  billing_period       subscription_billing_period,
  current_period_end   timestamptz,
  authorization_code   text,
  amount_xof           bigint,
  card_brand           text,
  card_last4           text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id as subscription_id,
    s.user_id,
    s.plan_code,
    s.billing_period,
    s.current_period_end,
    s.last_authorization_code as authorization_code,
    case
      when s.billing_period = 'monthly' then p.price_monthly_xof
      else p.price_yearly_xof
    end as amount_xof,
    s.last_card_brand,
    s.last_card_last4
  from public.subscriptions s
  join public.subscription_plans p on p.code = s.plan_code
  where s.status in ('active', 'past_due')
    and s.auto_renew = true
    and s.plan_code <> 'free'
    and s.cancel_at_period_end = false
    and s.last_authorization_code is not null
    and s.current_period_end <= now() + (p_horizon_hours || ' hours')::interval
    -- Anti-spam : si on a déjà tenté un renouvellement avec succès dans
    -- les 24 dernières heures, on n'y retouche pas (le cron tourne daily,
    -- ça n'arrive pas, mais protection au cas où).
    and (s.last_renew_attempt_at is null
         or s.last_renew_attempt_at < now() - interval '12 hours');
$$;

grant execute on function public.list_subscriptions_to_renew(integer) to service_role;

-- ----------------------------------------------------------------------------
-- 4) RPC : succès du renouvellement
--    Étend current_period_end de 30/365 jours, marque la sub active,
--    log la transaction Paystack confirmée.
-- ----------------------------------------------------------------------------

create or replace function public.renew_subscription_success(
  p_subscription_id uuid,
  p_paid_amount_xof bigint,
  p_paystack_ref    text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub  record;
  v_new_end timestamptz;
  v_tx_id   uuid;
begin
  select * into v_sub from public.subscriptions
   where id = p_subscription_id
   limit 1;
  if v_sub.id is null then
    raise exception 'SUB_NOT_FOUND';
  end if;

  -- Extension de la période : +30 jours (monthly) ou +365 jours (yearly),
  -- à partir de l'ancienne fin pour ne pas perdre du temps payé en cas
  -- de retard de cron.
  v_new_end := case
    when v_sub.billing_period = 'monthly' then greatest(v_sub.current_period_end, now()) + interval '30 days'
    else greatest(v_sub.current_period_end, now()) + interval '365 days'
  end;

  -- Création de la transaction Paystack côté DB (pour l'historique et le
  -- dashboard analytics). Note : pas de cashback dessus (purpose=subscription
  -- court-circuite le trigger cashback de la 0051).
  insert into public.transactions (
    user_id, type, amount_xof, status, provider, provider_ref,
    description, metadata, completed_at
  ) values (
    v_sub.user_id, 'payment', p_paid_amount_xof, 'success', 'paystack', p_paystack_ref,
    'Renouvellement automatique abonnement ' || v_sub.plan_code::text,
    jsonb_build_object(
      'purpose', 'subscription',
      'plan_code', v_sub.plan_code::text,
      'billing_period', v_sub.billing_period::text,
      'subscription_id', p_subscription_id,
      'renewal', true
    ),
    now()
  )
  returning id into v_tx_id;

  -- Mise à jour de la subscription.
  update public.subscriptions
     set current_period_start = greatest(current_period_end, now()),
         current_period_end   = v_new_end,
         status               = 'active',
         payment_ref          = p_paystack_ref,
         last_renew_attempt_at = now(),
         last_renew_outcome   = 'success',
         updated_at           = now()
   where id = p_subscription_id;

  -- Log analytics.
  insert into public.subscription_events (user_id, kind, plan_code, metadata)
  values (
    v_sub.user_id, 'subscribe_success', v_sub.plan_code,
    jsonb_build_object(
      'billing_period', v_sub.billing_period::text,
      'subscription_id', p_subscription_id,
      'provider', 'paystack',
      'amount_xof', p_paid_amount_xof,
      'renewal', true,
      'tx_id', v_tx_id
    )
  );

  return jsonb_build_object(
    'ok', true,
    'tx_id', v_tx_id,
    'new_period_end', v_new_end
  );
end;
$$;

grant execute on function public.renew_subscription_success(uuid, bigint, text) to service_role;

-- ----------------------------------------------------------------------------
-- 5) RPC : échec du renouvellement
--    Marque la sub past_due, log un event subscribe_failed.
-- ----------------------------------------------------------------------------

create or replace function public.renew_subscription_failed(
  p_subscription_id uuid,
  p_reason          text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub record;
begin
  select * into v_sub from public.subscriptions
   where id = p_subscription_id
   limit 1;
  if v_sub.id is null then
    raise exception 'SUB_NOT_FOUND';
  end if;

  update public.subscriptions
     set status               = 'past_due',
         last_renew_attempt_at = now(),
         last_renew_outcome   = nullif(trim(coalesce(p_reason, '')), ''),
         updated_at           = now()
   where id = p_subscription_id;

  insert into public.subscription_events (user_id, kind, plan_code, metadata)
  values (
    v_sub.user_id, 'subscribe_attempt', v_sub.plan_code,
    jsonb_build_object(
      'subscription_id', p_subscription_id,
      'provider', 'paystack',
      'renewal', true,
      'outcome', 'failed',
      'reason', p_reason
    )
  );

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.renew_subscription_failed(uuid, text) to service_role;

-- ----------------------------------------------------------------------------
-- 6) RPC user-facing : toggle auto_renew
--    L'user peut activer/désactiver son auto-renouvellement depuis /account.
--    Strict RLS : on ne peut modifier que sa propre sub.
-- ----------------------------------------------------------------------------

create or replace function public.set_auto_renew(
  p_subscription_id uuid,
  p_value           boolean
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sub record;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select id, user_id, status into v_sub
    from public.subscriptions
   where id = p_subscription_id
   limit 1;
  if v_sub.id is null then
    raise exception 'SUB_NOT_FOUND';
  end if;
  if v_sub.user_id <> v_uid then
    raise exception 'NOT_OWNER';
  end if;

  update public.subscriptions
     set auto_renew = p_value,
         updated_at = now()
   where id = p_subscription_id;

  return jsonb_build_object('ok', true, 'auto_renew', p_value);
end;
$$;

revoke execute on function public.set_auto_renew(uuid, boolean) from public;
grant execute on function public.set_auto_renew(uuid, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- 7) Étendre get_my_subscription pour retourner les nouvelles colonnes
--    (auto_renew, last_card_brand, last_card_last4) — utiles à l'UI /account.
-- ----------------------------------------------------------------------------

create or replace function public.get_my_subscription()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_sub    record;
  v_plan   record;
begin
  if v_uid is null then
    return jsonb_build_object('subscription', null, 'plan', null);
  end if;

  select s.* into v_sub
    from public.subscriptions s
   where s.user_id = v_uid
     and s.status in ('active', 'trialing', 'past_due')
   order by s.created_at desc
   limit 1;

  if v_sub.id is null then
    select * into v_plan from public.subscription_plans where code = 'free' limit 1;
    return jsonb_build_object(
      'subscription', null,
      'plan', to_jsonb(v_plan)
    );
  end if;

  select * into v_plan from public.subscription_plans where code = v_sub.plan_code limit 1;

  -- to_jsonb sur le record SQL inclut automatiquement TOUTES les colonnes,
  -- y compris les nouvelles (auto_renew, last_card_*, etc.).
  return jsonb_build_object(
    'subscription', to_jsonb(v_sub),
    'plan', to_jsonb(v_plan)
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 8) pg_cron : daily 08:00 UTC → paystack-renew-subscriptions
--    Schedule unique. Si pg_cron/pg_net pas dispos, fallback silencieux
--    et le user devra configurer un cron externe.
-- ----------------------------------------------------------------------------

do $$
declare
  v_cron_available boolean := false;
  v_net_available  boolean := false;
begin
  begin
    create extension if not exists pg_cron;
    v_cron_available := true;
  exception when others then
    raise notice 'pg_cron non disponible : %', sqlerrm;
  end;

  begin
    create extension if not exists pg_net;
    v_net_available := true;
  exception when others then
    raise notice 'pg_net non disponible : %', sqlerrm;
  end;

  if v_cron_available and v_net_available then
    begin
      perform cron.unschedule('soutra_paystack_renew_daily');
    exception when others then null;
    end;

    perform cron.schedule(
      'soutra_paystack_renew_daily',
      '0 8 * * *',
      $cmd$
      select net.http_post(
        url := 'https://pjtmmzxcitbcwbbgtpdj.supabase.co/functions/v1/paystack-renew-subscriptions',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        ),
        body := '{}'::jsonb
      ) as request_id;
      $cmd$
    );
    raise notice 'Cron job soutra_paystack_renew_daily programmé à 08:00 UTC';
  else
    raise notice 'pg_cron ou pg_net manquant : configurer un cron externe pour paystack-renew-subscriptions';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 9) Commentaires
-- ----------------------------------------------------------------------------

comment on column public.subscriptions.auto_renew is
  'Prélèvement automatique à l''échéance. Default true. Désactivable par l''user via set_auto_renew.';
comment on column public.subscriptions.last_authorization_code is
  'Code Paystack tokenisant la carte, utilisable pour charge_authorization. Mobile money = NULL.';
comment on function public.list_subscriptions_to_renew is
  'Scan des subs à renouveler dans les prochaines p_horizon_hours. Appelée par paystack-renew-subscriptions (cron daily).';
comment on function public.renew_subscription_success is
  'Étend la période + log la transaction. Appelée par paystack-renew-subscriptions après charge_authorization success.';
comment on function public.set_auto_renew is
  'User toggle l''auto-renouvellement depuis /account. RLS : owner uniquement.';
