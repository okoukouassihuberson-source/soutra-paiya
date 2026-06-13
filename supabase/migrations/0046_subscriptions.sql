-- ============================================================================
-- SOUTRA-PAIYA — Migration 0046 : abonnements premium + analytics
-- ============================================================================
-- Modèle économique cœur de Soutra-Playce : 5 plans (free, standard, pro,
-- premium, soutra_premium) avec cashback différencié. Le paiement réel n'est
-- pas connecté dans cette migration (flow MVP stub) ; mais toute
-- l'infrastructure est en place :
--   • subscription_plans : catalogue des 5 plans, seedés en dur
--   • subscriptions      : abonnement courant d'un user (lien plan, status,
--                          période, provider)
--   • subscription_events: tracking analytics (view/click/subscribe_attempt)
--                          pour mesurer conversion et taux d'abandon
--
-- Non-cassant : ne touche pas aux autres tables.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Enums
-- ----------------------------------------------------------------------------

do $$ begin
  create type subscription_plan_code as enum (
    'free', 'standard', 'pro', 'premium', 'soutra_premium'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type subscription_status as enum (
    'active',     -- abonnement en cours, valide
    'trialing',   -- période d'essai
    'past_due',   -- paiement échoué, sursis
    'cancelled',  -- résilié par le user
    'expired'     -- période terminée sans renouvellement
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type subscription_billing_period as enum ('monthly', 'yearly');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type subscription_event_kind as enum (
    'plan_view',         -- la page /subscribe est ouverte
    'plan_click',        -- l'utilisateur clique sur le bouton CTA d'un plan
    'subscribe_attempt', -- l'utilisateur lance le flow de paiement
    'subscribe_success', -- paiement validé (futur)
    'subscribe_abandon', -- l'utilisateur ferme le modal sans payer
    'plan_change',       -- changement de plan
    'cancel'             -- résiliation
  );
exception when duplicate_object then null;
end $$;

-- ----------------------------------------------------------------------------
-- 2) Catalogue des plans (seedé en dur)
-- ----------------------------------------------------------------------------

create table if not exists public.subscription_plans (
  code              subscription_plan_code primary key,
  display_name      text not null,
  tagline           text,
  -- Prix : monnaie XOF (FCFA), exprimé en plus petite unité (= 1 FCFA = 1
  -- unité ; pas de centime FCFA). bigint pour cohérence avec wallets.balance.
  price_monthly_xof bigint not null check (price_monthly_xof >= 0),
  price_yearly_xof  bigint not null check (price_yearly_xof  >= 0),
  -- Cashback en points de base : 100 = 1%, 200 = 2%, 500 = 5%
  cashback_bps      integer not null check (cashback_bps between 0 and 10000),
  -- Position d'affichage dans la grille (0 = leftmost / first)
  display_order     integer not null default 0,
  -- Plan recommandé (affiché avec le badge "RECOMMANDÉ" + visuel mis en avant)
  is_recommended    boolean not null default false,
  -- Plan ultra-premium (style luxe noir/or)
  is_prestige       boolean not null default false,
  features          jsonb not null default '[]'::jsonb, -- liste de strings
  cta_label         text not null,
  -- Métadonnées style (clé tailwind / hex, le front choisit comment styler)
  accent_color      text,                                -- ex: 'blue', 'gold'
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create or replace function public.tg_subscription_plans_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists trg_subscription_plans_updated_at on public.subscription_plans;
create trigger trg_subscription_plans_updated_at
  before update on public.subscription_plans
  for each row execute function public.tg_subscription_plans_set_updated_at();

-- RLS : catalogue public en lecture, écriture admin uniquement
alter table public.subscription_plans enable row level security;

drop policy if exists "subscription_plans_select_public" on public.subscription_plans;
create policy "subscription_plans_select_public" on public.subscription_plans
  for select to anon, authenticated using (true);

drop policy if exists "subscription_plans_admin_all" on public.subscription_plans;
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
    0, 0, 100,
    0, false, false,
    jsonb_build_array(
      'Accès aux fonctionnalités essentielles',
      'Paiement sécurisé',
      'Cashback 1 %',
      'Découverte de l''écosystème Soutra-Playce'
    ),
    'Commencer gratuitement',
    'neutral'
  ),
  (
    'standard', 'Standard', 'Pour profiter au quotidien',
    2000, 20000, 100,
    1, false, false,
    jsonb_build_array(
      'Tous les avantages Free',
      'Notifications prioritaires',
      'Alertes personnalisées',
      'Offres promotionnelles exclusives'
    ),
    'Passer au Standard',
    'orange'
  ),
  (
    'pro', 'Pro', 'Meilleur rapport qualité/prix',
    5000, 50000, 200,
    2, true, false,
    jsonb_build_array(
      'Tous les avantages Standard',
      'Cashback augmenté à 2 %',
      'Suppression complète de la publicité',
      'Concierge IA Sia illimité',
      'Support prioritaire'
    ),
    'Choisir Pro',
    'blue-purple'
  ),
  (
    'premium', 'Premium', 'Expérience VVIP',
    15000, 150000, 300,
    3, false, false,
    jsonb_build_array(
      'Tous les avantages Pro',
      'Accès VVIP',
      'Réservations prioritaires',
      'Événements exclusifs',
      'Voix Premium Sia',
      'Réductions partenaires Premium'
    ),
    'Devenir Premium',
    'purple-gold'
  ),
  (
    'soutra_premium', 'Soutra Premium', 'L''élite Soutra-Playce',
    30000, 300000, 500,
    4, false, true,
    jsonb_build_array(
      'Tous les avantages Premium',
      'Cashback maximal de 5 %',
      'Concierge humain dédié',
      'Invitations privées',
      'Expériences exclusives',
      'Service ultra-prioritaire',
      'Statut Elite Soutra-Playce'
    ),
    'Accéder à l''élite',
    'black-gold'
  )
on conflict (code) do update set
  display_name      = excluded.display_name,
  tagline           = excluded.tagline,
  price_monthly_xof = excluded.price_monthly_xof,
  price_yearly_xof  = excluded.price_yearly_xof,
  cashback_bps      = excluded.cashback_bps,
  display_order     = excluded.display_order,
  is_recommended    = excluded.is_recommended,
  is_prestige       = excluded.is_prestige,
  features          = excluded.features,
  cta_label         = excluded.cta_label,
  accent_color      = excluded.accent_color,
  updated_at        = now();

-- ----------------------------------------------------------------------------
-- 3) Abonnement utilisateur
-- ----------------------------------------------------------------------------

create table if not exists public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references public.profiles(id) on delete cascade,
  plan_code              subscription_plan_code not null references public.subscription_plans(code),
  status                 subscription_status not null default 'active',
  billing_period         subscription_billing_period not null default 'monthly',
  current_period_start   timestamptz not null default now(),
  current_period_end     timestamptz not null,
  cancel_at_period_end   boolean not null default false,
  -- Provider de paiement (cf. enum payment_provider de la migration 0001)
  payment_provider       payment_provider,
  payment_ref            text, -- ref externe Paystack/CinetPay/MoMo
  metadata               jsonb not null default '{}'::jsonb,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- Un user n'a qu'un seul abonnement actif à la fois.
create unique index if not exists uq_subscriptions_active_per_user
  on public.subscriptions(user_id)
  where status in ('active', 'trialing', 'past_due');

create index if not exists idx_subscriptions_user_created
  on public.subscriptions(user_id, created_at desc);

create index if not exists idx_subscriptions_status
  on public.subscriptions(status);

create or replace function public.tg_subscriptions_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists trg_subscriptions_updated_at on public.subscriptions;
create trigger trg_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.tg_subscriptions_set_updated_at();

alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions_select_self" on public.subscriptions;
create policy "subscriptions_select_self" on public.subscriptions
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "subscriptions_select_admin" on public.subscriptions;
create policy "subscriptions_select_admin" on public.subscriptions
  for select to authenticated using (public.is_admin());

-- L'écriture passe par les RPC (subscribe_to_plan_stub, cancel_subscription).
-- Policies pour debug uniquement, restreintes au user lui-même.
drop policy if exists "subscriptions_insert_self" on public.subscriptions;
create policy "subscriptions_insert_self" on public.subscriptions
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "subscriptions_update_self" on public.subscriptions;
create policy "subscriptions_update_self" on public.subscriptions
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 4) Analytics events
-- ----------------------------------------------------------------------------

create table if not exists public.subscription_events (
  id            bigserial primary key,
  user_id       uuid references public.profiles(id) on delete set null,
  -- Permet le tracking anonyme (avant login)
  session_id    text,
  kind          subscription_event_kind not null,
  plan_code     subscription_plan_code,
  -- Métadonnées extensibles (utm, page, device, montant simulé, etc.)
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists idx_subscription_events_kind_date
  on public.subscription_events(kind, created_at desc);

create index if not exists idx_subscription_events_plan_date
  on public.subscription_events(plan_code, created_at desc) where plan_code is not null;

create index if not exists idx_subscription_events_user_date
  on public.subscription_events(user_id, created_at desc) where user_id is not null;

alter table public.subscription_events enable row level security;

-- Admin voit tout, c'est lui qui exploite les analytics.
drop policy if exists "subscription_events_select_admin" on public.subscription_events;
create policy "subscription_events_select_admin" on public.subscription_events
  for select to authenticated using (public.is_admin());

-- L'insert passe par la RPC track_subscription_event (security definer).
-- On laisse une policy minimale pour debug : un user peut insert un event
-- avec son propre user_id.
drop policy if exists "subscription_events_insert_self" on public.subscription_events;
create policy "subscription_events_insert_self" on public.subscription_events
  for insert to authenticated with check (user_id is null or user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 5) RPCs
-- ----------------------------------------------------------------------------

-- 5.1) track_subscription_event : ouvert à anon et authenticated, log l'event.
create or replace function public.track_subscription_event(
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

-- 5.2) get_my_subscription : retourne l'abo actif + plan détaillé pour le user
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
    -- Pas d'abo : on retourne le plan Free comme plan par défaut implicite.
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

-- 5.3) subscribe_to_plan_stub : MVP — crée l'abonnement sans paiement réel.
-- IMPORTANT : ce stub doit être remplacé quand le provider de paiement sera
-- branché. Pour l'instant il marque le plan comme 'active' avec
-- payment_provider null et payment_ref null. L'objectif est de tester le flow
-- UI et d'avoir des données réelles dans la table subscriptions.
create or replace function public.subscribe_to_plan_stub(
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

  -- Annule tout abo actif précédent du même user.
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

  -- Log l'event pour analytics.
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

-- 5.4) cancel_my_subscription : résiliation par le user (fin de période)
create or replace function public.cancel_my_subscription(p_immediate boolean default false)
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
-- 6) Commentaires
-- ----------------------------------------------------------------------------

comment on table public.subscription_plans is
  'Catalogue des 5 abonnements Soutra-Playce. Source de vérité pour prix, cashback, features.';
comment on table public.subscriptions is
  'Abonnement courant d''un user. uq_subscriptions_active_per_user garantit un seul abo actif à la fois.';
comment on table public.subscription_events is
  'Tracking analytics : view/click/subscribe_attempt/success/abandon. Alimente le dashboard admin.';
comment on function public.subscribe_to_plan_stub is
  'MVP : crée un abo sans paiement réel. À remplacer par subscribe_to_plan_paystack/momo quand les providers seront branchés.';
