-- ============================================================================
-- SOUTRA-PAIYA — Migration 0069 : dépréciation du moteur cashback
-- ============================================================================
-- Le moteur de fidélité (migration 0068) remplace le cashback. On coupe ici
-- le moteur cashback :
--   1. Trigger + fonctions cashback (plus aucune nouvelle tx type='cashback'
--      ne sera générée).
--   2. Colonne subscription_plans.cashback_bps (les plans n'ont plus de taux
--      différencié — la fidélité est universelle, 100 FCFA = 1 point pour
--      tout le monde).
--
-- Ce qui N'EST PAS touché, volontairement :
--   - La valeur d'enum tx_type='cashback' : Postgres impose de recréer tout
--     le type pour retirer une valeur d'enum — risque disproportionné pour
--     un nettoyage cosmétique.
--   - Les lignes transactions type='cashback' déjà générées : conservées
--     pour l'historique comptable (décision produit). admin_list_subscribers
--     continue de les agréger (cashback_received_xof, ltv_xof) : c'est de la
--     donnée historique légitime, pas une fonctionnalité active.
--   - monetization_settings.cashback_user_pct / override_cashback_user_pct
--     et l'enum revenue_kind='user_cashback' (migration 0041) : système de
--     suivi de revenus établissements distinct, sans lien avec le moteur
--     cashback utilisateur. Les toucher risquerait de casser
--     monetization_rules / match_monetization_rule pour un gain nul.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Coupe le moteur cashback
-- ----------------------------------------------------------------------------

drop trigger if exists trg_transactions_apply_cashback on public.transactions;
drop function if exists public.tg_transactions_apply_cashback();
drop function if exists public.apply_cashback_for_tx(uuid);
drop function if exists public.get_my_cashback_stats(integer);
drop function if exists public.admin_cashback_stats(integer);

-- ----------------------------------------------------------------------------
-- 2) Fonctions dépendantes de subscription_plans.cashback_bps : on les
--    recrée sans la colonne AVANT de la dropper (sinon elles échoueraient au
--    prochain appel plutôt qu'à cette migration).
-- ----------------------------------------------------------------------------

create or replace function public.admin_subscription_stats(
  p_window_days integer default 30
) returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_window     integer := greatest(1, least(coalesce(p_window_days, 30), 365));
  v_since      timestamptz := now() - (v_window || ' days')::interval;
  v_totals     jsonb;
  v_funnel     jsonb;
  v_per_plan   jsonb;
  v_by_day     jsonb;
  v_recent     jsonb;
  v_churn      jsonb;
begin
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED';
  end if;

  -- ── TOTALS ─────────────────────────────────────────────────────────────
  with active_subs as (
    select s.*, p.price_monthly_xof, p.price_yearly_xof
      from public.subscriptions s
      join public.subscription_plans p on p.code = s.plan_code
     where s.status in ('active', 'trialing')
  )
  select jsonb_build_object(
    'active_subscribers', coalesce(count(*), 0),
    'mrr_xof', coalesce(sum(
      case when billing_period = 'monthly'
           then price_monthly_xof
           else (price_yearly_xof / 12)::bigint
      end
    ), 0)::bigint,
    'arr_xof', coalesce(sum(
      case when billing_period = 'monthly'
           then price_monthly_xof * 12
           else price_yearly_xof
      end
    ), 0)::bigint,
    'paid_subscribers', coalesce(count(*) filter (
      where plan_code <> 'free'
    ), 0)
  )
  into v_totals
  from active_subs;

  -- ── FUNNEL (30j) ──────────────────────────────────────────────────────
  with funnel as (
    select
      count(*) filter (where kind = 'plan_view')         as views,
      count(*) filter (where kind = 'plan_click')        as clicks,
      count(*) filter (where kind = 'subscribe_attempt') as attempts,
      count(*) filter (where kind = 'subscribe_success') as successes,
      count(*) filter (where kind = 'subscribe_abandon') as abandons,
      count(*) filter (where kind = 'cancel')            as cancels
    from public.subscription_events
    where created_at >= v_since
  )
  select jsonb_build_object(
    'views', views,
    'clicks', clicks,
    'attempts', attempts,
    'successes', successes,
    'abandons', abandons,
    'cancels', cancels,
    'view_to_click_rate', case when views > 0 then round((clicks::numeric / views) * 100, 1) else 0 end,
    'click_to_attempt_rate', case when clicks > 0 then round((attempts::numeric / clicks) * 100, 1) else 0 end,
    'attempt_to_success_rate', case when attempts > 0 then round((successes::numeric / attempts) * 100, 1) else 0 end,
    'overall_conversion_rate', case when views > 0 then round((successes::numeric / views) * 100, 2) else 0 end,
    'abandon_rate', case when attempts > 0 then round((abandons::numeric / attempts) * 100, 1) else 0 end
  )
  into v_funnel
  from funnel;

  -- ── CHURN (30j) ───────────────────────────────────────────────────────
  with churn_base as (
    select count(*) as denom
      from public.subscriptions
     where created_at < v_since
       and (status in ('active', 'trialing') or (status = 'cancelled' and updated_at >= v_since))
  ),
  churned as (
    select count(*) as num
      from public.subscriptions
     where status = 'cancelled'
       and updated_at >= v_since
  )
  select jsonb_build_object(
    'churned_count', num,
    'denominator', denom,
    'churn_rate', case when denom > 0 then round((num::numeric / denom) * 100, 2) else 0 end
  )
  into v_churn
  from churn_base, churned;

  -- ── PER PLAN ──────────────────────────────────────────────────────────
  with plan_metrics as (
    select
      p.code,
      p.display_name,
      p.price_monthly_xof,
      p.is_recommended,
      p.is_prestige,
      p.display_order,
      coalesce(count(s.id) filter (
        where s.status in ('active', 'trialing')
      ), 0) as active_subs,
      coalesce(sum(
        case when s.status in ('active', 'trialing')
          then case when s.billing_period = 'monthly'
                    then p.price_monthly_xof
                    else (p.price_yearly_xof / 12)::bigint
               end
          else 0
        end
      ), 0)::bigint as mrr_xof,
      (
        select count(*) from public.subscription_events e
         where e.plan_code = p.code
           and e.kind = 'plan_click'
           and e.created_at >= v_since
      ) as clicks_30d,
      (
        select count(*) from public.subscription_events e
         where e.plan_code = p.code
           and e.kind = 'subscribe_success'
           and e.created_at >= v_since
      ) as successes_30d
    from public.subscription_plans p
    left join public.subscriptions s on s.plan_code = p.code
    group by p.code, p.display_name, p.price_monthly_xof,
             p.is_recommended, p.is_prestige, p.display_order
    order by p.display_order
  )
  select jsonb_agg(to_jsonb(plan_metrics))
  into v_per_plan
  from plan_metrics;

  -- ── BY DAY (timeseries 30j) ───────────────────────────────────────────
  with days as (
    select generate_series(
      date_trunc('day', v_since),
      date_trunc('day', now()),
      '1 day'::interval
    )::date as d
  ),
  events_per_day as (
    select date_trunc('day', created_at)::date as d,
      count(*) filter (where kind = 'plan_view')         as views,
      count(*) filter (where kind = 'plan_click')        as clicks,
      count(*) filter (where kind = 'subscribe_success') as successes
    from public.subscription_events
    where created_at >= v_since
    group by 1
  ),
  subs_per_day as (
    select date_trunc('day', created_at)::date as d,
      count(*) as new_subs,
      count(*) filter (where plan_code <> 'free') as new_paid_subs
    from public.subscriptions
    where created_at >= v_since
    group by 1
  )
  select jsonb_agg(jsonb_build_object(
    'day', to_char(d, 'YYYY-MM-DD'),
    'views',         coalesce(epd.views, 0),
    'clicks',        coalesce(epd.clicks, 0),
    'successes',     coalesce(epd.successes, 0),
    'new_subs',      coalesce(spd.new_subs, 0),
    'new_paid_subs', coalesce(spd.new_paid_subs, 0)
  ) order by d)
  into v_by_day
  from days
  left join events_per_day epd using (d)
  left join subs_per_day  spd using (d);

  -- ── RECENT EVENTS (debug, derniers 50) ───────────────────────────────
  select jsonb_agg(to_jsonb(e) order by e.created_at desc)
  into v_recent
  from (
    select id, user_id, session_id, kind, plan_code, metadata, created_at
      from public.subscription_events
     order by created_at desc
     limit 50
  ) e;

  return jsonb_build_object(
    'window_days',   v_window,
    'generated_at',  now(),
    'totals',        v_totals,
    'funnel',        v_funnel,
    'churn',         v_churn,
    'per_plan',      coalesce(v_per_plan, '[]'::jsonb),
    'by_day',        coalesce(v_by_day, '[]'::jsonb),
    'recent_events', coalesce(v_recent, '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_list_subscribers(
  p_search        text default null,
  p_status_filter text default 'all',
  p_plan_filter   text default 'all',
  p_limit         integer default 50,
  p_offset        integer default 0
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_status text := lower(coalesce(p_status_filter, 'all'));
  v_plan   text := lower(coalesce(p_plan_filter, 'all'));
  v_limit  integer := greatest(1, least(coalesce(p_limit, 50), 200));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_total  integer;
  v_rows   jsonb;
begin
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED';
  end if;

  with candidates as (
    select distinct user_id from public.subscriptions
    union
    select distinct user_id from public.transactions
     where type = 'payment'
       and status = 'success'
       and provider = 'paystack'
       and metadata->>'purpose' = 'subscription'
  ),
  current_sub as (
    select distinct on (s.user_id)
      s.user_id,
      s.id as sub_id,
      s.plan_code,
      s.status,
      s.billing_period,
      s.current_period_start,
      s.current_period_end,
      s.cancel_at_period_end,
      s.auto_renew,
      s.last_card_brand,
      s.last_card_last4
    from public.subscriptions s
    order by s.user_id,
      case when s.status in ('active', 'trialing') then 0
           when s.status = 'past_due' then 1
           else 2 end,
      s.created_at desc
  ),
  totals as (
    select c.user_id,
      coalesce((
        select sum(amount_xof)::bigint
          from public.transactions t
         where t.user_id = c.user_id
           and t.type = 'payment'
           and t.status = 'success'
           and t.provider = 'paystack'
           and t.metadata->>'purpose' = 'subscription'
      ), 0) as total_paid_xof,
      coalesce((
        select count(*)::integer from public.transactions t
         where t.user_id = c.user_id
           and t.type = 'payment'
           and t.status = 'success'
           and t.provider = 'paystack'
           and t.metadata->>'purpose' = 'subscription'
      ), 0) as payment_count,
      -- Historique cashback conservé (audit comptable), plus de nouvelle
      -- génération depuis la migration 0069.
      coalesce((
        select sum(amount_xof)::bigint from public.transactions t
         where t.user_id = c.user_id
           and t.type = 'cashback'
           and t.status = 'success'
      ), 0) as cashback_received_xof,
      coalesce((
        select count(*)::integer from public.transactions t
         where t.user_id = c.user_id
           and t.type = 'cashback'
           and t.status = 'success'
      ), 0) as cashback_count,
      (select count(*)::integer from public.subscriptions s
        where s.user_id = c.user_id) as sub_count,
      (select max(t.completed_at) from public.transactions t
        where t.user_id = c.user_id
          and t.type = 'payment'
          and t.status = 'success'
          and t.provider = 'paystack'
          and t.metadata->>'purpose' = 'subscription') as last_payment_at
    from candidates c
  ),
  enriched as (
    select
      c.user_id,
      p.full_name,
      p.phone,
      p.email,
      p.kyc_status,
      p.created_at as user_created_at,
      cs.sub_id,
      cs.plan_code,
      pl.display_name as plan_display_name,
      pl.price_monthly_xof,
      pl.price_yearly_xof,
      cs.status,
      cs.billing_period,
      cs.current_period_start,
      cs.current_period_end,
      cs.cancel_at_period_end,
      cs.auto_renew,
      cs.last_card_brand,
      cs.last_card_last4,
      t.total_paid_xof,
      t.payment_count,
      t.cashback_received_xof,
      t.cashback_count,
      (t.total_paid_xof - t.cashback_received_xof) as ltv_xof,
      t.sub_count,
      t.last_payment_at,
      case
        when cs.status in ('active', 'trialing') and cs.plan_code <> 'free' then
          case when cs.billing_period = 'monthly'
               then pl.price_monthly_xof
               else (pl.price_yearly_xof / 12)::bigint
          end
        else 0
      end as mrr_xof
    from candidates c
    left join public.profiles p   on p.id = c.user_id
    left join current_sub    cs on cs.user_id = c.user_id
    left join public.subscription_plans pl on pl.code = cs.plan_code
    join totals t on t.user_id = c.user_id
  ),
  filtered as (
    select * from enriched
    where
      (v_search is null or
        (full_name ilike '%' || v_search || '%') or
        (phone ilike '%' || v_search || '%') or
        (email ilike '%' || v_search || '%')
      )
      and (v_status = 'all' or status::text = v_status)
      and (v_plan = 'all' or plan_code::text = v_plan)
  )
  select
    count(*) into v_total
  from filtered;

  with candidates as (
    select distinct user_id from public.subscriptions
    union
    select distinct user_id from public.transactions
     where type = 'payment'
       and status = 'success'
       and provider = 'paystack'
       and metadata->>'purpose' = 'subscription'
  ),
  current_sub as (
    select distinct on (s.user_id)
      s.user_id, s.id as sub_id, s.plan_code, s.status, s.billing_period,
      s.current_period_start, s.current_period_end, s.cancel_at_period_end,
      s.auto_renew, s.last_card_brand, s.last_card_last4
    from public.subscriptions s
    order by s.user_id,
      case when s.status in ('active', 'trialing') then 0
           when s.status = 'past_due' then 1
           else 2 end,
      s.created_at desc
  ),
  totals as (
    select c.user_id,
      coalesce((select sum(amount_xof)::bigint from public.transactions t
        where t.user_id = c.user_id and t.type = 'payment'
          and t.status = 'success' and t.provider = 'paystack'
          and t.metadata->>'purpose' = 'subscription'), 0) as total_paid_xof,
      coalesce((select count(*)::integer from public.transactions t
        where t.user_id = c.user_id and t.type = 'payment'
          and t.status = 'success' and t.provider = 'paystack'
          and t.metadata->>'purpose' = 'subscription'), 0) as payment_count,
      coalesce((select sum(amount_xof)::bigint from public.transactions t
        where t.user_id = c.user_id and t.type = 'cashback'
          and t.status = 'success'), 0) as cashback_received_xof,
      coalesce((select count(*)::integer from public.transactions t
        where t.user_id = c.user_id and t.type = 'cashback'
          and t.status = 'success'), 0) as cashback_count,
      (select count(*)::integer from public.subscriptions s
        where s.user_id = c.user_id) as sub_count,
      (select max(t.completed_at) from public.transactions t
        where t.user_id = c.user_id and t.type = 'payment'
          and t.status = 'success' and t.provider = 'paystack'
          and t.metadata->>'purpose' = 'subscription') as last_payment_at
    from candidates c
  ),
  enriched as (
    select
      c.user_id, p.full_name, p.phone, p.email, p.kyc_status,
      p.created_at as user_created_at,
      cs.sub_id, cs.plan_code, pl.display_name as plan_display_name,
      pl.price_monthly_xof, pl.price_yearly_xof,
      cs.status, cs.billing_period,
      cs.current_period_start, cs.current_period_end,
      cs.cancel_at_period_end, cs.auto_renew,
      cs.last_card_brand, cs.last_card_last4,
      t.total_paid_xof, t.payment_count,
      t.cashback_received_xof, t.cashback_count,
      (t.total_paid_xof - t.cashback_received_xof) as ltv_xof,
      t.sub_count, t.last_payment_at,
      case
        when cs.status in ('active', 'trialing') and cs.plan_code <> 'free' then
          case when cs.billing_period = 'monthly'
               then pl.price_monthly_xof
               else (pl.price_yearly_xof / 12)::bigint
          end
        else 0
      end as mrr_xof
    from candidates c
    left join public.profiles p on p.id = c.user_id
    left join current_sub cs on cs.user_id = c.user_id
    left join public.subscription_plans pl on pl.code = cs.plan_code
    join totals t on t.user_id = c.user_id
  ),
  filtered as (
    select * from enriched
    where
      (v_search is null or
        (full_name ilike '%' || v_search || '%') or
        (phone ilike '%' || v_search || '%') or
        (email ilike '%' || v_search || '%')
      )
      and (v_status = 'all' or status::text = v_status)
      and (v_plan = 'all' or plan_code::text = v_plan)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', f.user_id,
    'full_name', f.full_name,
    'phone', f.phone,
    'email', f.email,
    'kyc_status', f.kyc_status,
    'user_created_at', f.user_created_at,
    'sub_id', f.sub_id,
    'plan_code', f.plan_code,
    'plan_display_name', f.plan_display_name,
    'status', f.status,
    'billing_period', f.billing_period,
    'current_period_start', f.current_period_start,
    'current_period_end', f.current_period_end,
    'cancel_at_period_end', f.cancel_at_period_end,
    'auto_renew', f.auto_renew,
    'last_card_brand', f.last_card_brand,
    'last_card_last4', f.last_card_last4,
    'total_paid_xof', f.total_paid_xof,
    'cashback_received_xof', f.cashback_received_xof,
    'ltv_xof', f.ltv_xof,
    'mrr_xof', f.mrr_xof,
    'payment_count', f.payment_count,
    'cashback_count', f.cashback_count,
    'sub_count', f.sub_count,
    'last_payment_at', f.last_payment_at
  ) order by
    case when f.status in ('active', 'trialing') then 0
         when f.status = 'past_due' then 1
         else 2 end,
    f.ltv_xof desc nulls last,
    f.full_name asc nulls last
  ), '[]'::jsonb)
  into v_rows
  from filtered f
  limit v_limit
  offset v_offset;

  return jsonb_build_object(
    'rows', v_rows,
    'total_count', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'generated_at', now()
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 3) Retire la colonne cashback_bps (plus aucune fonction ne la référence)
-- ----------------------------------------------------------------------------

alter table public.subscription_plans drop column if exists cashback_bps;

comment on function public.admin_subscription_stats is
  'Agrège totals + funnel + churn + per_plan + by_day + recent_events pour l''onglet "Abonnements" du dashboard /admin. Réservée aux admins. (0069 : retrait de cashback_bps, colonne supprimée.)';
comment on function public.admin_list_subscribers is
  'Liste paginée des abonnés pour /admin?tab=subscribers. Calcule total_paid, cashback_received (historique), LTV, MRR par user. Réservée is_admin(). (0069 : retrait de plan_cashback_bps, colonne supprimée.)';
