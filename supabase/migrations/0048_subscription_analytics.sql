-- ============================================================================
-- SOUTRA-PAIYA — Migration 0048 : analytics admin pour les abonnements
-- ============================================================================
-- Fournit une seule RPC `admin_subscription_stats` qui agrège tout ce dont
-- le dashboard admin a besoin pour l'onglet « Abonnements » :
--
--   • totals : abonnés actifs, MRR (revenu mensuel récurrent normalisé),
--     total events 30j, plans seedés
--   • funnel : views → clicks → attempts → successes → abandons (30j)
--   • churn  : abonnements cancelled sur 30j / abos actifs au début de
--     la fenêtre
--   • per_plan : abonnés actifs + revenus + part des conversions par plan
--   • by_day  : abonnés gagnés / perdus + events agrégés par jour (30j)
--   • recent_events : derniers 50 events bruts pour debug
--
-- Tout est calculé en SQL pour éviter au front un round-trip par section.
-- Réservée à is_admin() — RAISE si non admin.
-- ============================================================================

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
  -- MRR normalisé : un abo annuel compte comme price_yearly / 12 par mois.
  with active_subs as (
    select s.*, p.price_monthly_xof, p.price_yearly_xof, p.cashback_bps
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
  -- Approximation : nombre de cancellations sur la fenêtre / abos actifs
  -- au début de la fenêtre (souscrits avant v_since et toujours actifs ou
  -- cancelled après v_since).
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
      p.cashback_bps,
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
    group by p.code, p.display_name, p.price_monthly_xof, p.cashback_bps,
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

revoke execute on function public.admin_subscription_stats(integer) from public;
grant execute on function public.admin_subscription_stats(integer) to authenticated;

comment on function public.admin_subscription_stats is
  'Agrège totals + funnel + churn + per_plan + by_day + recent_events pour l''onglet "Abonnements" du dashboard /admin. Réservée aux admins.';
