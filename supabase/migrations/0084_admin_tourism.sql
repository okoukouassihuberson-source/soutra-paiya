-- ============================================================================
-- SOUTRA PLAYCE V2 — Migration 0084 : administration du tourisme (additive)
-- ============================================================================
--   • admin_moderate_trip   : publier / clore / annuler un voyage, régler la
--                             commission et la mise en avant, avec trace dans
--                             audit_events
--   • admin_tourism_stats   : indicateurs du tableau de bord (voyages, places,
--                             chiffre d'affaires, commissions, tendances)
-- Réservé aux administrateurs (is_admin()).
-- ============================================================================

create or replace function public.admin_moderate_trip(
  p_trip_id        uuid,
  p_status         trip_status default null,
  p_commission_pct numeric default null,
  p_highlight      text default null,
  p_clear_highlight boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.trips%rowtype;
begin
  if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  if p_commission_pct is not null and (p_commission_pct < 0 or p_commission_pct > 100) then
    raise exception 'INVALID_COMMISSION';
  end if;
  if p_highlight is not null and p_highlight not in
     ('a_la_une','populaire','nouveau','promotion','coup_de_coeur','recommande') then
    raise exception 'INVALID_HIGHLIGHT';
  end if;

  select * into t from public.trips where id = p_trip_id for update;
  if not found then raise exception 'TRIP_NOT_FOUND'; end if;

  if p_status is not null then
    -- Transitions autorisées (jamais de retour vers 'draft' après publication).
    if not (
         (t.status = 'draft'     and p_status in ('published','cancelled'))
      or (t.status = 'published' and p_status in ('closed','cancelled'))
      or (t.status = 'full'      and p_status in ('closed','cancelled'))
      or (t.status = 'closed'    and p_status in ('published','cancelled'))
      or (t.status = p_status)
    ) then
      raise exception 'INVALID_TRANSITION';
    end if;
    if p_status = 'published' and t.starts_on <= current_date then
      raise exception 'TRIP_ALREADY_STARTED';
    end if;
    -- Republier un voyage complet le laisse 'full'.
    if p_status = 'published' and t.seats_booked >= t.seats_total then
      p_status := 'full';
    end if;
  end if;

  update public.trips
     set status         = coalesce(p_status, status),
         commission_pct = coalesce(p_commission_pct, commission_pct),
         highlight      = case when p_clear_highlight then null else coalesce(p_highlight, highlight) end
   where id = p_trip_id;

  insert into public.audit_events (actor_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'trip_moderated', 'trip', p_trip_id,
          jsonb_build_object('from_status', t.status, 'to_status', coalesce(p_status, t.status),
                             'commission_pct', p_commission_pct, 'highlight', p_highlight,
                             'clear_highlight', p_clear_highlight));

  return jsonb_build_object('ok', true);
end; $$;

create or replace function public.admin_tourism_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;

  select jsonb_build_object(
    'trips_total',        (select count(*) from trips),
    'trips_published',    (select count(*) from trips where status in ('published','full')),
    'trips_draft',        (select count(*) from trips where status = 'draft'),
    'trips_national',     (select count(*) from trips where scope = 'national' and status in ('published','full')),
    'trips_international',(select count(*) from trips where scope = 'international' and status in ('published','full')),
    'destinations',       (select count(*) from destinations where is_published),
    'bookings_total',     (select count(*) from trip_bookings where status <> 'cancelled'),
    'bookings_national',  (select count(*) from trip_bookings b join trips t on t.id = b.trip_id
                            where b.status <> 'cancelled' and t.scope = 'national'),
    'bookings_international', (select count(*) from trip_bookings b join trips t on t.id = b.trip_id
                            where b.status <> 'cancelled' and t.scope = 'international'),
    'seats_sold',         (select coalesce(sum(participants), 0) from trip_bookings where status <> 'cancelled'),
    'revenue_xof',        (select coalesce(sum(paid_xof), 0) from trip_bookings where status <> 'cancelled'),
    'outstanding_xof',    (select coalesce(sum(total_xof - paid_xof), 0) from trip_bookings where status in ('pending','confirmed')),
    -- Commission = pourcentage du voyage (NULL → 0) appliqué aux montants encaissés.
    'commission_xof',     (select coalesce(round(sum(b.paid_xof * coalesce(t.commission_pct, 0) / 100.0)), 0)
                             from trip_bookings b join trips t on t.id = b.trip_id where b.status <> 'cancelled'),
    'revenue_by_month',   coalesce((select jsonb_agg(jsonb_build_object('month', m, 'revenue_xof', r, 'bookings', c) order by m)
                             from (select to_char(date_trunc('month', p.created_at), 'YYYY-MM') as m,
                                          sum(p.amount_xof) as r,
                                          count(distinct p.booking_id) as c
                                     from trip_payments p
                                    where p.created_at > now() - interval '12 months'
                                    group by 1) x), '[]'::jsonb),
    'top_destinations',   coalesce((select jsonb_agg(jsonb_build_object('name', n, 'bookings', c, 'revenue_xof', r) order by r desc)
                             from (select coalesce(d.name, t.city, t.country) as n,
                                          count(*) as c, sum(b.paid_xof) as r
                                     from trip_bookings b
                                     join trips t on t.id = b.trip_id
                                     left join destinations d on d.id = t.destination_id
                                    where b.status <> 'cancelled'
                                    group by 1 order by sum(b.paid_xof) desc, count(*) desc limit 8) y), '[]'::jsonb)
  ) into v;
  return v;
end; $$;

revoke execute on function public.admin_moderate_trip(uuid, trip_status, numeric, text, boolean) from public;
revoke execute on function public.admin_tourism_stats() from public;
grant execute on function public.admin_moderate_trip(uuid, trip_status, numeric, text, boolean) to authenticated;
grant execute on function public.admin_tourism_stats() to authenticated;
