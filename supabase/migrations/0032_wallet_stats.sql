-- ============================================================================
-- SOUTRA-PAIYA — Migration 0032 : Statistiques wallet (dashboard)
-- ============================================================================
-- Une seule RPC `get_wallet_stats(period)` qui retourne en un appel tout ce
-- dont l'écran statistiques mobile a besoin :
--
--   {
--     "kpi":               { in_xof, out_xof, net_xof, count, period_label,
--                             period_from, period_to },
--     "by_type":           [{ type, in_xof, out_xof, count }, ...],
--     "daily":             [{ day, in_xof, out_xof }, ...]   (n derniers jours)
--     "top_counterparties":[{ user_id, full_name, phone, avatar_url,
--                             total_xof, count }, ...]      (top 5)
--   }
--
-- Périodes acceptées : '7d', '30d', '90d', '1y', 'all'.
-- "in" = crédit (transfer reçu, topup, refund, escrow_release).
-- "out" = débit (transfer envoyé, payment, withdraw, split, fee, escrow_hold).
--
-- Sécurité : SECURITY DEFINER + auth.uid() filtre — pas de policy à ajouter
-- aux transactions (déjà couvertes par tx_self).
-- ============================================================================

create or replace function get_wallet_stats(p_period text default '30d')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_from timestamptz;
  v_to timestamptz := now();
  v_period_label text;
  v_in bigint;
  v_out bigint;
  v_count integer;
  v_by_type jsonb;
  v_daily jsonb;
  v_top jsonb;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  case lower(coalesce(p_period, '30d'))
    when '7d'  then v_from := v_to - interval '7 days';  v_period_label := '7 derniers jours';
    when '30d' then v_from := v_to - interval '30 days'; v_period_label := '30 derniers jours';
    when '90d' then v_from := v_to - interval '90 days'; v_period_label := '90 derniers jours';
    when '1y'  then v_from := v_to - interval '365 days'; v_period_label := '12 derniers mois';
    when 'all' then v_from := 'epoch'::timestamptz;       v_period_label := 'Depuis le début';
    else v_from := v_to - interval '30 days'; v_period_label := '30 derniers jours';
  end case;

  -- ----- KPI -----
  -- "Crédit pour le caller" :
  --   - transfer reçu  → counterparty_id = caller
  --   - topup/refund/escrow_release → user_id = caller (toujours crédit)
  -- "Débit pour le caller" :
  --   - transfer envoyé / payment / split / withdraw / fee / escrow_hold
  --     avec user_id = caller
  with eligible as (
    select t.*,
           case
             when t.type = 'transfer' and t.counterparty_id = v_uid then true
             when t.type in ('topup','refund','escrow_release') and t.user_id = v_uid then true
             else false
           end as is_in,
           case
             when t.type = 'transfer' and t.user_id = v_uid then true
             when t.type in ('payment','split','withdraw','fee','escrow_hold') and t.user_id = v_uid then true
             else false
           end as is_out
      from transactions t
     where t.status = 'success'
       and t.created_at >= v_from
       and t.created_at <= v_to
       and (t.user_id = v_uid or t.counterparty_id = v_uid)
  )
  select
    coalesce(sum(amount_xof) filter (where is_in), 0)::bigint,
    coalesce(sum(amount_xof) filter (where is_out), 0)::bigint,
    coalesce(count(*) filter (where is_in or is_out), 0)::integer
    into v_in, v_out, v_count
    from eligible;

  -- ----- by_type (agrégation par type, in et out séparés) -----
  with eligible as (
    select t.*,
           case
             when t.type = 'transfer' and t.counterparty_id = v_uid then 'transfer_in'
             when t.type = 'transfer' and t.user_id = v_uid then 'transfer_out'
             when t.user_id = v_uid then t.type::text
             else null
           end as bucket,
           case
             when t.type = 'transfer' and t.counterparty_id = v_uid then true
             when t.type in ('topup','refund','escrow_release') and t.user_id = v_uid then true
             else false
           end as is_in,
           case
             when t.type = 'transfer' and t.user_id = v_uid then true
             when t.type in ('payment','split','withdraw','fee','escrow_hold') and t.user_id = v_uid then true
             else false
           end as is_out
      from transactions t
     where t.status = 'success'
       and t.created_at >= v_from
       and t.created_at <= v_to
       and (t.user_id = v_uid or t.counterparty_id = v_uid)
  )
  select coalesce(jsonb_agg(row), '[]'::jsonb) into v_by_type
    from (
      select jsonb_build_object(
        'type', bucket,
        'in_xof', coalesce(sum(amount_xof) filter (where is_in), 0),
        'out_xof', coalesce(sum(amount_xof) filter (where is_out), 0),
        'count', count(*)
      ) as row
      from eligible
      where bucket is not null and (is_in or is_out)
      group by bucket
      order by sum(amount_xof) desc
    ) sub;

  -- ----- daily (série journalière, in et out par jour, sur la période) -----
  -- on génère la grille de jours pour combler les trous (joins LEFT) — limité
  -- à 90 jours max pour les longues périodes (sinon la série devient illisible).
  with grid as (
    select day::date as day
      from generate_series(
        greatest(v_from, v_to - interval '90 days')::date,
        v_to::date,
        '1 day'::interval
      ) day
  ),
  eligible as (
    select t.*,
           case
             when t.type = 'transfer' and t.counterparty_id = v_uid then true
             when t.type in ('topup','refund','escrow_release') and t.user_id = v_uid then true
             else false
           end as is_in,
           case
             when t.type = 'transfer' and t.user_id = v_uid then true
             when t.type in ('payment','split','withdraw','fee','escrow_hold') and t.user_id = v_uid then true
             else false
           end as is_out
      from transactions t
     where t.status = 'success'
       and t.created_at >= v_from
       and t.created_at <= v_to
       and (t.user_id = v_uid or t.counterparty_id = v_uid)
  ),
  agg as (
    select date_trunc('day', created_at)::date as day,
           coalesce(sum(amount_xof) filter (where is_in), 0)::bigint as in_xof,
           coalesce(sum(amount_xof) filter (where is_out), 0)::bigint as out_xof
      from eligible
     where is_in or is_out
     group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'day', to_char(g.day, 'YYYY-MM-DD'),
           'in_xof', coalesce(a.in_xof, 0),
           'out_xof', coalesce(a.out_xof, 0)
         ) order by g.day asc), '[]'::jsonb)
    into v_daily
    from grid g
    left join agg a using (day);

  -- ----- top_counterparties (top 5 par volume total, in + out) -----
  with eligible as (
    select t.*,
           case
             when t.type = 'transfer' and t.user_id = v_uid then t.counterparty_id
             when t.type = 'transfer' and t.counterparty_id = v_uid then t.user_id
             else t.counterparty_id
           end as other_id
      from transactions t
     where t.status = 'success'
       and t.created_at >= v_from
       and t.created_at <= v_to
       and (t.user_id = v_uid or t.counterparty_id = v_uid)
       and t.type in ('transfer','split','payment')
  ),
  ranked as (
    select other_id, sum(amount_xof) as total_xof, count(*) as cnt
      from eligible
     where other_id is not null and other_id <> v_uid
     group by other_id
     order by total_xof desc
     limit 5
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', r.other_id,
           'full_name', p.full_name,
           'phone', p.phone,
           'avatar_url', p.avatar_url,
           'total_xof', r.total_xof,
           'count', r.cnt
         ) order by r.total_xof desc), '[]'::jsonb)
    into v_top
    from ranked r
    left join profiles p on p.id = r.other_id;

  return jsonb_build_object(
    'kpi', jsonb_build_object(
      'in_xof', coalesce(v_in, 0),
      'out_xof', coalesce(v_out, 0),
      'net_xof', coalesce(v_in, 0) - coalesce(v_out, 0),
      'count', coalesce(v_count, 0),
      'period', p_period,
      'period_label', v_period_label,
      'period_from', to_char(v_from, 'YYYY-MM-DD'),
      'period_to', to_char(v_to, 'YYYY-MM-DD')
    ),
    'by_type', coalesce(v_by_type, '[]'::jsonb),
    'daily', coalesce(v_daily, '[]'::jsonb),
    'top_counterparties', coalesce(v_top, '[]'::jsonb)
  );
end;
$$;

revoke execute on function get_wallet_stats(text) from public;
grant execute on function get_wallet_stats(text) to authenticated;

comment on function get_wallet_stats(text) is
  'Statistiques agrégées du wallet du caller pour une période (7d/30d/90d/1y/all). KPI + by_type + série journalière (90j max) + top 5 contreparties.';
