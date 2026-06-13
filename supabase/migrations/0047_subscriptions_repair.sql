-- ============================================================================
-- SOUTRA-PAIYA — Migration 0047 : réparation de 0046 (enum subscription_status)
-- ============================================================================
-- La migration 0046 a échoué à la ligne 222 ("invalid input value for enum
-- subscription_status: 'trialing'") parce que l'enum existait déjà sans la
-- valeur 'trialing'. Le bloc DO ... exception when duplicate_object swallow
-- silencieusement le CREATE TYPE redondant, laissant l'enum partiellement
-- défini.
--
-- Cette migration nettoie tout (DROP CASCADE) puis recrée l'ensemble du
-- schéma subscriptions à zéro. Idempotente : peut être rejouée sans risque.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) DROP cascade : tables → fonctions → types
-- ----------------------------------------------------------------------------

drop table if exists public.subscription_events cascade;
drop table if exists public.subscriptions cascade;
drop table if exists public.subscription_plans cascade;

drop function if exists public.track_subscription_event(text, text, jsonb, text) cascade;
drop function if exists public.get_my_subscription() cascade;
drop function if exists public.subscribe_to_plan_stub(text, text) cascade;
drop function if exists public.cancel_my_subscription(boolean) cascade;
drop function if exists public.tg_subscription_plans_set_updated_at() cascade;
drop function if exists public.tg_subscriptions_set_updated_at() cascade;

drop type if exists subscription_event_kind cascade;
drop type if exists subscription_billing_period cascade;
drop type if exists subscription_status cascade;
drop type if exists subscription_plan_code cascade;

-- ----------------------------------------------------------------------------
-- 2) CREATE TYPE — direct, sans bloc DO (plus simple et explicite)
-- ----------------------------------------------------------------------------

create type subscription_plan_code as enum (
  'free', 'standard', 'pro', 'premium', 'soutra_premium'
);

create type subscription_status as enum (
  'active', 'trialing', 'past_due', 'cancelled', 'expired'
);

create type subscription_billing_period as enum ('monthly', 'yearly');

create type subscription_event_kind as enum (
  'plan_view', 'plan_click', 'subscribe_attempt',
  'subscribe_success', 'subscribe_abandon',
  'plan_change', 'cancel'
);

-- ----------------------------------------------------------------------------
-- 3) Table subscription_plans
-- ----------------------------------------------------------------------------

create table public.subscription_plans (
  code              subscription_plan_code primary key,
  display_name      text not null,
  tagline           text,
  price_monthly_xof bigint not null check (price_monthly_xof >= 0),
  price_yearly_xof  bigint not null check (price_yearly_xof  >= 0),
  cashback_bps      integer not null check (cashback_bps between 0 and 10000),
  display_order     integer not null default 0,
  is_recommended    boolean not null default false,
  is_prestige       boolean not null default false,
  features          jsonb not null default '[]'::jsonb,
  cta_label         text not null,
  accent_color      text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create function public.tg_subscription_plans_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

create trigger trg_subscription_plans_updated_at
  before update on public.subscription_plans
  for each row execute function public.tg_subscription_plans_set_updated_at();

alter table public.subscription_plans enable row level security;

create policy "subscription_plans_select_public" on public.subscription_plans
  for select to anon, authenticated using (true);

create policy "subscription_plans_admin_all" on public.subscription_plans
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Seed des 5 plans
insert into public.subscription_plans (
  code, display_name, tagline,
  price_monthly_xof, price_yearly_xof, cashback_bps,
  display_order, is_recommended, is_prestige,
  features, cta_label, accent_color
) values
  (
    'free', 'Free', 'Découvre Soutra-Playce',
    0, 0, 100, 0, false, false,
    jsonb_build_array(
      'Accès aux fonctionnalités essentielles',
      'Paiement sécurisé',
      'Cashback 1 %',
      'Découverte de l''écosystème Soutra-Playce'
    ),
    'Commencer gratuitement', 'neutral'
  ),
  (
    'standard', 'Standard', 'Pour profiter au quotidien',
    2000, 20000, 100, 1, false, false,
    jsonb_build_array(
      'Tous les avantages Free',
      'Notifications prioritaires',
      'Alertes personnalisées',
      'Offres promotionnelles exclusives'
    ),
    'Passer au Standard', 'orange'
  ),
  (
    'pro', 'Pro', 'Meilleur rapport qualité/prix',
    5000, 50000, 200, 2, true, false,
    jsonb_build_array(
      'Tous les avantages Standard',
      'Cashback augmenté à 2 %',
      'Suppression complète de la publicité',
      'Concierge IA Sia illimité',
      'Support prioritaire'
    ),
    'Choisir Pro', 'blue-purple'
  ),
  (
    'premium', 'Premium', 'Expérience VVIP',
    15000, 150000, 300, 3, false, false,
    jsonb_build_array(
      'Tous les avantages Pro',
      'Accès VVIP',
      'Réservations prioritaires',
      'Événements exclusifs',
      'Voix Premium Sia',
      'Réductions partenaires Premium'
    ),
    'Devenir Premium', 'purple-gold'
  ),
  (
    'soutra_premium', 'Soutra Premium', 'L''élite Soutra-Playce',
    30000, 300000, 500, 4, false, true,
    jsonb_build_array(
      'Tous les avantages Premium',
      'Cashback maximal de 5 %',
      'Concierge humain dédié',
      'Invitations privées',
      'Expériences exclusives',
      'Service ultra-prioritaire',
      'Statut Elite Soutra-Playce'
    ),
    'Accéder à l''élite', 'black-gold'
  );

-- ----------------------------------------------------------------------------
-- 4) Table subscriptions
-- ----------------------------------------------------------------------------

create table public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references public.profiles(id) on delete cascade,
  plan_code              subscription_plan_code not null references public.subscription_plans(code),
  status                 subscription_status not null default 'active',
  billing_period         subscription_billing_period not null default 'monthly',
  current_period_start   timestamptz not null default now(),
  current_period_end     timestamptz not null,
  cancel_at_period_end   boolean not null default false,
  payment_provider       payment_provider,
  payment_ref            text,
  metadata               jsonb not null default '{}'::jsonb,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create unique index uq_subscriptions_active_per_user
  on public.subscriptions(user_id)
  where status in ('active', 'trialing', 'past_due');

create index idx_subscriptions_user_created
  on public.subscriptions(user_id, created_at desc);

create index idx_subscriptions_status
  on public.subscriptions(status);

create function public.tg_subscriptions_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

create trigger trg_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.tg_subscriptions_set_updated_at();

alter table public.subscriptions enable row level security;

create policy "subscriptions_select_self" on public.subscriptions
  for select to authenticated using (user_id = auth.uid());

create policy "subscriptions_select_admin" on public.subscriptions
  for select to authenticated using (public.is_admin());

create policy "subscriptions_insert_self" on public.subscriptions
  for insert to authenticated with check (user_id = auth.uid());

create policy "subscriptions_update_self" on public.subscriptions
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 5) Table subscription_events
-- ----------------------------------------------------------------------------

create table public.subscription_events (
  id            bigserial primary key,
  user_id       uuid references public.profiles(id) on delete set null,
  session_id    text,
  kind          subscription_event_kind not null,
  plan_code     subscription_plan_code,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index idx_subscription_events_kind_date
  on public.subscription_events(kind, created_at desc);

create index idx_subscription_events_plan_date
  on public.subscription_events(plan_code, created_at desc) where plan_code is not null;

create index idx_subscription_events_user_date
  on public.subscription_events(user_id, created_at desc) where user_id is not null;

alter table public.subscription_events enable row level security;

create policy "subscription_events_select_admin" on public.subscription_events
  for select to authenticated using (public.is_admin());

create policy "subscription_events_insert_self" on public.subscription_events
  for insert to authenticated with check (user_id is null or user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 6) RPCs
-- ----------------------------------------------------------------------------

-- 6.1) track_subscription_event
create function public.track_subscription_event(
  p_kind       text,
  p_plan_code  text default null,
  p_metadata   jsonb default '{}'::jsonb,
  p_session_id text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind subscription_event_kind;
  v_plan subscription_plan_code;
  v_id   bigint;
begin
  begin
    v_kind := p_kind::subscription_event_kind;
  exception when others then
    raise exception 'INVALID_KIND';
  end;

  if p_plan_code is not null and p_plan_code <> '' then
    begin
      v_plan := p_plan_code::subscription_plan_code;
    exception when others then
      raise exception 'INVALID_PLAN';
    end;
  end if;

  insert into public.subscription_events (user_id, session_id, kind, plan_code, metadata)
  values (
    auth.uid(),
    nullif(trim(coalesce(p_session_id, '')), ''),
    v_kind,
    v_plan,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'event_id', v_id);
end;
$$;

revoke execute on function public.track_subscription_event(text, text, jsonb, text) from public;
grant execute on function public.track_subscription_event(text, text, jsonb, text) to anon, authenticated;

-- 6.2) get_my_subscription
create function public.get_my_subscription()
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

  return jsonb_build_object(
    'subscription', to_jsonb(v_sub),
    'plan', to_jsonb(v_plan)
  );
end;
$$;

grant execute on function public.get_my_subscription() to authenticated;

-- 6.3) subscribe_to_plan_stub
create function public.subscribe_to_plan_stub(
  p_plan_code      text,
  p_billing_period text default 'monthly'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_plan   record;
  v_period subscription_billing_period;
  v_end    timestamptz;
  v_id     uuid;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

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

  v_end := case
    when v_period = 'monthly' then now() + interval '30 days'
    else now() + interval '365 days'
  end;

  update public.subscriptions
     set status = 'cancelled',
         cancel_at_period_end = true,
         updated_at = now()
   where user_id = v_uid
     and status in ('active', 'trialing', 'past_due');

  insert into public.subscriptions (
    user_id, plan_code, status, billing_period,
    current_period_start, current_period_end,
    metadata
  )
  values (
    v_uid, v_plan.code, 'active', v_period,
    now(), v_end,
    jsonb_build_object('source', 'stub', 'note', 'MVP : paiement non branché')
  )
  returning id into v_id;

  insert into public.subscription_events (user_id, kind, plan_code, metadata)
  values (
    v_uid, 'subscribe_success', v_plan.code,
    jsonb_build_object('billing_period', v_period::text, 'subscription_id', v_id)
  );

  return jsonb_build_object('ok', true, 'subscription_id', v_id, 'plan_code', v_plan.code::text);
end;
$$;

revoke execute on function public.subscribe_to_plan_stub(text, text) from public;
grant execute on function public.subscribe_to_plan_stub(text, text) to authenticated;

-- 6.4) cancel_my_subscription
create function public.cancel_my_subscription(p_immediate boolean default false)
returns jsonb
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

  select * into v_sub from public.subscriptions
   where user_id = v_uid
     and status in ('active', 'trialing', 'past_due')
   order by created_at desc
   limit 1;

  if v_sub.id is null then
    return jsonb_build_object('ok', false, 'reason', 'NO_ACTIVE_SUBSCRIPTION');
  end if;

  if p_immediate then
    update public.subscriptions
       set status = 'cancelled', updated_at = now()
     where id = v_sub.id;
  else
    update public.subscriptions
       set cancel_at_period_end = true, updated_at = now()
     where id = v_sub.id;
  end if;

  insert into public.subscription_events (user_id, kind, plan_code, metadata)
  values (v_uid, 'cancel', v_sub.plan_code,
          jsonb_build_object('immediate', p_immediate, 'subscription_id', v_sub.id));

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.cancel_my_subscription(boolean) from public;
grant execute on function public.cancel_my_subscription(boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- 7) Commentaires
-- ----------------------------------------------------------------------------

comment on table public.subscription_plans is
  'Catalogue des 5 abonnements Soutra-Playce. Source de vérité pour prix, cashback, features.';
comment on table public.subscriptions is
  'Abonnement courant d''un user. uq_subscriptions_active_per_user garantit un seul abo actif à la fois.';
comment on table public.subscription_events is
  'Tracking analytics : view/click/subscribe_attempt/success/abandon. Alimente le dashboard admin.';
comment on function public.subscribe_to_plan_stub is
  'MVP : crée un abo sans paiement réel. À remplacer par subscribe_to_plan_paystack/momo quand les providers seront branchés.';
