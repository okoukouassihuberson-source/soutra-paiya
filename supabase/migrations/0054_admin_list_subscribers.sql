-- ============================================================================
-- SOUTRA-PAIYA — Migration 0054 : RPC admin_list_subscribers (vue agrégée)
-- ============================================================================
-- Alimente l'onglet /admin?tab=subscribers : un tableau paginé de tous les
-- utilisateurs qui ont (ou ont eu) un abonnement payant, avec leurs KPIs
-- agrégés pour le suivi commercial :
--   • profil (id, full_name, phone, email, kyc_status, created_at)
--   • plan actuel (code, display_name, statut, billing_period, period_end,
--     auto_renew, cancel_at_period_end, last_card_brand/last4)
--   • totaux à vie : total_paid_xof (toutes tx subscription success),
--     cashback_received_xof (toutes tx cashback success),
--     ltv_xof = total_paid - cashback (valeur nette pour le business)
--   • compteurs : sub_count, payment_count, cashback_count
--   • last_payment_at
--
-- Filtres :
--   • p_search       : full-text simple sur full_name OR phone OR email
--   • p_status_filter: 'all' | 'active' | 'past_due' | 'cancelled' | 'expired'
--   • p_plan_filter  : 'all' | code de plan
--   • p_limit + p_offset : pagination
--
-- Retour : jsonb { rows[], total_count }.
-- Réservée à is_admin().
-- ============================================================================

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

  -- ── BASE CANDIDATES ────────────────────────────────────────────────────
  -- On garde tout user qui :
  --   - a au moins 1 subscription (active ou historique)
  --   OU
  --   - a au moins 1 transaction Paystack purpose=subscription success
  -- Comme ça même les users churned restent visibles.
  with candidates as (
    select distinct user_id from public.subscriptions
    union
    select distinct user_id from public.transactions
     where type = 'payment'
       and status = 'success'
       and provider = 'paystack'
       and metadata->>'purpose' = 'subscription'
  ),
  -- ── CURRENT SUB (le plus récent actif ou récent tout court) ────────────
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
    -- Priorité : active/trialing/past_due en premier, puis le plus récent
    order by s.user_id,
      case when s.status in ('active', 'trialing') then 0
           when s.status = 'past_due' then 1
           else 2 end,
      s.created_at desc
  ),
  -- ── TOTAUX ─────────────────────────────────────────────────────────────
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
  -- ── ENRICH ─────────────────────────────────────────────────────────────
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
      pl.cashback_bps as plan_cashback_bps,
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
      -- MRR normalisé : pour subs actives uniquement
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
  -- ── FILTERS ────────────────────────────────────────────────────────────
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

  -- ── PAGE RESULTS ──────────────────────────────────────────────────────
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
      pl.cashback_bps as plan_cashback_bps,
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
    'plan_cashback_bps', f.plan_cashback_bps,
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
    -- Tri par défaut : actifs en haut puis LTV desc puis nom
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

revoke execute on function public.admin_list_subscribers(text, text, text, integer, integer) from public;
grant execute on function public.admin_list_subscribers(text, text, text, integer, integer) to authenticated;

comment on function public.admin_list_subscribers is
  'Liste paginée des abonnés (avec ou sans subscription active) pour /admin?tab=subscribers. Calcule total_paid, cashback_received, LTV, MRR par user. Réservée is_admin().';
