-- 0096 — Statistiques de l'espace organisateur (graphiques)
--
-- get_organizer_analytics(p_days) : une seule RPC en lecture seule, limitée aux voyages et
-- activités de l'appelant (organizer_id = auth.uid()). Aucune donnée d'un autre organisateur.
--   • series  : par jour (fuseau Africa/Abidjan) — réservations créées, encaissements (paiements reçus)
--   • totals  : période courante vs période précédente de même durée (réservations, encaissé, places)
--   • top     : meilleurs voyages/activités par encaissé sur la période
--   • fill    : taux de remplissage des prochains voyages
--   • status  : répartition des réservations de la période par statut
-- Les « vues de fiche » ne sont pas mesurées : il n'existe aucune table d'audience.

create or replace function public.get_organizer_analytics(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  d      integer := greatest(7, least(coalesce(p_days, 30), 365));
  tz     constant text := 'Africa/Abidjan';
  today  date := (now() at time zone tz)::date;
  start_ date := (now() at time zone tz)::date - (greatest(7, least(coalesce(p_days, 30), 365)) - 1);
  prev_  date := (now() at time zone tz)::date - (2 * greatest(7, least(coalesce(p_days, 30), 365)) - 1);
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;

  return (
    with
    tb as (  -- réservations de voyages de l'appelant
      select b.id, b.trip_id as item_id, 'trip'::text as kind, b.participants, b.status,
             (b.created_at at time zone tz)::date as day
        from trip_bookings b join trips t on t.id = b.trip_id where t.organizer_id = auth.uid()
    ),
    ab as (
      select b.id, b.activity_id as item_id, 'activity'::text as kind, b.participants, b.status,
             (b.created_at at time zone tz)::date as day
        from activity_bookings b join activities a on a.id = b.activity_id where a.organizer_id = auth.uid()
    ),
    bk as (select * from tb union all select * from ab),
    pay as (  -- encaissements (date du paiement)
      select p.amount_xof, (p.created_at at time zone tz)::date as day, b.item_id, b.kind
        from trip_payments p join tb b on b.id = p.booking_id
      union all
      select p.amount_xof, (p.created_at at time zone tz)::date, b.item_id, b.kind
        from activity_payments p join ab b on b.id = p.booking_id
    ),
    days as (select generate_series(start_, today, interval '1 day')::date as day)
    select jsonb_build_object(
      'days', d,
      'from', start_,
      'series', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'day', x.day,
                 'bookings', (select count(*) from bk where bk.day = x.day and bk.status <> 'cancelled'),
                 'revenue_xof', (select coalesce(sum(amount_xof), 0) from pay where pay.day = x.day))
               order by x.day)
          from days x), '[]'::jsonb),
      'totals', jsonb_build_object(
        'bookings',       (select count(*) from bk where day between start_ and today and status <> 'cancelled'),
        'bookings_prev',  (select count(*) from bk where day between prev_ and start_ - 1 and status <> 'cancelled'),
        'revenue_xof',      (select coalesce(sum(amount_xof), 0) from pay where day between start_ and today),
        'revenue_prev_xof', (select coalesce(sum(amount_xof), 0) from pay where day between prev_ and start_ - 1),
        'seats',          (select coalesce(sum(participants), 0) from bk where day between start_ and today and status <> 'cancelled'),
        'seats_prev',     (select coalesce(sum(participants), 0) from bk where day between prev_ and start_ - 1 and status <> 'cancelled')),
      'top', coalesce((
        select jsonb_agg(row_to_json(r) order by r.revenue_xof desc, r.bookings desc) from (
          select p.kind, p.item_id as id,
                 coalesce(t.title, a.title) as title,
                 coalesce(sum(p.amount_xof), 0) as revenue_xof,
                 (select count(*) from bk where bk.item_id = p.item_id and bk.kind = p.kind
                     and bk.day between start_ and today and bk.status <> 'cancelled') as bookings
            from pay p
            left join trips t on p.kind = 'trip' and t.id = p.item_id
            left join activities a on p.kind = 'activity' and a.id = p.item_id
           where p.day between start_ and today
           group by p.kind, p.item_id, t.title, a.title
           order by 4 desc limit 8) r), '[]'::jsonb),
      'fill', coalesce((
        select jsonb_agg(row_to_json(f) order by f.starts_on) from (
          select t.id, t.title, t.starts_on, t.seats_total, t.seats_booked
            from trips t
           where t.organizer_id = auth.uid() and t.status in ('published', 'full') and t.starts_on >= today
           order by t.starts_on limit 8) f), '[]'::jsonb),
      'status', coalesce((
        select jsonb_agg(jsonb_build_object('status', s.status, 'count', s.n)) from (
          select status::text as status, count(*) as n from bk where day between start_ and today group by status) s), '[]'::jsonb)
    )
  );
end; $$;

revoke execute on function public.get_organizer_analytics(integer) from public;
grant execute on function public.get_organizer_analytics(integer) to authenticated;
