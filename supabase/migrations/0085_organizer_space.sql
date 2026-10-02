-- ============================================================================
-- SOUTRA PLAYCE V2 — Migration 0085 : espace organisateur (additive)
-- ============================================================================
--   • trips.submitted_at + submit_trip_for_review : l'organisateur soumet son
--     brouillon à la modération admin (trace dans audit_events)
--   • garde trips durci : un voyage non-brouillon est verrouillé pour
--     l'organisateur (seuls "clore" et, sans paiement encaissé, "annuler")
--   • get_organizer_dashboard : voyages + chiffres de l'organisateur connecté
--   • get_organizer_trip_bookings : liste des voyageurs d'un de ses voyages
-- ============================================================================

alter table public.trips add column if not exists submitted_at timestamptz;

create or replace function public.submit_trip_for_review(p_trip_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare t public.trips%rowtype;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into t from public.trips where id = p_trip_id for update;
  if not found or t.organizer_id <> auth.uid() then raise exception 'TRIP_NOT_FOUND'; end if;
  if t.status <> 'draft' then raise exception 'INVALID_STATE'; end if;
  if t.starts_on <= current_date then raise exception 'TRIP_ALREADY_STARTED'; end if;
  if t.cover_url is null then raise exception 'COVER_REQUIRED'; end if;
  if t.contact_phone is null and t.contact_whatsapp is null then raise exception 'CONTACT_REQUIRED'; end if;

  update public.trips set submitted_at = now() where id = p_trip_id;
  insert into public.audit_events (actor_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'trip_submitted', 'trip', p_trip_id, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end; $$;

-- Garde : version 0083 + verrouillage des voyages non-brouillons.
-- (s'applique aux écritures directes des clients ; admin et RPC security
-- definer passent librement)
create or replace function public.tg_trips_guard()
returns trigger language plpgsql set search_path = public as $$
declare
  v_status trip_status;
  v_cols text[] := array['status','updated_at','submitted_at','duration_days'];  -- duration_days : colonne générée, NULL dans NEW en BEFORE
  k text; n jsonb; o jsonb;
begin
  if current_user not in ('authenticated', 'anon') or public.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.seats_booked   := 0;
    new.commission_pct := null;
    new.status         := 'draft';
    new.submitted_at   := null;
    new.highlight      := null;
    return new;
  end if;

  -- UPDATE direct par un client (organisateur) : champs réservés à l'admin.
  new.seats_booked   := old.seats_booked;
  new.commission_pct := old.commission_pct;
  new.organizer_id   := old.organizer_id;
  new.highlight      := old.highlight;

  n := to_jsonb(new); o := to_jsonb(old);
  foreach k in array v_cols loop n := n - k; o := o - k; end loop;

  if old.status = 'draft' then
    -- Brouillon : libre, mais la publication passe par la modération, et
    -- submitted_at ne se fixe que via submit_trip_for_review.
    if new.status not in ('draft','closed','cancelled') then new.status := old.status; end if;
    new.submitted_at := old.submitted_at;
    -- Modifier un brouillon déjà soumis le sort de la file de modération.
    if old.submitted_at is not null and n is distinct from o then new.submitted_at := null; end if;
    return new;
  end if;

  -- Voyage publié / complet / clos / annulé : verrouillé.
  if n is distinct from o then raise exception 'TRIP_LOCKED'; end if;
  v_status := new.status;
  if v_status is distinct from old.status then
    if v_status = 'closed' and old.status in ('published','full') then
      null;  -- stopper les ventes : autorisé
    elsif v_status = 'cancelled' then
      if exists (select 1 from public.trip_bookings b
                  where b.trip_id = old.id and b.paid_xof > 0 and b.status <> 'cancelled') then
        raise exception 'TRIP_HAS_PAYMENTS';
      end if;
    else
      raise exception 'TRIP_LOCKED';
    end if;
  end if;
  new.submitted_at := old.submitted_at;
  return new;
end; $$;

create or replace function public.get_organizer_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  return jsonb_build_object(
    'trips', coalesce((
      select jsonb_agg(row_to_json(x) order by x.starts_on desc) from (
        select t.id, t.slug, t.title, t.scope, t.status, t.starts_on, t.ends_on, t.seats_total, t.seats_booked,
               t.base_price_xof, t.submitted_at, t.commission_pct,
               (select count(*) from trip_bookings b where b.trip_id = t.id and b.status <> 'cancelled') as bookings,
               (select coalesce(sum(b.paid_xof), 0) from trip_bookings b where b.trip_id = t.id and b.status <> 'cancelled') as paid_xof,
               (select coalesce(sum(b.total_xof - b.paid_xof), 0) from trip_bookings b where b.trip_id = t.id and b.status in ('pending','confirmed')) as due_xof
          from trips t where t.organizer_id = auth.uid()
      ) x), '[]'::jsonb),
    'totals', (
      select jsonb_build_object(
        'bookings', count(*) filter (where b.status <> 'cancelled'),
        'seats_sold', coalesce(sum(b.participants) filter (where b.status <> 'cancelled'), 0),
        'paid_xof', coalesce(sum(b.paid_xof) filter (where b.status <> 'cancelled'), 0),
        'due_xof', coalesce(sum(b.total_xof - b.paid_xof) filter (where b.status in ('pending','confirmed')), 0))
        from trip_bookings b join trips t on t.id = b.trip_id where t.organizer_id = auth.uid())
  );
end; $$;

create or replace function public.get_organizer_trip_bookings(p_trip_id uuid)
returns table (
  id uuid, reference text, traveler_name text, contact_phone text, participants integer,
  total_xof bigint, paid_xof bigint, status trip_booking_status, created_at timestamptz, used_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not exists (select 1 from trips t where t.id = p_trip_id and (t.organizer_id = auth.uid() or public.is_admin())) then
    raise exception 'TRIP_NOT_FOUND';
  end if;
  return query
    select b.id, b.reference, p.full_name, b.contact_phone, b.participants,
           b.total_xof, b.paid_xof, b.status, b.created_at, b.used_at
      from trip_bookings b left join profiles p on p.id = b.user_id
     where b.trip_id = p_trip_id
     order by b.created_at desc;
end; $$;

revoke execute on function public.submit_trip_for_review(uuid) from public;
revoke execute on function public.get_organizer_dashboard() from public;
revoke execute on function public.get_organizer_trip_bookings(uuid) from public;
grant execute on function public.submit_trip_for_review(uuid) to authenticated;
grant execute on function public.get_organizer_dashboard() to authenticated;
grant execute on function public.get_organizer_trip_bookings(uuid) to authenticated;
