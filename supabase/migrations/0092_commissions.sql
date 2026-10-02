-- ============================================================================
-- 0092 — Commissions configurables (voyages et activités)
-- ============================================================================
-- Avant : commission_pct par voyage / activité (NULL = 0), appliquée a posteriori au
-- montant encaissé : modifier le taux réécrivait l'historique.
-- Maintenant (additif) :
--   • taux par défaut plateforme (voyages, activités) — 0 % tant que l'admin n'a rien réglé,
--     donc aucun changement de comportement à l'application de la migration ;
--   • surcharge par partenaire (organisateur / guide) ;
--   • priorité : taux du voyage/activité > taux du partenaire > taux par défaut ;
--   • la commission est FIGÉE à chaque encaissement (trip_payments / activity_payments :
--     commission_pct + commission_xof) : un changement de taux n'affecte que les paiements futurs ;
--   • statistiques admin basées sur ces montants figés ; rapport détaillé ; trace d'audit.
-- ============================================================================

create table if not exists public.tourism_commission_defaults (
  id           boolean primary key default true check (id),   -- une seule ligne
  trip_pct     numeric(5,2) not null default 0 check (trip_pct between 0 and 100),
  activity_pct numeric(5,2) not null default 0 check (activity_pct between 0 and 100),
  updated_by   uuid references public.profiles(id) on delete set null,
  updated_at   timestamptz not null default now()
);
insert into public.tourism_commission_defaults (id) values (true) on conflict do nothing;

create table if not exists public.organizer_commissions (
  organizer_id uuid primary key references public.profiles(id) on delete cascade,
  trip_pct     numeric(5,2) check (trip_pct is null or trip_pct between 0 and 100),
  activity_pct numeric(5,2) check (activity_pct is null or activity_pct between 0 and 100),
  note         text check (note is null or length(note) <= 300),
  updated_by   uuid references public.profiles(id) on delete set null,
  updated_at   timestamptz not null default now(),
  constraint organizer_commissions_not_empty check (trip_pct is not null or activity_pct is not null)
);

alter table public.tourism_commission_defaults enable row level security;
alter table public.organizer_commissions enable row level security;
-- Aucune politique d'écriture : tout passe par les RPC admin (SECURITY DEFINER).
drop policy if exists commission_defaults_admin on public.tourism_commission_defaults;
create policy commission_defaults_admin on public.tourism_commission_defaults for select to authenticated using (public.is_admin());
drop policy if exists organizer_commissions_select on public.organizer_commissions;
create policy organizer_commissions_select on public.organizer_commissions for select to authenticated
  using (public.is_admin() or organizer_id = auth.uid());

-- Taux effectif : élément > partenaire > défaut.
create or replace function public.effective_commission_pct(p_kind text, p_organizer uuid, p_item_pct numeric)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    p_item_pct,
    (select case when p_kind = 'trip' then oc.trip_pct else oc.activity_pct end
       from public.organizer_commissions oc where oc.organizer_id = p_organizer),
    (select case when p_kind = 'trip' then d.trip_pct else d.activity_pct end
       from public.tourism_commission_defaults d where d.id),
    0);
$$;

-- Commission figée à l'encaissement.
alter table public.trip_payments     add column if not exists commission_pct numeric(5,2), add column if not exists commission_xof bigint;
alter table public.activity_payments add column if not exists commission_pct numeric(5,2), add column if not exists commission_xof bigint;

create or replace function public.tg_trip_payment_commission()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_item numeric;
begin
  select t.organizer_id, t.commission_pct into v_org, v_item
    from public.trip_bookings b join public.trips t on t.id = b.trip_id where b.id = new.booking_id;
  new.commission_pct := public.effective_commission_pct('trip', v_org, v_item);
  new.commission_xof := round(new.amount_xof * new.commission_pct / 100.0);
  return new;
end; $$;
drop trigger if exists trg_trip_payment_commission on public.trip_payments;
create trigger trg_trip_payment_commission before insert on public.trip_payments
  for each row execute function public.tg_trip_payment_commission();

create or replace function public.tg_activity_payment_commission()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_item numeric;
begin
  select a.organizer_id, a.commission_pct into v_org, v_item
    from public.activity_bookings b join public.activities a on a.id = b.activity_id where b.id = new.booking_id;
  new.commission_pct := public.effective_commission_pct('activity', v_org, v_item);
  new.commission_xof := round(new.amount_xof * new.commission_pct / 100.0);
  return new;
end; $$;
drop trigger if exists trg_activity_payment_commission on public.activity_payments;
create trigger trg_activity_payment_commission before insert on public.activity_payments
  for each row execute function public.tg_activity_payment_commission();

-- Reprise de l'existant : même résultat que l'ancien calcul (taux de l'élément, NULL → 0).
update public.trip_payments p
   set commission_pct = coalesce(t.commission_pct, 0),
       commission_xof = round(p.amount_xof * coalesce(t.commission_pct, 0) / 100.0)
  from public.trip_bookings b join public.trips t on t.id = b.trip_id
 where b.id = p.booking_id and p.commission_xof is null;
update public.activity_payments p
   set commission_pct = coalesce(a.commission_pct, 0),
       commission_xof = round(p.amount_xof * coalesce(a.commission_pct, 0) / 100.0)
  from public.activity_bookings b join public.activities a on a.id = b.activity_id
 where b.id = p.booking_id and p.commission_xof is null;

-- Statistiques admin : commissions figées (le reste des fonctions est inchangé).
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
    -- Commission = somme des commissions figées à chaque encaissement (taux en vigueur à la date du paiement).
    'commission_xof',     (select coalesce(sum(p.commission_xof), 0)
                             from trip_payments p join trip_bookings b on b.id = p.booking_id where b.status <> 'cancelled'),
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

create or replace function public.admin_activity_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  return jsonb_build_object(
    'activities_published', (select count(*) from activities where status = 'published'),
    'activities_pending',   (select count(*) from activities where status = 'draft' and submitted_at is not null),
    'bookings',             (select count(*) from activity_bookings where status <> 'cancelled'),
    'participants',         (select coalesce(sum(participants), 0) from activity_bookings where status <> 'cancelled'),
    'revenue_xof',          (select coalesce(sum(paid_xof), 0) from activity_bookings where status <> 'cancelled'),
    'commission_xof',       (select coalesce(sum(p.commission_xof), 0)
                               from activity_payments p join activity_bookings b on b.id = p.booking_id where b.status <> 'cancelled'),
    'by_category', coalesce((select jsonb_agg(jsonb_build_object('category', c, 'bookings', n, 'revenue_xof', r) order by r desc)
                               from (select a.category c, count(*) n, coalesce(sum(b.paid_xof), 0) r
                                       from activity_bookings b join activities a on a.id = b.activity_id
                                      where b.status <> 'cancelled' group by 1) x), '[]'::jsonb),
    'reported_reviews', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'activity', a.title, 'rating', r.rating,
                                         'comment', r.comment, 'status', r.status, 'reports', x.n) order by x.n desc)
                               from (select review_id, count(*) n from activity_review_reports group by 1) x
                               join activity_reviews r on r.id = x.review_id join activities a on a.id = r.activity_id), '[]'::jsonb)
  );
end; $$;

-- ----------------------------------------------------------------------------
-- RPC admin
-- ----------------------------------------------------------------------------
create or replace function public.admin_set_commission_defaults(p_trip_pct numeric, p_activity_pct numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare o public.tourism_commission_defaults%rowtype;
begin
  if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  if p_trip_pct is null or p_activity_pct is null
     or p_trip_pct < 0 or p_trip_pct > 100 or p_activity_pct < 0 or p_activity_pct > 100 then
    raise exception 'INVALID_COMMISSION';
  end if;
  select * into o from public.tourism_commission_defaults where id;
  update public.tourism_commission_defaults
     set trip_pct = p_trip_pct, activity_pct = p_activity_pct, updated_by = auth.uid(), updated_at = now() where id;
  insert into public.audit_events (actor_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'commission_defaults_set', 'commission', null,
          jsonb_build_object('trip_from', o.trip_pct, 'trip_to', p_trip_pct, 'activity_from', o.activity_pct, 'activity_to', p_activity_pct));
  return jsonb_build_object('ok', true);
end; $$;

-- Surcharge partenaire ; deux NULL = suppression de la surcharge.
create or replace function public.admin_set_organizer_commission(
  p_organizer uuid, p_trip_pct numeric, p_activity_pct numeric, p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  if (p_trip_pct is not null and (p_trip_pct < 0 or p_trip_pct > 100))
     or (p_activity_pct is not null and (p_activity_pct < 0 or p_activity_pct > 100)) then
    raise exception 'INVALID_COMMISSION';
  end if;
  if not exists (select 1 from public.profiles where id = p_organizer) then raise exception 'ORGANIZER_NOT_FOUND'; end if;
  if p_trip_pct is null and p_activity_pct is null then
    delete from public.organizer_commissions where organizer_id = p_organizer;
  else
    insert into public.organizer_commissions (organizer_id, trip_pct, activity_pct, note, updated_by)
    values (p_organizer, p_trip_pct, p_activity_pct, nullif(trim(p_note), ''), auth.uid())
    on conflict (organizer_id) do update
      set trip_pct = excluded.trip_pct, activity_pct = excluded.activity_pct, note = excluded.note,
          updated_by = excluded.updated_by, updated_at = now();
  end if;
  insert into public.audit_events (actor_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'organizer_commission_set', 'profile', p_organizer,
          jsonb_build_object('trip_pct', p_trip_pct, 'activity_pct', p_activity_pct));
  return jsonb_build_object('ok', true);
end; $$;

create or replace function public.admin_commission_report()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  return jsonb_build_object(
    'defaults', (select jsonb_build_object('trip_pct', trip_pct, 'activity_pct', activity_pct) from public.tourism_commission_defaults where id),
    'overrides', coalesce((select jsonb_agg(jsonb_build_object('organizer_id', oc.organizer_id, 'name', p.full_name,
                    'trip_pct', oc.trip_pct, 'activity_pct', oc.activity_pct, 'note', oc.note) order by p.full_name)
                  from public.organizer_commissions oc join public.profiles p on p.id = oc.organizer_id), '[]'::jsonb),
    'totals', (select jsonb_build_object('collected_xof', coalesce(sum(amt), 0), 'commission_xof', coalesce(sum(com), 0))
                 from (select p.amount_xof amt, p.commission_xof com from public.trip_payments p
                         join public.trip_bookings b on b.id = p.booking_id where b.status <> 'cancelled'
                       union all
                       select p.amount_xof, p.commission_xof from public.activity_payments p
                         join public.activity_bookings b on b.id = p.booking_id where b.status <> 'cancelled') x),
    'by_month', coalesce((select jsonb_agg(jsonb_build_object('month', m, 'kind', k, 'collected_xof', amt, 'commission_xof', com) order by m, k)
                  from (select to_char(date_trunc('month', p.created_at), 'YYYY-MM') m, 'trip' k, sum(p.amount_xof) amt, sum(p.commission_xof) com
                          from public.trip_payments p join public.trip_bookings b on b.id = p.booking_id
                         where b.status <> 'cancelled' and p.created_at > now() - interval '12 months' group by 1
                        union all
                        select to_char(date_trunc('month', p.created_at), 'YYYY-MM'), 'activity', sum(p.amount_xof), sum(p.commission_xof)
                          from public.activity_payments p join public.activity_bookings b on b.id = p.booking_id
                         where b.status <> 'cancelled' and p.created_at > now() - interval '12 months' group by 1) x), '[]'::jsonb),
    'top_organizers', coalesce((select jsonb_agg(jsonb_build_object('organizer_id', o, 'name', n, 'collected_xof', amt, 'commission_xof', com) order by com desc)
                  from (select x.o, pr.full_name n, sum(x.amt) amt, sum(x.com) com
                          from (select t.organizer_id o, p.amount_xof amt, p.commission_xof com
                                  from public.trip_payments p join public.trip_bookings b on b.id = p.booking_id
                                  join public.trips t on t.id = b.trip_id where b.status <> 'cancelled'
                                union all
                                select a.organizer_id, p.amount_xof, p.commission_xof
                                  from public.activity_payments p join public.activity_bookings b on b.id = p.booking_id
                                  join public.activities a on a.id = b.activity_id where b.status <> 'cancelled') x
                          left join public.profiles pr on pr.id = x.o
                         group by x.o, pr.full_name order by sum(x.com) desc limit 10) y), '[]'::jsonb));
end; $$;

-- Transparence : un partenaire connaît ses taux effectifs (hors taux propre à chaque élément).
create or replace function public.get_my_commission()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  return jsonb_build_object(
    'trip_pct',     public.effective_commission_pct('trip', auth.uid(), null),
    'activity_pct', public.effective_commission_pct('activity', auth.uid(), null),
    'collected_xof', (select coalesce(sum(x.amt), 0) from (
        select p.amount_xof amt from public.trip_payments p join public.trip_bookings b on b.id = p.booking_id
          join public.trips t on t.id = b.trip_id where t.organizer_id = auth.uid() and b.status <> 'cancelled'
        union all
        select p.amount_xof from public.activity_payments p join public.activity_bookings b on b.id = p.booking_id
          join public.activities a on a.id = b.activity_id where a.organizer_id = auth.uid() and b.status <> 'cancelled') x),
    'commission_xof', (select coalesce(sum(x.com), 0) from (
        select p.commission_xof com from public.trip_payments p join public.trip_bookings b on b.id = p.booking_id
          join public.trips t on t.id = b.trip_id where t.organizer_id = auth.uid() and b.status <> 'cancelled'
        union all
        select p.commission_xof from public.activity_payments p join public.activity_bookings b on b.id = p.booking_id
          join public.activities a on a.id = b.activity_id where a.organizer_id = auth.uid() and b.status <> 'cancelled') x));
end; $$;

do $$
declare f text;
begin
  foreach f in array array[
    'admin_set_commission_defaults(numeric,numeric)', 'admin_set_organizer_commission(uuid,numeric,numeric,text)',
    'admin_commission_report()', 'get_my_commission()', 'admin_tourism_stats()', 'admin_activity_overview()'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  revoke execute on function public.effective_commission_pct(text, uuid, numeric) from public, anon, authenticated;
end $$;
