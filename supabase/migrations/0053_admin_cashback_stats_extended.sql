-- ============================================================================
-- SOUTRA-PAIYA — Migration 0053 : admin_cashback_stats étendu pour dashboard
-- ============================================================================
-- Étend la RPC `admin_cashback_stats` de la migration 0051 pour alimenter
-- le nouveau dashboard admin /admin?tab=cashback. Ajoute :
--   • total_all_time_xof : cashback cumulé depuis le début (vs fenêtre)
--   • avg_per_user_xof   : moyenne sur la fenêtre
--   • by_day             : timeseries quotidienne (chart area)
--   • by_plan extended   : ajout du display_name + accent_color (join sur
--                          subscription_plans pour les couleurs UI)
--   • top_users          : leaderboard des 10 utilisateurs ayant reçu le
--                          plus de cashback sur la fenêtre (full_name, phone,
--                          total, count, last_cashback_at)
--   • recent_cashbacks   : 30 dernières transactions cashback (audit)
--
-- Backward compatible : tous les champs existants sont préservés. La RPC
-- reste `security definer + grant authenticated`, gate is_admin().
-- Réservée à is_admin(). Le moderator n'a pas accès aux analytics.
-- ============================================================================

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
  v_totals_all jsonb;
  v_totals_period jsonb;
  v_by_plan jsonb;
  v_by_day jsonb;
  v_top_users jsonb;
  v_recent jsonb;
begin
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED';
  end if;

  -- ── TOTALS ALL-TIME ────────────────────────────────────────────────────
  select jsonb_build_object(
    'total_all_time_xof', coalesce(sum(amount_xof), 0)::bigint,
    'count_all_time', count(*),
    'unique_users_all_time', count(distinct user_id)
  )
  into v_totals_all
  from public.transactions
  where type = 'cashback' and status = 'success';

  -- ── TOTALS PÉRIODE ─────────────────────────────────────────────────────
  with period as (
    select * from public.transactions
     where type = 'cashback' and status = 'success'
       and created_at >= v_since
  )
  select jsonb_build_object(
    'paid_out_xof', coalesce(sum(amount_xof), 0)::bigint,
    'count', count(*),
    'unique_users', count(distinct user_id),
    'avg_per_tx_xof', case when count(*) > 0 then (sum(amount_xof) / count(*))::bigint else 0 end,
    'avg_per_user_xof', case when count(distinct user_id) > 0
                              then (sum(amount_xof) / count(distinct user_id))::bigint
                              else 0 end
  )
  into v_totals_period
  from period;

  -- ── PAR PLAN (avec display_name + cashback_bps pour l'UI) ──────────────
  with by_plan as (
    select
      t.metadata->>'plan_code' as plan_code,
      sum(t.amount_xof)::bigint as total_xof,
      count(*) as count,
      count(distinct t.user_id) as unique_users
    from public.transactions t
    where t.type = 'cashback' and t.status = 'success'
      and t.created_at >= v_since
      and t.metadata->>'plan_code' is not null
    group by t.metadata->>'plan_code'
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'plan_code', bp.plan_code,
      'display_name', coalesce(p.display_name, bp.plan_code),
      'paid_out_xof', bp.total_xof,
      'count', bp.count,
      'unique_users', bp.unique_users,
      'cashback_bps', p.cashback_bps,
      'is_recommended', coalesce(p.is_recommended, false),
      'is_prestige', coalesce(p.is_prestige, false)
    )
    order by bp.total_xof desc
  ), '[]'::jsonb)
  into v_by_plan
  from by_plan bp
  left join public.subscription_plans p on p.code::text = bp.plan_code;

  -- ── TIMESERIES BY DAY ─────────────────────────────────────────────────
  with days as (
    select generate_series(
      date_trunc('day', v_since),
      date_trunc('day', now()),
      '1 day'::interval
    )::date as d
  ),
  per_day as (
    select date_trunc('day', created_at)::date as d,
           sum(amount_xof)::bigint as cashback_xof,
           count(*) as count
    from public.transactions
    where type = 'cashback' and status = 'success'
      and created_at >= v_since
    group by 1
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'day', to_char(d, 'YYYY-MM-DD'),
      'cashback_xof', coalesce(pd.cashback_xof, 0),
      'count', coalesce(pd.count, 0)
    ) order by d
  ), '[]'::jsonb)
  into v_by_day
  from days
  left join per_day pd using (d);

  -- ── TOP USERS (10 max sur la fenêtre) ──────────────────────────────────
  with top as (
    select
      t.user_id,
      sum(t.amount_xof)::bigint as total_xof,
      count(*) as count,
      max(t.created_at) as last_cashback_at
    from public.transactions t
    where t.type = 'cashback' and t.status = 'success'
      and t.created_at >= v_since
    group by t.user_id
    order by sum(t.amount_xof) desc
    limit 10
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'user_id', top.user_id,
      'full_name', p.full_name,
      'phone', p.phone,
      'total_xof', top.total_xof,
      'count', top.count,
      'last_cashback_at', top.last_cashback_at
    )
    order by top.total_xof desc
  ), '[]'::jsonb)
  into v_top_users
  from top
  left join public.profiles p on p.id = top.user_id;

  -- ── RECENT (30 dernières tx cashback, audit) ───────────────────────────
  with recent as (
    select t.id, t.user_id, t.amount_xof, t.metadata, t.created_at,
           p.full_name, p.phone
      from public.transactions t
      left join public.profiles p on p.id = t.user_id
     where t.type = 'cashback' and t.status = 'success'
     order by t.created_at desc
     limit 30
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'tx_id', id,
      'user_id', user_id,
      'full_name', full_name,
      'phone', phone,
      'amount_xof', amount_xof,
      'plan_code', metadata->>'plan_code',
      'source_amount_xof', metadata->>'source_amount_xof',
      'cashback_bps', metadata->>'cashback_bps',
      'created_at', created_at
    )
    order by created_at desc
  ), '[]'::jsonb)
  into v_recent
  from recent;

  -- ── PAYLOAD FINAL ──────────────────────────────────────────────────────
  -- Conserve les noms historiques pour compat ascendante du front si
  -- besoin, mais ajoute total_all_time_xof, by_day, top_users, recent.
  return jsonb_build_object(
    'window_days', v_window,
    'generated_at', now(),
    'totals', jsonb_build_object(
      'all_time', v_totals_all,
      'period', v_totals_period
    ),
    -- ─── Aliases compat ascendante (fields plats préservés) ───
    'total_paid_out_xof', v_totals_period->'paid_out_xof',
    'count_paid_out', v_totals_period->'count',
    'unique_users', v_totals_period->'unique_users',
    -- ─── Sections étendues ───
    'by_plan', v_by_plan,
    'by_day', v_by_day,
    'top_users', v_top_users,
    'recent_cashbacks', v_recent
  );
end;
$$;

revoke execute on function public.admin_cashback_stats(integer) from public;
grant execute on function public.admin_cashback_stats(integer) to authenticated;

comment on function public.admin_cashback_stats is
  'Stats globales cashback pour le dashboard /admin?tab=cashback. Inclut totals (all-time + période), by_plan avec display_name, timeseries by_day, top_users leaderboard, recent_cashbacks audit. Réservée is_admin().';
