-- ============================================================================
-- SOUTRA-PAIYA — Migration 0041 : Super Dashboard Monétisation
-- ============================================================================
-- Système centralisé de paramètres administrables pour toutes les sources
-- de revenus de la plateforme. Chaque catégorie de venue peut avoir des
-- commissions / frais / cashback / objectifs différents, modulables par
-- ville, commune, tier d'abonnement et volume d'activité.
--
-- Architecture en 4 tables :
--   1. monetization_rules — règles paramétriques (cf. les 18 champs demandés)
--   2. monetization_revenue_log — historique de chaque event monétaire pour
--      alimenter le dashboard
--   3. monetization_targets — objectifs financiers par période / source
--   4. monetization_campaigns — promotions temporaires sur les commissions
--
-- Le moteur de règles `match_monetization_rule` applique une priorité :
--   priorité explicite > spécifique (catégorie+ville+commune) > général
--
-- Non-cassant : aucune table existante touchée.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Enums
-- ----------------------------------------------------------------------------

do $$ begin
  create type subscription_tier as enum (
    'free', 'basic', 'pro', 'premium', 'enterprise'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type volume_tier as enum (
    'nano',    -- < 100 k XOF/mois
    'micro',   -- 100 k – 500 k
    'small',   -- 500 k – 2 M
    'medium',  -- 2 M – 10 M
    'large',   -- 10 M – 50 M
    'xlarge'   -- > 50 M
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type revenue_kind as enum (
    'reservation_commission_pct',
    'reservation_commission_fixed',
    'service_fee_pct',
    'service_fee_fixed',
    'payment_commission',
    'subscription_commission',
    'ticket_commission',
    'marketplace_commission',
    'affiliation_commission',
    'user_cashback',
    'loyalty_bonus',
    'featured_listing',
    'advertising',
    'account_verification',
    'venue_certification',
    'event_publication',
    'promo_publication'
  );
exception when duplicate_object then null;
end $$;

-- ----------------------------------------------------------------------------
-- 2) Table principale : monetization_rules
--    Une règle peut être ciblée sur n'importe quelle combinaison de
--    (category, city, commune, subscription_tier, volume_tier). NULL = wildcard.
--    Le score de spécificité décide quelle règle gagne en cas de match multiple.
-- ----------------------------------------------------------------------------

create table if not exists public.monetization_rules (
  id                            uuid primary key default gen_random_uuid(),
  name                          text not null,
  description                   text,
  -- Cibles (NULL = wildcard, applique à tout)
  category                      venue_category,
  city                          text,
  commune                       text,
  subscription_tier             subscription_tier,
  volume_tier                   volume_tier,
  -- Priorité explicite : 0 = défaut, 100 = surclasse tout.
  priority                      integer not null default 0,
  -- Activation
  enabled                       boolean not null default true,
  valid_from                    timestamptz,
  valid_until                   timestamptz,
  -- ─── PARAMÈTRES COMMISSIONS RÉSERVATION ───
  commission_reservation_pct    numeric(5,2) check (commission_reservation_pct is null or commission_reservation_pct between 0 and 100),
  commission_reservation_fixed_xof bigint   check (commission_reservation_fixed_xof is null or commission_reservation_fixed_xof >= 0),
  -- ─── PARAMÈTRES FRAIS DE SERVICE ───
  service_fee_pct               numeric(5,2) check (service_fee_pct is null or service_fee_pct between 0 and 100),
  service_fee_fixed_xof         bigint       check (service_fee_fixed_xof is null or service_fee_fixed_xof >= 0),
  -- ─── COMMISSIONS PAR FLUX ───
  commission_payment_pct        numeric(5,2) check (commission_payment_pct is null or commission_payment_pct between 0 and 100),
  commission_subscription_pct   numeric(5,2) check (commission_subscription_pct is null or commission_subscription_pct between 0 and 100),
  commission_ticket_pct         numeric(5,2) check (commission_ticket_pct is null or commission_ticket_pct between 0 and 100),
  commission_marketplace_pct    numeric(5,2) check (commission_marketplace_pct is null or commission_marketplace_pct between 0 and 100),
  commission_affiliation_pct    numeric(5,2) check (commission_affiliation_pct is null or commission_affiliation_pct between 0 and 100),
  -- ─── INCITATIFS UTILISATEUR ───
  cashback_user_pct             numeric(5,2) check (cashback_user_pct is null or cashback_user_pct between 0 and 100),
  loyalty_bonus_pct             numeric(5,2) check (loyalty_bonus_pct is null or loyalty_bonus_pct between 0 and 100),
  -- ─── FRAIS FIXES (mensuels ou one-shot, l'admin documente dans description) ───
  featured_listing_xof          bigint check (featured_listing_xof is null or featured_listing_xof >= 0),
  advertising_xof               bigint check (advertising_xof is null or advertising_xof >= 0),
  account_verification_xof      bigint check (account_verification_xof is null or account_verification_xof >= 0),
  venue_certification_xof       bigint check (venue_certification_xof is null or venue_certification_xof >= 0),
  event_publication_xof         bigint check (event_publication_xof is null or event_publication_xof >= 0),
  promo_publication_xof         bigint check (promo_publication_xof is null or promo_publication_xof >= 0),
  -- ─── METADATA ───
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  created_by                    uuid references public.profiles(id),
  updated_by                    uuid references public.profiles(id)
);

create index if not exists idx_mrules_category_enabled
  on public.monetization_rules(category, enabled);
create index if not exists idx_mrules_city
  on public.monetization_rules(city) where city is not null;
create index if not exists idx_mrules_tier
  on public.monetization_rules(subscription_tier, volume_tier) where enabled = true;
create index if not exists idx_mrules_priority
  on public.monetization_rules(priority desc) where enabled = true;

-- Trigger updated_at
create or replace function public.tg_monetization_rules_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_mrules_updated_at on public.monetization_rules;
create trigger trg_mrules_updated_at
  before update on public.monetization_rules
  for each row execute function public.tg_monetization_rules_set_updated_at();

-- ----------------------------------------------------------------------------
-- 3) Log de chaque event monétaire — alimente le dashboard revenus
-- ----------------------------------------------------------------------------

create table if not exists public.monetization_revenue_log (
  id                uuid primary key default gen_random_uuid(),
  ts                timestamptz not null default now(),
  kind              revenue_kind not null,
  amount_xof        bigint not null check (amount_xof >= 0),
  -- Dimensions (toutes optionnelles pour rester souple)
  venue_id          uuid references public.venues(id) on delete set null,
  category          venue_category,
  city              text,
  commune           text,
  user_id           uuid references public.profiles(id) on delete set null,
  partner_id        uuid references public.profiles(id) on delete set null,
  -- Liens contextuels
  reservation_id    uuid,
  transaction_id    uuid,
  ticket_id         uuid,
  promo_id          uuid,
  rule_id           uuid references public.monetization_rules(id) on delete set null,
  -- Détail flexible (provider, campagne, segment, etc.)
  metadata          jsonb default '{}'::jsonb
);

create index if not exists idx_revenue_log_ts
  on public.monetization_revenue_log(ts desc);
create index if not exists idx_revenue_log_kind_ts
  on public.monetization_revenue_log(kind, ts desc);
create index if not exists idx_revenue_log_category_ts
  on public.monetization_revenue_log(category, ts desc) where category is not null;
create index if not exists idx_revenue_log_city_ts
  on public.monetization_revenue_log(city, ts desc) where city is not null;
create index if not exists idx_revenue_log_venue
  on public.monetization_revenue_log(venue_id, ts desc) where venue_id is not null;

-- ----------------------------------------------------------------------------
-- 4) Objectifs financiers (par période + kind, optionnellement par catégorie)
-- ----------------------------------------------------------------------------

create table if not exists public.monetization_targets (
  id           uuid primary key default gen_random_uuid(),
  period_month date not null,                -- toujours le 1er du mois
  kind         revenue_kind,                 -- NULL = total
  category     venue_category,               -- NULL = toutes
  target_xof   bigint not null check (target_xof >= 0),
  notes        text,
  created_at   timestamptz not null default now(),
  created_by   uuid references public.profiles(id),
  -- Unique : 1 objectif par (mois, kind, catégorie) — coalesce NULL via tag
  constraint uq_targets unique (period_month, kind, category)
);

create index if not exists idx_targets_period
  on public.monetization_targets(period_month desc);

-- ----------------------------------------------------------------------------
-- 5) Campagnes temporaires (promotions sur commissions)
--    Une campagne est une "surcharge" : pendant sa fenêtre active, ses valeurs
--    écrasent celles des règles standards. Utilisée pour pousser une catégorie
--    (ex : -50 % de commission sur Restaurants en juillet pour la conquête).
-- ----------------------------------------------------------------------------

create table if not exists public.monetization_campaigns (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  description       text,
  category          venue_category,
  city              text,
  starts_at         timestamptz not null,
  ends_at           timestamptz not null check (ends_at > starts_at),
  enabled           boolean not null default true,
  -- Surcharges (NULL = ne touche pas la valeur normale)
  override_commission_reservation_pct numeric(5,2),
  override_service_fee_pct            numeric(5,2),
  override_cashback_user_pct          numeric(5,2),
  override_loyalty_bonus_pct          numeric(5,2),
  -- Frais fixes : la campagne peut mettre à 0 le frais publication d'événements
  override_event_publication_xof      bigint,
  override_promo_publication_xof      bigint,
  created_at        timestamptz not null default now(),
  created_by        uuid references public.profiles(id)
);

create index if not exists idx_campaigns_active
  on public.monetization_campaigns(starts_at, ends_at) where enabled = true;

-- ----------------------------------------------------------------------------
-- 6) RLS — tout est admin-only
-- ----------------------------------------------------------------------------

alter table public.monetization_rules           enable row level security;
alter table public.monetization_revenue_log     enable row level security;
alter table public.monetization_targets         enable row level security;
alter table public.monetization_campaigns       enable row level security;

drop policy if exists "mrules_admin_all" on public.monetization_rules;
create policy "mrules_admin_all" on public.monetization_rules
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "rlog_admin_select" on public.monetization_revenue_log;
create policy "rlog_admin_select" on public.monetization_revenue_log
  for select to authenticated
  using (public.is_admin());

drop policy if exists "targets_admin_all" on public.monetization_targets;
create policy "targets_admin_all" on public.monetization_targets
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "campaigns_admin_all" on public.monetization_campaigns;
create policy "campaigns_admin_all" on public.monetization_campaigns
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 7) RPC : Moteur de règles — matche la meilleure règle pour un contexte
--    Score de spécificité (haut = plus spécifique) :
--      +100 si priority > 0 → priorité explicite respectée
--      +16  si category match exact (non NULL)
--      +8   si commune match
--      +4   si city match
--      +2   si subscription_tier match
--      +1   si volume_tier match
--    Une règle ne matche que si chacun de ses champs non-NULL correspond au
--    contexte demandé.
-- ----------------------------------------------------------------------------

create or replace function public.match_monetization_rule(
  p_category          text default null,
  p_city              text default null,
  p_commune           text default null,
  p_subscription_tier text default null,
  p_volume_tier       text default null,
  p_at                timestamptz default now()
)
returns table (
  id                              uuid,
  name                            text,
  commission_reservation_pct      numeric,
  commission_reservation_fixed_xof bigint,
  service_fee_pct                 numeric,
  service_fee_fixed_xof           bigint,
  commission_payment_pct          numeric,
  commission_subscription_pct     numeric,
  commission_ticket_pct           numeric,
  commission_marketplace_pct      numeric,
  commission_affiliation_pct      numeric,
  cashback_user_pct               numeric,
  loyalty_bonus_pct               numeric,
  featured_listing_xof            bigint,
  advertising_xof                 bigint,
  account_verification_xof        bigint,
  venue_certification_xof         bigint,
  event_publication_xof           bigint,
  promo_publication_xof           bigint,
  specificity_score               integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with candidates as (
    select
      r.*,
      ( (r.priority * 100)
        + (case when r.category is not null then 16 else 0 end)
        + (case when r.commune is not null then 8 else 0 end)
        + (case when r.city is not null then 4 else 0 end)
        + (case when r.subscription_tier is not null then 2 else 0 end)
        + (case when r.volume_tier is not null then 1 else 0 end)
      ) as specificity_score
    from public.monetization_rules r
    where r.enabled = true
      and (r.valid_from is null or r.valid_from <= coalesce(p_at, now()))
      and (r.valid_until is null or r.valid_until > coalesce(p_at, now()))
      -- Chaque champ non-NULL doit matcher (NULL = wildcard).
      and (r.category is null or r.category::text = p_category)
      and (r.city is null or r.city ilike p_city)
      and (r.commune is null or r.commune ilike p_commune)
      and (r.subscription_tier is null
           or r.subscription_tier::text = coalesce(p_subscription_tier, 'free'))
      and (r.volume_tier is null
           or r.volume_tier::text = coalesce(p_volume_tier, 'nano'))
  )
  select
    c.id, c.name,
    c.commission_reservation_pct, c.commission_reservation_fixed_xof,
    c.service_fee_pct, c.service_fee_fixed_xof,
    c.commission_payment_pct, c.commission_subscription_pct,
    c.commission_ticket_pct, c.commission_marketplace_pct, c.commission_affiliation_pct,
    c.cashback_user_pct, c.loyalty_bonus_pct,
    c.featured_listing_xof, c.advertising_xof,
    c.account_verification_xof, c.venue_certification_xof,
    c.event_publication_xof, c.promo_publication_xof,
    c.specificity_score
  from candidates c
  order by c.specificity_score desc, c.priority desc, c.updated_at desc
  limit 1;
$$;

grant execute on function public.match_monetization_rule(text, text, text, text, text, timestamptz)
  to authenticated;

-- ----------------------------------------------------------------------------
-- 8) RPC : compute_fee_amount — applique la règle à un montant
--    Renvoie { fee_total_xof, fee_pct_part, fee_fixed_part, base, net, rule_id }
-- ----------------------------------------------------------------------------

create or replace function public.compute_fee_amount(
  p_amount_xof        bigint,
  p_kind              text,                       -- ex : 'reservation', 'service', 'payment'…
  p_category          text default null,
  p_city              text default null,
  p_commune           text default null,
  p_subscription_tier text default null,
  p_volume_tier       text default null
) returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  r record;
  v_pct    numeric := 0;
  v_fixed  bigint := 0;
  v_total  bigint := 0;
begin
  select * into r
    from public.match_monetization_rule(p_category, p_city, p_commune, p_subscription_tier, p_volume_tier);

  if r.id is null then
    return jsonb_build_object(
      'fee_total_xof', 0,
      'fee_pct_part', 0,
      'fee_fixed_part', 0,
      'base_xof', coalesce(p_amount_xof, 0),
      'net_xof', coalesce(p_amount_xof, 0),
      'rule_id', null,
      'rule_name', null,
      'reason', 'NO_MATCHING_RULE'
    );
  end if;

  case p_kind
    when 'reservation' then
      v_pct   := coalesce(r.commission_reservation_pct, 0);
      v_fixed := coalesce(r.commission_reservation_fixed_xof, 0);
    when 'service' then
      v_pct   := coalesce(r.service_fee_pct, 0);
      v_fixed := coalesce(r.service_fee_fixed_xof, 0);
    when 'payment' then
      v_pct   := coalesce(r.commission_payment_pct, 0);
    when 'subscription' then
      v_pct   := coalesce(r.commission_subscription_pct, 0);
    when 'ticket' then
      v_pct   := coalesce(r.commission_ticket_pct, 0);
    when 'marketplace' then
      v_pct   := coalesce(r.commission_marketplace_pct, 0);
    when 'affiliation' then
      v_pct   := coalesce(r.commission_affiliation_pct, 0);
    when 'cashback' then
      v_pct   := coalesce(r.cashback_user_pct, 0);
    when 'loyalty' then
      v_pct   := coalesce(r.loyalty_bonus_pct, 0);
    when 'featured_listing' then
      v_fixed := coalesce(r.featured_listing_xof, 0);
    when 'advertising' then
      v_fixed := coalesce(r.advertising_xof, 0);
    when 'account_verification' then
      v_fixed := coalesce(r.account_verification_xof, 0);
    when 'venue_certification' then
      v_fixed := coalesce(r.venue_certification_xof, 0);
    when 'event_publication' then
      v_fixed := coalesce(r.event_publication_xof, 0);
    when 'promo_publication' then
      v_fixed := coalesce(r.promo_publication_xof, 0);
    else
      raise exception 'UNKNOWN_FEE_KIND %', p_kind;
  end case;

  v_total := round(coalesce(p_amount_xof, 0) * v_pct / 100.0)::bigint + v_fixed;

  return jsonb_build_object(
    'fee_total_xof', v_total,
    'fee_pct_part', round(coalesce(p_amount_xof, 0) * v_pct / 100.0)::bigint,
    'fee_fixed_part', v_fixed,
    'base_xof', coalesce(p_amount_xof, 0),
    'net_xof', coalesce(p_amount_xof, 0) - v_total,
    'rule_id', r.id,
    'rule_name', r.name,
    'pct_applied', v_pct,
    'fixed_applied', v_fixed
  );
end;
$$;

grant execute on function public.compute_fee_amount(bigint, text, text, text, text, text, text)
  to authenticated;

-- ----------------------------------------------------------------------------
-- 9) RPC admin : upsert d'une règle
-- ----------------------------------------------------------------------------

create or replace function public.upsert_monetization_rule(
  p_id                              uuid,
  p_name                            text,
  p_description                     text default null,
  p_category                        text default null,
  p_city                            text default null,
  p_commune                         text default null,
  p_subscription_tier               text default null,
  p_volume_tier                     text default null,
  p_priority                        integer default 0,
  p_enabled                         boolean default true,
  p_valid_from                      timestamptz default null,
  p_valid_until                     timestamptz default null,
  p_commission_reservation_pct      numeric default null,
  p_commission_reservation_fixed_xof bigint  default null,
  p_service_fee_pct                 numeric default null,
  p_service_fee_fixed_xof           bigint  default null,
  p_commission_payment_pct          numeric default null,
  p_commission_subscription_pct     numeric default null,
  p_commission_ticket_pct           numeric default null,
  p_commission_marketplace_pct      numeric default null,
  p_commission_affiliation_pct      numeric default null,
  p_cashback_user_pct               numeric default null,
  p_loyalty_bonus_pct               numeric default null,
  p_featured_listing_xof            bigint  default null,
  p_advertising_xof                 bigint  default null,
  p_account_verification_xof        bigint  default null,
  p_venue_certification_xof         bigint  default null,
  p_event_publication_xof           bigint  default null,
  p_promo_publication_xof           bigint  default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;

  if p_id is null then
    insert into public.monetization_rules (
      name, description, category, city, commune,
      subscription_tier, volume_tier, priority, enabled,
      valid_from, valid_until,
      commission_reservation_pct, commission_reservation_fixed_xof,
      service_fee_pct, service_fee_fixed_xof,
      commission_payment_pct, commission_subscription_pct,
      commission_ticket_pct, commission_marketplace_pct, commission_affiliation_pct,
      cashback_user_pct, loyalty_bonus_pct,
      featured_listing_xof, advertising_xof,
      account_verification_xof, venue_certification_xof,
      event_publication_xof, promo_publication_xof,
      created_by, updated_by
    ) values (
      p_name, p_description,
      nullif(trim(coalesce(p_category, '')), '')::venue_category,
      nullif(trim(coalesce(p_city, '')), ''),
      nullif(trim(coalesce(p_commune, '')), ''),
      nullif(trim(coalesce(p_subscription_tier, '')), '')::subscription_tier,
      nullif(trim(coalesce(p_volume_tier, '')), '')::volume_tier,
      coalesce(p_priority, 0), coalesce(p_enabled, true),
      p_valid_from, p_valid_until,
      p_commission_reservation_pct, p_commission_reservation_fixed_xof,
      p_service_fee_pct, p_service_fee_fixed_xof,
      p_commission_payment_pct, p_commission_subscription_pct,
      p_commission_ticket_pct, p_commission_marketplace_pct, p_commission_affiliation_pct,
      p_cashback_user_pct, p_loyalty_bonus_pct,
      p_featured_listing_xof, p_advertising_xof,
      p_account_verification_xof, p_venue_certification_xof,
      p_event_publication_xof, p_promo_publication_xof,
      v_uid, v_uid
    )
    returning id into v_id;
  else
    update public.monetization_rules set
      name = p_name,
      description = p_description,
      category = nullif(trim(coalesce(p_category, '')), '')::venue_category,
      city = nullif(trim(coalesce(p_city, '')), ''),
      commune = nullif(trim(coalesce(p_commune, '')), ''),
      subscription_tier = nullif(trim(coalesce(p_subscription_tier, '')), '')::subscription_tier,
      volume_tier = nullif(trim(coalesce(p_volume_tier, '')), '')::volume_tier,
      priority = coalesce(p_priority, 0),
      enabled = coalesce(p_enabled, true),
      valid_from = p_valid_from,
      valid_until = p_valid_until,
      commission_reservation_pct = p_commission_reservation_pct,
      commission_reservation_fixed_xof = p_commission_reservation_fixed_xof,
      service_fee_pct = p_service_fee_pct,
      service_fee_fixed_xof = p_service_fee_fixed_xof,
      commission_payment_pct = p_commission_payment_pct,
      commission_subscription_pct = p_commission_subscription_pct,
      commission_ticket_pct = p_commission_ticket_pct,
      commission_marketplace_pct = p_commission_marketplace_pct,
      commission_affiliation_pct = p_commission_affiliation_pct,
      cashback_user_pct = p_cashback_user_pct,
      loyalty_bonus_pct = p_loyalty_bonus_pct,
      featured_listing_xof = p_featured_listing_xof,
      advertising_xof = p_advertising_xof,
      account_verification_xof = p_account_verification_xof,
      venue_certification_xof = p_venue_certification_xof,
      event_publication_xof = p_event_publication_xof,
      promo_publication_xof = p_promo_publication_xof
     where id = p_id
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.upsert_monetization_rule(
  uuid, text, text, text, text, text, text, text, integer, boolean,
  timestamptz, timestamptz,
  numeric, bigint, numeric, bigint,
  numeric, numeric, numeric, numeric, numeric,
  numeric, numeric,
  bigint, bigint, bigint, bigint, bigint, bigint
) from public;
grant execute on function public.upsert_monetization_rule(
  uuid, text, text, text, text, text, text, text, integer, boolean,
  timestamptz, timestamptz,
  numeric, bigint, numeric, bigint,
  numeric, numeric, numeric, numeric, numeric,
  numeric, numeric,
  bigint, bigint, bigint, bigint, bigint, bigint
) to authenticated;

-- ----------------------------------------------------------------------------
-- 10) RPC admin : log_revenue_event — appelée par tout flux qui génère du CA
--     (réservation, abonnement, billetterie, marketplace, ads, publication…)
-- ----------------------------------------------------------------------------

create or replace function public.log_revenue_event(
  p_kind            text,
  p_amount_xof      bigint,
  p_venue_id        uuid    default null,
  p_category        text    default null,
  p_city            text    default null,
  p_commune         text    default null,
  p_user_id         uuid    default null,
  p_partner_id      uuid    default null,
  p_reservation_id  uuid    default null,
  p_transaction_id  uuid    default null,
  p_ticket_id       uuid    default null,
  p_promo_id        uuid    default null,
  p_rule_id         uuid    default null,
  p_metadata        jsonb   default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_amount_xof is null or p_amount_xof < 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  insert into public.monetization_revenue_log (
    kind, amount_xof, venue_id, category, city, commune,
    user_id, partner_id,
    reservation_id, transaction_id, ticket_id, promo_id, rule_id, metadata
  ) values (
    p_kind::revenue_kind, p_amount_xof, p_venue_id,
    nullif(trim(coalesce(p_category, '')), '')::venue_category,
    nullif(trim(coalesce(p_city, '')), ''),
    nullif(trim(coalesce(p_commune, '')), ''),
    p_user_id, p_partner_id,
    p_reservation_id, p_transaction_id, p_ticket_id, p_promo_id, p_rule_id,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.log_revenue_event(
  text, bigint, uuid, text, text, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid, jsonb
) to authenticated;

-- ----------------------------------------------------------------------------
-- 11) RPC admin : revenue_dashboard — agrégé par dimension
-- ----------------------------------------------------------------------------

create or replace function public.revenue_dashboard(
  p_from      timestamptz default (now() - interval '30 days'),
  p_to        timestamptz default now(),
  p_group_by  text default 'kind'   -- kind | category | city | commune | day | venue
)
returns table (
  bucket          text,
  total_xof       bigint,
  event_count     bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with src as (
    select * from public.monetization_revenue_log
     where ts >= p_from and ts < p_to
       and public.is_admin()
  )
  select
    case p_group_by
      when 'kind'     then coalesce(kind::text, 'unknown')
      when 'category' then coalesce(category::text, '—')
      when 'city'     then coalesce(city, '—')
      when 'commune'  then coalesce(commune, '—')
      when 'day'      then to_char(ts at time zone 'UTC', 'YYYY-MM-DD')
      when 'venue'    then coalesce(venue_id::text, '—')
      else 'all'
    end                                              as bucket,
    sum(amount_xof)::bigint                          as total_xof,
    count(*)::bigint                                 as event_count
  from src
  group by 1
  order by 2 desc nulls last
  limit 200;
$$;

grant execute on function public.revenue_dashboard(timestamptz, timestamptz, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 12) RPC admin : KPIs globaux (total + variation vs période précédente)
-- ----------------------------------------------------------------------------

create or replace function public.revenue_summary(
  p_from timestamptz default (now() - interval '30 days'),
  p_to   timestamptz default now()
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_period_len interval;
  v_total      bigint;
  v_total_prev bigint;
  v_count      bigint;
  v_top_kind   text;
  v_top_cat    text;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  v_period_len := p_to - p_from;

  select coalesce(sum(amount_xof), 0), count(*)
    into v_total, v_count
    from public.monetization_revenue_log
   where ts >= p_from and ts < p_to;

  select coalesce(sum(amount_xof), 0)
    into v_total_prev
    from public.monetization_revenue_log
   where ts >= (p_from - v_period_len) and ts < p_from;

  select kind::text into v_top_kind
    from public.monetization_revenue_log
   where ts >= p_from and ts < p_to
   group by kind
   order by sum(amount_xof) desc nulls last
   limit 1;

  select coalesce(category::text, '—') into v_top_cat
    from public.monetization_revenue_log
   where ts >= p_from and ts < p_to
   group by category
   order by sum(amount_xof) desc nulls last
   limit 1;

  return jsonb_build_object(
    'total_xof', v_total,
    'event_count', v_count,
    'previous_total_xof', v_total_prev,
    'delta_pct',
      case when v_total_prev > 0
        then round(((v_total - v_total_prev) * 100.0 / v_total_prev)::numeric, 1)
        else null
      end,
    'top_kind', v_top_kind,
    'top_category', v_top_cat
  );
end;
$$;

grant execute on function public.revenue_summary(timestamptz, timestamptz) to authenticated;

-- ----------------------------------------------------------------------------
-- 13) Vue pratique : règles avec lib catégorie + métadonnées de match
-- ----------------------------------------------------------------------------

create or replace view public.monetization_rules_view as
  select
    r.id, r.name, r.description, r.enabled, r.priority,
    r.category::text   as category,
    r.city, r.commune,
    r.subscription_tier::text as subscription_tier,
    r.volume_tier::text       as volume_tier,
    r.valid_from, r.valid_until,
    r.commission_reservation_pct, r.commission_reservation_fixed_xof,
    r.service_fee_pct, r.service_fee_fixed_xof,
    r.commission_payment_pct, r.commission_subscription_pct,
    r.commission_ticket_pct, r.commission_marketplace_pct, r.commission_affiliation_pct,
    r.cashback_user_pct, r.loyalty_bonus_pct,
    r.featured_listing_xof, r.advertising_xof,
    r.account_verification_xof, r.venue_certification_xof,
    r.event_publication_xof, r.promo_publication_xof,
    r.created_at, r.updated_at, r.created_by, r.updated_by
  from public.monetization_rules r;

grant select on public.monetization_rules_view to authenticated;

-- ----------------------------------------------------------------------------
-- 14) Seed : une règle "Global Default" qui s'applique partout si rien d'autre
-- ----------------------------------------------------------------------------

insert into public.monetization_rules (
  name, description, priority, enabled,
  commission_reservation_pct, service_fee_pct,
  commission_payment_pct, commission_subscription_pct,
  commission_ticket_pct, commission_marketplace_pct,
  cashback_user_pct, loyalty_bonus_pct
)
select
  'Règle globale par défaut',
  'Appliquée à toutes les catégories tant qu''aucune règle plus spécifique n''existe. Modifie-la depuis le Super Dashboard.',
  0, true,
  5.0,   -- 5 % commission réservation
  2.0,   -- 2 % frais de service
  1.5,   -- 1.5 % commission paiement
  10.0,  -- 10 % commission abonnement
  7.0,   -- 7 % commission billetterie
  10.0,  -- 10 % commission marketplace
  1.0,   -- 1 % cashback user
  0.5    -- 0.5 % bonus fidélité
where not exists (
  select 1 from public.monetization_rules where name = 'Règle globale par défaut'
);

-- ----------------------------------------------------------------------------
-- 15) Commentaires
-- ----------------------------------------------------------------------------

comment on table public.monetization_rules is
  'Règles de monétisation paramétrables (commissions, frais, cashback) ciblables par catégorie/ville/commune/tier d''abonnement/volume.';
comment on function public.match_monetization_rule is
  'Moteur de règles : renvoie la règle la plus spécifique pour un contexte donné (priorité explicite > spécificité descendante).';
comment on function public.compute_fee_amount is
  'Applique la règle matchée à un montant et un kind (reservation/service/payment/ticket/...). Renvoie fee_total_xof + détails.';
comment on function public.log_revenue_event is
  'Trace un événement monétaire dans monetization_revenue_log. À appeler par tous les flux qui génèrent du CA.';
comment on function public.revenue_dashboard is
  'Agrège les revenus par dimension (kind/category/city/commune/day/venue). Admin only.';
comment on function public.revenue_summary is
  'KPIs globaux : total + variation période précédente + top kind + top catégorie.';
