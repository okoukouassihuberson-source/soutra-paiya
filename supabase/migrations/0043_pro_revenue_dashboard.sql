-- ============================================================================
-- SOUTRA-PAIYA — Migration 0043 : Pro Dashboard — vue revenus côté gérant
-- ============================================================================
-- Permet au propriétaire d'un venue de voir, depuis /pro :
--   • Revenus bruts (montant total des flux : réservations, tickets, paiements)
--   • Commission Soutra-Playce prélevée
--   • Revenus nets (ce qu'il garde réellement)
--   • Ventilation par source (resa / ticket / payment)
--   • Timeline jour par jour (14/30/90j)
--   • Frais qui lui sont facturés (mise en avant, certification, etc.)
--
-- Architecture : 3 RPCs SECURITY DEFINER qui vérifient que l'appelant est
-- bien le owner_id du venue cible (sinon NOT_OWNER).
--
-- Non-cassant : aucune table modifiée. Réutilise monetization_revenue_log
-- (0041) avec les triggers automatiques de 0042.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Helper : assert que le caller est owner du venue (ou admin)
-- ----------------------------------------------------------------------------

create or replace function public.assert_venue_owner_or_admin(p_venue_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_owner uuid;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if public.is_admin() then return; end if;

  select owner_id into v_owner from public.venues where id = p_venue_id limit 1;
  if v_owner is null then raise exception 'VENUE_NOT_FOUND'; end if;
  if v_owner <> v_uid then raise exception 'NOT_OWNER'; end if;
end;
$$;

grant execute on function public.assert_venue_owner_or_admin(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 2) RPC : KPIs revenus pour un venue
--    Renvoie un JSON unique pour les 4 cards principales.
-- ----------------------------------------------------------------------------

create or replace function public.get_pro_revenue_summary(
  p_venue_id uuid,
  p_from     timestamptz default (now() - interval '30 days'),
  p_to       timestamptz default now()
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_total_commission bigint := 0;  -- ce que Soutra-Playce prélève
  v_total_billable   bigint := 0;  -- ce qu'on facture (mise en avant, etc.)
  v_gross_base       bigint := 0;  -- montant brut des flux (base sur laquelle on a pris commission)
  v_event_count      bigint := 0;
  v_resa_count       bigint := 0;
  v_ticket_count     bigint := 0;
  v_payment_count    bigint := 0;
  v_prev_commission  bigint := 0;
  v_period_len       interval;
begin
  perform public.assert_venue_owner_or_admin(p_venue_id);

  -- Revenus de la plateforme (= commissions retenues sur ce venue)
  select
    coalesce(sum(amount_xof), 0),
    count(*),
    coalesce(sum(case when kind = 'reservation_commission_pct' then 1 else 0 end), 0),
    coalesce(sum(case when kind = 'ticket_commission' then 1 else 0 end), 0),
    coalesce(sum(case when kind = 'payment_commission' then 1 else 0 end), 0),
    coalesce(sum(case
      when kind in (
        'featured_listing','advertising','account_verification',
        'venue_certification','event_publication','promo_publication'
      ) then amount_xof else 0
    end), 0)
  into v_total_commission, v_event_count,
       v_resa_count, v_ticket_count, v_payment_count,
       v_total_billable
  from public.monetization_revenue_log
   where venue_id = p_venue_id
     and ts >= p_from and ts < p_to;

  -- Base brute = somme des base_xof passés au compute (lu dans metadata->'fee_detail')
  -- Plus simple : base = commission / (pct/100) → on prend une approx via la métadata
  -- ou on additionne les montants des flux source eux-mêmes.
  -- Approche pragmatique : on calcule depuis les tables source pour rester exact.

  -- Réservations honorées (deposit ou estimation)
  select coalesce(sum(coalesce(r.deposit_xof,
    coalesce((select avg_price_xof from public.venues where id = r.venue_id), 0)
      * coalesce(r.party_size, 1)
  )), 0)
    into v_gross_base
    from public.reservations r
   where r.venue_id = p_venue_id
     and r.status = 'arrived'
     and r.created_at >= p_from and r.created_at < p_to;

  -- + montant total des tickets vendus pour les events de ce venue
  v_gross_base := v_gross_base + coalesce((
    select sum(t.price_xof)::bigint
      from public.tickets t
      join public.events e on e.id = t.event_id
     where e.venue_id = p_venue_id
       and t.status = 'valid'
       and t.created_at >= p_from and t.created_at < p_to
  ), 0);

  -- + montant des paiements liés (via reservation)
  v_gross_base := v_gross_base + coalesce((
    select sum(tx.amount_xof)::bigint
      from public.transactions tx
      join public.reservations r on r.id = tx.reservation_id
     where r.venue_id = p_venue_id
       and tx.status = 'success'
       and tx.type in ('payment', 'split')
       and tx.created_at >= p_from and tx.created_at < p_to
  ), 0);

  -- Période précédente pour la variation
  v_period_len := p_to - p_from;
  select coalesce(sum(amount_xof), 0)
    into v_prev_commission
    from public.monetization_revenue_log
   where venue_id = p_venue_id
     and ts >= (p_from - v_period_len) and ts < p_from;

  return jsonb_build_object(
    'gross_xof',           v_gross_base,
    'commission_xof',      v_total_commission,
    'net_xof',             greatest(0, v_gross_base - v_total_commission),
    'billable_xof',        v_total_billable,
    'event_count',         v_event_count,
    'reservation_events',  v_resa_count,
    'ticket_events',       v_ticket_count,
    'payment_events',      v_payment_count,
    'previous_commission_xof', v_prev_commission,
    'delta_pct',
      case when v_prev_commission > 0
        then round(((v_total_commission - v_prev_commission) * 100.0 / v_prev_commission)::numeric, 1)
        else null
      end,
    'commission_rate_pct',
      case when v_gross_base > 0
        then round((v_total_commission * 100.0 / v_gross_base)::numeric, 2)
        else 0
      end
  );
end;
$$;

revoke execute on function public.get_pro_revenue_summary(uuid, timestamptz, timestamptz) from public;
grant execute on function public.get_pro_revenue_summary(uuid, timestamptz, timestamptz) to authenticated;

-- ----------------------------------------------------------------------------
-- 3) RPC : ventilation par source (kind)
-- ----------------------------------------------------------------------------

create or replace function public.get_pro_revenue_by_kind(
  p_venue_id uuid,
  p_from     timestamptz default (now() - interval '30 days'),
  p_to       timestamptz default now()
) returns table (
  kind        text,
  total_xof   bigint,
  event_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.assert_venue_owner_or_admin(p_venue_id);
  return query
    select l.kind::text, sum(l.amount_xof)::bigint, count(*)::bigint
      from public.monetization_revenue_log l
     where l.venue_id = p_venue_id
       and l.ts >= p_from and l.ts < p_to
     group by l.kind
     order by 2 desc nulls last;
end;
$$;

revoke execute on function public.get_pro_revenue_by_kind(uuid, timestamptz, timestamptz) from public;
grant execute on function public.get_pro_revenue_by_kind(uuid, timestamptz, timestamptz) to authenticated;

-- ----------------------------------------------------------------------------
-- 4) RPC : timeline jour par jour
-- ----------------------------------------------------------------------------

create or replace function public.get_pro_revenue_timeline(
  p_venue_id uuid,
  p_days     integer default 30
) returns table (
  day             date,
  gross_xof       bigint,
  commission_xof  bigint,
  net_xof         bigint,
  event_count     bigint
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_from timestamptz := now() - (greatest(p_days, 1) * interval '1 day');
begin
  perform public.assert_venue_owner_or_admin(p_venue_id);

  return query
    with days as (
      select generate_series(date_trunc('day', v_from), date_trunc('day', now()), interval '1 day')::date as d
    ),
    -- Réservations arrivées : base brute = deposit ou estimation
    resa as (
      select date_trunc('day', r.created_at)::date as d,
             sum(coalesce(r.deposit_xof,
               coalesce((select avg_price_xof from public.venues where id = r.venue_id), 0)
                 * coalesce(r.party_size, 1)
             ))::bigint as base
        from public.reservations r
       where r.venue_id = p_venue_id and r.status = 'arrived' and r.created_at >= v_from
       group by 1
    ),
    -- Tickets vendus
    tix as (
      select date_trunc('day', t.created_at)::date as d,
             sum(t.price_xof)::bigint as base
        from public.tickets t
        join public.events e on e.id = t.event_id
       where e.venue_id = p_venue_id and t.status = 'valid' and t.created_at >= v_from
       group by 1
    ),
    -- Paiements liés
    pays as (
      select date_trunc('day', tx.created_at)::date as d,
             sum(tx.amount_xof)::bigint as base
        from public.transactions tx
        join public.reservations r on r.id = tx.reservation_id
       where r.venue_id = p_venue_id and tx.status = 'success'
         and tx.type in ('payment', 'split') and tx.created_at >= v_from
       group by 1
    ),
    -- Commissions Soutra-Playce
    comm as (
      select date_trunc('day', l.ts)::date as d,
             sum(l.amount_xof)::bigint as commission_xof,
             count(*)::bigint as event_count
        from public.monetization_revenue_log l
       where l.venue_id = p_venue_id and l.ts >= v_from
       group by 1
    )
    select
      days.d as day,
      (coalesce(resa.base, 0) + coalesce(tix.base, 0) + coalesce(pays.base, 0))::bigint as gross_xof,
      coalesce(comm.commission_xof, 0) as commission_xof,
      greatest(0,
        (coalesce(resa.base, 0) + coalesce(tix.base, 0) + coalesce(pays.base, 0))::bigint
        - coalesce(comm.commission_xof, 0)
      ) as net_xof,
      coalesce(comm.event_count, 0) as event_count
    from days
    left join resa on resa.d = days.d
    left join tix  on tix.d  = days.d
    left join pays on pays.d = days.d
    left join comm on comm.d = days.d
    order by days.d;
end;
$$;

revoke execute on function public.get_pro_revenue_timeline(uuid, integer) from public;
grant execute on function public.get_pro_revenue_timeline(uuid, integer) to authenticated;

-- ----------------------------------------------------------------------------
-- 5) RPC : derniers events monétaires détaillés (table pour transparence)
-- ----------------------------------------------------------------------------

create or replace function public.list_pro_revenue_events(
  p_venue_id uuid,
  p_limit    integer default 50
) returns table (
  id              uuid,
  ts              timestamptz,
  kind            text,
  amount_xof      bigint,
  reservation_id  uuid,
  ticket_id       uuid,
  transaction_id  uuid,
  rule_name       text,
  metadata        jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.assert_venue_owner_or_admin(p_venue_id);
  return query
    select l.id, l.ts, l.kind::text, l.amount_xof,
           l.reservation_id, l.ticket_id, l.transaction_id,
           r.name as rule_name,
           l.metadata
      from public.monetization_revenue_log l
      left join public.monetization_rules r on r.id = l.rule_id
     where l.venue_id = p_venue_id
     order by l.ts desc
     limit greatest(1, least(coalesce(p_limit, 50), 500));
end;
$$;

revoke execute on function public.list_pro_revenue_events(uuid, integer) from public;
grant execute on function public.list_pro_revenue_events(uuid, integer) to authenticated;

-- ----------------------------------------------------------------------------
-- 6) RPC : liste des venues dont l'utilisateur est owner
--    Pratique pour le sélecteur multi-venues sur /pro.
-- ----------------------------------------------------------------------------

create or replace function public.list_my_pro_venues()
returns table (
  id        uuid,
  name      text,
  category  text,
  city      text,
  district  text,
  cover_url text,
  status    text
)
language sql
stable
security invoker
set search_path = public
as $$
  select v.id, v.name, v.category::text, v.city, v.district, v.cover_url, v.status::text
    from public.venues v
   where v.owner_id = auth.uid()
   order by v.created_at desc;
$$;

grant execute on function public.list_my_pro_venues() to authenticated;

-- ----------------------------------------------------------------------------
-- 7) Commentaires
-- ----------------------------------------------------------------------------

comment on function public.get_pro_revenue_summary is
  'KPIs revenus côté gérant : brut, commission Soutra-Playce, net, frais facturés + variation période préc.';
comment on function public.get_pro_revenue_by_kind is
  'Ventilation des revenus par kind monétaire pour un venue donné.';
comment on function public.get_pro_revenue_timeline is
  'Timeline jour par jour (brut/commission/net) — alimente le graphique pro.';
comment on function public.list_pro_revenue_events is
  'Détail des events monétaires d''un venue : transparence pour le gérant.';
comment on function public.list_my_pro_venues is
  'Liste des venues dont l''utilisateur courant est propriétaire.';
