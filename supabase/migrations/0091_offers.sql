-- ============================================================================
-- SOUTRA PLAYCE V2 — Migration 0091 : promotions et offres (voyages + activités)
-- ============================================================================
-- Complète les codes promo existants (0015/0028/0038 : réservations de tables,
-- par établissement, en %), qui ne sont PAS modifiés. Ici : offres pour les
-- voyages groupés et les activités.
--
-- Types (kind) : discount (réduction / code promo), flash, early_booking, group,
-- birthday, couple, family, corporate. Une offre avec `code` se déclenche par saisie
-- du code ; sans code elle s'applique automatiquement si les conditions sont
-- remplies. UNE seule offre par réservation, jamais cumulée : la plus avantageuse.
--
-- Garanties : le prix est TOUJOURS recalculé côté serveur (create_*_booking) ;
-- plafonds d'utilisation sous verrou ; remise bornée (% ≤ 90, total ≥ 200 FCFA pour
-- rester payable) ; une réservation annulée / expirée libère l'utilisation.
-- Les offres « anniversaire » exigent un code : l'âge/date de naissance n'est pas
-- vérifiable (seule birth_year existe), le code est remis par le partenaire.
-- ============================================================================

create table if not exists public.tourism_offers (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid references public.profiles(id) on delete set null,   -- NULL = offre plateforme (admin)
  kind             text not null check (kind in ('discount','flash','early_booking','group','birthday','couple','family','corporate')),
  code             text check (code is null or code ~ '^[A-Za-z0-9_-]{3,32}$'),
  title            text not null check (length(trim(title)) between 1 and 120),
  description      text check (description is null or length(description) <= 600),
  applies_to       text not null default 'both' check (applies_to in ('trips','activities','both')),
  trip_id          uuid references public.trips(id) on delete cascade,
  activity_id      uuid references public.activities(id) on delete cascade,
  discount_type    text not null check (discount_type in ('percent','fixed')),
  discount_value   bigint not null check (discount_value > 0),
  max_discount_xof bigint check (max_discount_xof is null or max_discount_xof > 0),
  min_participants integer not null default 1 check (min_participants between 1 and 500),
  max_participants integer,
  min_days_before  integer check (min_days_before is null or min_days_before >= 0),   -- early booking
  max_days_before  integer check (max_days_before is null or max_days_before >= 0),  -- dernière minute
  valid_from       timestamptz,
  valid_until      timestamptz,
  max_uses         integer check (max_uses is null or max_uses > 0),
  max_uses_per_user integer check (max_uses_per_user is null or max_uses_per_user > 0),
  is_public        boolean not null default true,
  active           boolean not null default true,
  i18n             jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint offers_percent_range   check (discount_type <> 'percent' or discount_value between 1 and 90),
  constraint offers_one_target      check (not (trip_id is not null and activity_id is not null)),
  constraint offers_target_applies  check ((trip_id is null or applies_to = 'trips') and (activity_id is null or applies_to = 'activities')),
  constraint offers_window          check (valid_until is null or valid_from is null or valid_until > valid_from),
  constraint offers_participants    check (max_participants is null or max_participants >= min_participants),
  constraint offers_flash_window    check (kind <> 'flash' or valid_until is not null),
  constraint offers_early_days      check (kind <> 'early_booking' or min_days_before is not null),
  constraint offers_code_required   check (kind not in ('birthday','corporate') or code is not null),
  constraint offers_couple          check (kind <> 'couple' or (min_participants = 2 and max_participants = 2)),
  constraint offers_group           check (kind <> 'group' or min_participants >= 2),
  constraint offers_family          check (kind <> 'family' or min_participants >= 3),
  constraint offers_i18n_check      check (public.is_valid_i18n(i18n))
);
create unique index if not exists ux_tourism_offers_code on public.tourism_offers (upper(code)) where code is not null;
create index if not exists idx_tourism_offers_active on public.tourism_offers (active, valid_until);
create index if not exists idx_tourism_offers_owner on public.tourism_offers (owner_id);

drop trigger if exists trg_tourism_offers_updated_at on public.tourism_offers;
create trigger trg_tourism_offers_updated_at before update on public.tourism_offers
  for each row execute function public.tg_tourism_set_updated_at();

create table if not exists public.tourism_offer_redemptions (
  id           uuid primary key default gen_random_uuid(),
  offer_id     uuid not null references public.tourism_offers(id) on delete cascade,
  user_id      uuid not null references public.profiles(id),
  booking_kind text not null check (booking_kind in ('trip','activity')),
  booking_id   uuid not null,
  discount_xof bigint not null check (discount_xof >= 0),
  active       boolean not null default true,   -- false si la réservation est annulée / expirée
  created_at   timestamptz not null default now(),
  unique (booking_kind, booking_id)
);
create index if not exists idx_offer_redemptions_offer on public.tourism_offer_redemptions (offer_id) where active;
create index if not exists idx_offer_redemptions_user on public.tourism_offer_redemptions (offer_id, user_id) where active;

alter table public.trip_bookings
  add column if not exists discount_xof bigint not null default 0 check (discount_xof >= 0),
  add column if not exists offer_id uuid references public.tourism_offers(id) on delete set null,
  add column if not exists promo_code text;
alter table public.activity_bookings
  add column if not exists discount_xof bigint not null default 0 check (discount_xof >= 0),
  add column if not exists offer_id uuid references public.tourism_offers(id) on delete set null,
  add column if not exists promo_code text;

-- Une annulation / expiration libère l'utilisation de l'offre.
create or replace function public.tg_release_offer_redemption()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    update public.tourism_offer_redemptions set active = false
     where booking_kind = tg_argv[0] and booking_id = new.id;
  end if;
  return new;
end; $$;
drop trigger if exists trg_trip_bookings_release_offer on public.trip_bookings;
create trigger trg_trip_bookings_release_offer after update of status on public.trip_bookings
  for each row execute function public.tg_release_offer_redemption('trip');
drop trigger if exists trg_activity_bookings_release_offer on public.activity_bookings;
create trigger trg_activity_bookings_release_offer after update of status on public.activity_bookings
  for each row execute function public.tg_release_offer_redemption('activity');

-- ----------------------------------------------------------------------------
-- RLS : gestion par le propriétaire (organisateur) ou l'admin ; pas de lecture publique directe
-- (la liste publique passe par list_public_offers, qui n'expose que des champs sûrs).
-- ----------------------------------------------------------------------------
alter table public.tourism_offers enable row level security;
alter table public.tourism_offer_redemptions enable row level security;

drop policy if exists tourism_offers_admin on public.tourism_offers;
create policy tourism_offers_admin on public.tourism_offers for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists tourism_offers_owner on public.tourism_offers;
create policy tourism_offers_owner on public.tourism_offers for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text in ('organizer','venue_owner','guide','admin')));

-- Un partenaire ne peut cibler que SES voyages / activités (RLS ne voit pas les clés étrangères).
create or replace function public.tg_tourism_offers_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.trip_id is not null and not exists (
       select 1 from public.trips t where t.id = new.trip_id and (new.owner_id is null or t.organizer_id = new.owner_id)) then
    raise exception 'OFFER_TARGET_NOT_OWNED';
  end if;
  if new.activity_id is not null and not exists (
       select 1 from public.activities a where a.id = new.activity_id and (new.owner_id is null or a.organizer_id = new.owner_id)) then
    raise exception 'OFFER_TARGET_NOT_OWNED';
  end if;
  if new.code is not null then new.code := upper(new.code); end if;
  return new;
end; $$;
drop trigger if exists trg_tourism_offers_guard on public.tourism_offers;
create trigger trg_tourism_offers_guard before insert or update on public.tourism_offers
  for each row execute function public.tg_tourism_offers_guard();

drop policy if exists tourism_offer_redemptions_select on public.tourism_offer_redemptions;
create policy tourism_offer_redemptions_select on public.tourism_offer_redemptions for select to authenticated
  using (user_id = auth.uid() or public.is_admin()
         or exists (select 1 from public.tourism_offers o where o.id = offer_id and o.owner_id = auth.uid()));

-- ----------------------------------------------------------------------------
-- Calcul
-- ----------------------------------------------------------------------------
-- Raison d'inéligibilité (NULL = éligible). Cible : p_kind = 'trip' (p_target = trip) ou 'activity' (p_target = créneau).
create or replace function public.offer_ineligible_reason(
  o public.tourism_offers, p_kind text, p_target uuid, p_organizer uuid,
  p_participants integer, p_start date, p_uid uuid
) returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_days integer; v_act uuid;
begin
  if not o.active then return 'INACTIVE'; end if;
  if p_kind = 'activity' then select activity_id into v_act from public.activity_slots where id = p_target; end if;
  -- coalesce : en logique à trois valeurs (NULL), « not (NULL) » ne déclencherait pas le return
  -- et une offre d'un partenaire s'appliquerait aux voyages d'un autre.
  if not coalesce(
       (p_kind = 'trip' and o.trip_id = p_target)
    or (p_kind = 'activity' and o.activity_id = v_act)
    or (o.trip_id is null and o.activity_id is null
        and (o.owner_id is null or o.owner_id = p_organizer)
        and (o.applies_to = 'both' or o.applies_to = p_kind || 's'))
  , false) then return 'NOT_APPLICABLE'; end if;
  if o.valid_from is not null and o.valid_from > now() then return 'NOT_STARTED'; end if;
  if o.valid_until is not null and o.valid_until <= now() then return 'EXPIRED'; end if;
  if p_participants < o.min_participants or (o.max_participants is not null and p_participants > o.max_participants) then
    return 'PARTICIPANTS';
  end if;
  v_days := p_start - current_date;
  if o.min_days_before is not null and v_days < o.min_days_before then return 'TOO_LATE'; end if;
  if o.max_days_before is not null and v_days > o.max_days_before then return 'TOO_EARLY'; end if;
  if o.max_uses is not null and (select count(*) from public.tourism_offer_redemptions r where r.offer_id = o.id and r.active) >= o.max_uses then
    return 'EXHAUSTED';
  end if;
  if o.max_uses_per_user is not null and p_uid is not null
     and (select count(*) from public.tourism_offer_redemptions r where r.offer_id = o.id and r.active and r.user_id = p_uid) >= o.max_uses_per_user then
    return 'ALREADY_USED';
  end if;
  return null;
end; $$;

-- Remise en FCFA (jamais en dessous de 200 FCFA à payer, pour rester payable).
create or replace function public.offer_discount(o public.tourism_offers, p_gross bigint)
returns bigint language sql immutable as $$
  select greatest(0, least(
    case when o.discount_type = 'percent'
         then least((p_gross * o.discount_value) / 100, coalesce(o.max_discount_xof, (p_gross * o.discount_value) / 100))
         else least(o.discount_value, coalesce(o.max_discount_xof, o.discount_value)) end,
    greatest(0, p_gross - 200)));
$$;

-- Meilleure offre : code saisi (doit être valide, sinon erreur explicite) + offres automatiques éligibles.
create or replace function public.pick_offer(
  p_kind text, p_target uuid, p_organizer uuid, p_participants integer, p_start date,
  p_gross bigint, p_code text, p_uid uuid, p_lock boolean default false
)
returns table (offer_id uuid, discount_xof bigint, title text, kind text, code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := nullif(upper(trim(p_code)), '');
  o public.tourism_offers;
  v_reason text; v_d bigint; v_best_d bigint := 0; v_best public.tourism_offers;
  v_ids uuid[];
begin
  if v_code is not null and p_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select coalesce(array_agg(x.id order by x.id), '{}') into v_ids
    from public.tourism_offers x
   where x.active and (x.code is null or upper(x.code) = v_code);
  if p_lock and cardinality(v_ids) > 0 then
    perform 1 from public.tourism_offers l where l.id = any(v_ids) order by l.id for update;
  end if;

  if v_code is not null then
    select c.* into o from public.tourism_offers c where upper(c.code) = v_code;
    if not found then raise exception 'PROMO_NOT_FOUND'; end if;
    v_reason := public.offer_ineligible_reason(o, p_kind, p_target, p_organizer, p_participants, p_start, p_uid);
    if v_reason is not null then raise exception 'PROMO_%', v_reason; end if;
  end if;

  for o in select x.* from public.tourism_offers x where x.id = any(v_ids) order by (x.code is not null) desc, x.id loop
    if public.offer_ineligible_reason(o, p_kind, p_target, p_organizer, p_participants, p_start, p_uid) is null then
      v_d := public.offer_discount(o, p_gross);
      if v_d > v_best_d then v_best_d := v_d; v_best := o; end if;
    end if;
  end loop;

  if v_best_d > 0 then
    return query select v_best.id, v_best_d, v_best.title, v_best.kind, v_best.code;
  else
    return query select null::uuid, 0::bigint, null::text, null::text, null::text;
  end if;
end; $$;
revoke execute on function public.pick_offer(text, uuid, uuid, integer, date, bigint, text, uuid, boolean) from public, anon, authenticated;
revoke execute on function public.offer_ineligible_reason(public.tourism_offers, text, uuid, uuid, integer, date, uuid) from public, anon, authenticated;

-- Aperçu du prix (même calcul que la réservation, sans rien écrire).
create or replace function public.preview_booking_price(
  p_kind text, p_target uuid, p_participants integer, p_package uuid default null, p_code text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  t public.trips%rowtype; s public.activity_slots%rowtype; a public.activities%rowtype;
  v_unit bigint; v_gross bigint; v_org uuid; v_start date; r record;
begin
  if p_participants is null or p_participants < 1 or p_participants > 50 then raise exception 'INVALID_PARTICIPANTS'; end if;
  if p_kind = 'trip' then
    select * into t from public.trips where id = p_target and status in ('published','full');
    if not found then raise exception 'TRIP_NOT_AVAILABLE'; end if;
    if p_package is not null then
      select price_xof into v_unit from public.trip_packages where id = p_package and trip_id = t.id and is_active;
      if v_unit is null then raise exception 'PACKAGE_NOT_FOUND'; end if;
    else v_unit := t.base_price_xof; end if;
    v_org := t.organizer_id; v_start := t.starts_on;
  elsif p_kind = 'activity' then
    select * into s from public.activity_slots where id = p_target;
    if not found then raise exception 'SLOT_NOT_FOUND'; end if;
    select * into a from public.activities where id = s.activity_id and status = 'published';
    if not found then raise exception 'ACTIVITY_NOT_AVAILABLE'; end if;
    v_unit := coalesce(s.price_xof, a.price_xof); v_org := a.organizer_id; v_start := (s.starts_at at time zone 'UTC')::date;
  else
    raise exception 'INVALID_KIND';
  end if;
  v_gross := v_unit * p_participants;

  begin
    select * into r from public.pick_offer(p_kind, p_target, v_org, p_participants, v_start, v_gross, p_code, v_uid, false);
  exception when others then
    if sqlerrm like 'PROMO_%' or sqlerrm = 'NOT_AUTHENTICATED' then
      return jsonb_build_object('gross_xof', v_gross, 'discount_xof', 0, 'total_xof', v_gross, 'offer', null, 'error', sqlerrm);
    end if;
    raise;
  end;
  return jsonb_build_object('gross_xof', v_gross, 'discount_xof', coalesce(r.discount_xof, 0),
                            'total_xof', v_gross - coalesce(r.discount_xof, 0),
                            'offer', case when r.offer_id is null then null
                                          else jsonb_build_object('id', r.offer_id, 'title', r.title, 'kind', r.kind, 'code', r.code) end,
                            'error', null);
end; $$;

-- ----------------------------------------------------------------------------
-- Réservations : mêmes fonctions que 0083 / 0087, avec p_promo_code (l'ancienne signature est remplacée).
-- ----------------------------------------------------------------------------
drop function if exists public.create_trip_booking(uuid, integer, uuid, text, text);
drop function if exists public.create_activity_booking(uuid, integer, text, text);

create function public.create_trip_booking(
  p_trip_id      uuid,
  p_participants integer,
  p_package_id   uuid default null,
  p_phone        text default null,
  p_notes        text default null,
  p_promo_code   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_trip  public.trips%rowtype;
  v_price bigint;
  v_id    uuid;
  v_ref   text;
  v_freed integer;
  v_gross bigint;
  v_offer record;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_participants is null or p_participants < 1 or p_participants > 50 then
    raise exception 'INVALID_PARTICIPANTS';
  end if;

  select * into v_trip from public.trips where id = p_trip_id for update;
  if not found or v_trip.status not in ('published','full') then raise exception 'TRIP_NOT_AVAILABLE'; end if;
  if v_trip.starts_on <= current_date then raise exception 'TRIP_ALREADY_STARTED'; end if;

  -- Libère les places retenues par des réservations impayées expirées.
  with expired as (
    update public.trip_bookings
       set status = 'cancelled'
     where trip_id = p_trip_id and status = 'pending' and paid_xof = 0
       and expires_at is not null and expires_at < now()
    returning participants
  )
  select coalesce(sum(participants), 0) into v_freed from expired;
  if v_freed > 0 then
    update public.trips
       set seats_booked = greatest(0, seats_booked - v_freed),
           status = case when status = 'full' then 'published' else status end
     where id = p_trip_id
    returning * into v_trip;
  end if;

  if v_trip.status <> 'published' then raise exception 'TRIP_NOT_AVAILABLE'; end if;
  if v_trip.seats_total - v_trip.seats_booked < p_participants then
    raise exception 'NOT_ENOUGH_SEATS';
  end if;

  if p_package_id is not null then
    select price_xof into v_price from public.trip_packages
     where id = p_package_id and trip_id = p_trip_id and is_active;
    if v_price is null then raise exception 'PACKAGE_NOT_FOUND'; end if;
  else
    v_price := v_trip.base_price_xof;
  end if;

  v_gross := v_price * p_participants;
  -- Meilleure offre éligible (ou code saisi) ; verrouille les offres candidates (plafonds d'utilisation).
  select * into v_offer from public.pick_offer('trip', p_trip_id, v_trip.organizer_id, p_participants,
                                               v_trip.starts_on, v_gross, p_promo_code, v_uid, true);
  v_ref := 'TRP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into public.trip_bookings
    (reference, user_id, trip_id, package_id, participants, unit_price_xof, total_xof,
     contact_phone, notes, expires_at, discount_xof, offer_id, promo_code)
  values
    (v_ref, v_uid, p_trip_id, p_package_id, p_participants, v_price, v_gross - coalesce(v_offer.discount_xof, 0),
     nullif(trim(p_phone), ''), nullif(trim(p_notes), ''), now() + interval '24 hours',
     coalesce(v_offer.discount_xof, 0), v_offer.offer_id, v_offer.code)
  returning id into v_id;

  if v_offer.offer_id is not null then
    insert into public.tourism_offer_redemptions (offer_id, user_id, booking_kind, booking_id, discount_xof)
    values (v_offer.offer_id, v_uid, 'trip', v_id, v_offer.discount_xof);
  end if;

  update public.trips
     set seats_booked = seats_booked + p_participants,
         status = case when seats_booked + p_participants >= seats_total then 'full' else status end
   where id = p_trip_id;

  return jsonb_build_object('id', v_id, 'reference', v_ref,
                            'total_xof', v_gross - coalesce(v_offer.discount_xof, 0),
                            'discount_xof', coalesce(v_offer.discount_xof, 0), 'offer', v_offer.title,
                            'expires_at', now() + interval '24 hours');
end; $$;

create function public.create_activity_booking(
  p_slot_id      uuid,
  p_participants integer,
  p_phone        text default null,
  p_notes        text default null,
  p_promo_code   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  s      public.activity_slots%rowtype;
  a      public.activities%rowtype;
  v_price bigint; v_gross bigint; v_offer record; v_id uuid; v_ref text; v_freed integer; v_exp timestamptz := now() + interval '1 hour';
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_participants is null or p_participants < 1 or p_participants > 50 then raise exception 'INVALID_PARTICIPANTS'; end if;

  select * into s from public.activity_slots where id = p_slot_id for update;
  if not found then raise exception 'SLOT_NOT_FOUND'; end if;
  select * into a from public.activities where id = s.activity_id;
  if a.status <> 'published' then raise exception 'ACTIVITY_NOT_AVAILABLE'; end if;
  if s.status <> 'open' or s.starts_at <= now() + interval '1 hour' then raise exception 'SLOT_CLOSED'; end if;
  if p_participants > a.max_group_size then raise exception 'GROUP_TOO_LARGE'; end if;

  -- Libère les places retenues par des réservations impayées expirées.
  with expired as (
    update public.activity_bookings set status = 'cancelled'
     where slot_id = p_slot_id and status = 'pending' and paid_xof = 0
       and expires_at is not null and expires_at < now()
    returning participants)
  select coalesce(sum(participants), 0) into v_freed from expired;
  if v_freed > 0 then
    update public.activity_slots set booked = greatest(0, booked - v_freed) where id = p_slot_id returning * into s;
  end if;

  if s.capacity - s.booked < p_participants then raise exception 'NOT_ENOUGH_SEATS'; end if;
  v_price := coalesce(s.price_xof, a.price_xof);
  v_gross := v_price * p_participants;
  select * into v_offer from public.pick_offer('activity', s.id, a.organizer_id, p_participants,
                                               (s.starts_at at time zone 'UTC')::date, v_gross, p_promo_code, v_uid, true);
  v_ref := 'ACT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into public.activity_bookings
    (reference, user_id, activity_id, slot_id, participants, unit_price_xof, total_xof, contact_phone, notes, expires_at,
     discount_xof, offer_id, promo_code)
  values (v_ref, v_uid, a.id, s.id, p_participants, v_price, v_gross - coalesce(v_offer.discount_xof, 0),
          nullif(trim(p_phone), ''), nullif(trim(p_notes), ''), v_exp,
          coalesce(v_offer.discount_xof, 0), v_offer.offer_id, v_offer.code)
  returning id into v_id;

  if v_offer.offer_id is not null then
    insert into public.tourism_offer_redemptions (offer_id, user_id, booking_kind, booking_id, discount_xof)
    values (v_offer.offer_id, v_uid, 'activity', v_id, v_offer.discount_xof);
  end if;

  update public.activity_slots set booked = booked + p_participants where id = s.id;
  return jsonb_build_object('id', v_id, 'reference', v_ref, 'total_xof', v_gross - coalesce(v_offer.discount_xof, 0),
                            'discount_xof', coalesce(v_offer.discount_xof, 0), 'offer', v_offer.title, 'expires_at', v_exp);
end; $$;

-- ----------------------------------------------------------------------------
-- Offres publiques (page /promotions, accueil) — champs sûrs uniquement
-- ----------------------------------------------------------------------------
create or replace function public.list_public_offers(p_limit integer default 30)
returns table (
  id uuid, kind text, code text, title text, description text, applies_to text,
  discount_type text, discount_value bigint, max_discount_xof bigint,
  min_participants integer, max_participants integer, min_days_before integer, max_days_before integer,
  valid_until timestamptz, i18n jsonb,
  target_kind text, target_slug text, target_title text, target_cover text, target_i18n jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.kind, o.code, o.title, o.description, o.applies_to, o.discount_type, o.discount_value, o.max_discount_xof,
         o.min_participants, o.max_participants, o.min_days_before, o.max_days_before, o.valid_until, o.i18n,
         case when o.trip_id is not null then 'trip' when o.activity_id is not null then 'activity' end,
         coalesce(t.slug, a.slug), coalesce(t.title, a.title), coalesce(t.cover_url, a.cover_url), coalesce(t.i18n, a.i18n)
    from public.tourism_offers o
    left join public.trips t on t.id = o.trip_id
    left join public.activities a on a.id = o.activity_id
   where o.active and o.is_public
     and (o.valid_from is null or o.valid_from <= now())
     and (o.valid_until is null or o.valid_until > now())
     and (o.max_uses is null or (select count(*) from public.tourism_offer_redemptions r where r.offer_id = o.id and r.active) < o.max_uses)
     and (o.trip_id is null or (t.status = 'published' and t.starts_on > current_date))
     and (o.activity_id is null or a.status = 'published')
   order by (o.valid_until is not null) desc, o.valid_until asc nulls last, o.created_at desc
   limit greatest(1, least(coalesce(p_limit, 30), 100));
$$;

-- Offres visibles sur la fiche d'un voyage (p_target = id du voyage) ou d'une activité (p_target = id de l'activité).
-- Conditions de participants / de date non évaluées ici : elles sont affichées, puis appliquées à la réservation.
create or replace function public.list_offers_for_target(p_kind text, p_target uuid)
returns table (
  id uuid, kind text, code text, title text, description text, discount_type text, discount_value bigint,
  max_discount_xof bigint, min_participants integer, max_participants integer, min_days_before integer,
  max_days_before integer, valid_until timestamptz, i18n jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_org uuid;
begin
  if p_kind = 'trip' then
    select t.organizer_id into v_org from public.trips t where t.id = p_target and t.status in ('published','full');
  elsif p_kind = 'activity' then
    select a.organizer_id into v_org from public.activities a where a.id = p_target and a.status = 'published';
  else
    raise exception 'INVALID_KIND';
  end if;
  if v_org is null then return; end if;
  return query
  select o.id, o.kind, o.code, o.title, o.description, o.discount_type, o.discount_value, o.max_discount_xof,
         o.min_participants, o.max_participants, o.min_days_before, o.max_days_before, o.valid_until, o.i18n
    from public.tourism_offers o
   where o.active and o.is_public
     and (o.valid_from is null or o.valid_from <= now())
     and (o.valid_until is null or o.valid_until > now())
     and (o.max_uses is null or (select count(*) from public.tourism_offer_redemptions r where r.offer_id = o.id and r.active) < o.max_uses)
     and (
          (p_kind = 'trip' and o.trip_id = p_target)
       or (p_kind = 'activity' and o.activity_id = p_target)
       or (o.trip_id is null and o.activity_id is null
           and (o.owner_id is null or o.owner_id = v_org)
           and (o.applies_to = 'both' or o.applies_to = p_kind || 's')))
   order by o.valid_until asc nulls last, o.created_at desc;
end; $$;

create or replace function public.admin_offers_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  return jsonb_build_object(
    'offers_active', (select count(*) from tourism_offers where active and (valid_until is null or valid_until > now())),
    'redemptions',   (select count(*) from tourism_offer_redemptions where active),
    'discount_xof',  (select coalesce(sum(discount_xof), 0) from tourism_offer_redemptions where active),
    'by_kind', coalesce((select jsonb_agg(jsonb_build_object('kind', k, 'redemptions', n, 'discount_xof', d) order by d desc)
                           from (select o.kind k, count(*) n, sum(r.discount_xof) d
                                   from tourism_offer_redemptions r join tourism_offers o on o.id = r.offer_id
                                  where r.active group by 1) x), '[]'::jsonb));
end; $$;

do $$
declare f text;
begin
  foreach f in array array[
    'create_trip_booking(uuid,integer,uuid,text,text,text)', 'create_activity_booking(uuid,integer,text,text,text)',
    'admin_offers_overview()'
  ] loop
    execute format('revoke execute on function public.%s from public', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke execute on function public.preview_booking_price(text, uuid, integer, uuid, text) from public;
grant execute on function public.preview_booking_price(text, uuid, integer, uuid, text) to anon, authenticated;
revoke execute on function public.list_offers_for_target(text, uuid) from public;
grant execute on function public.list_offers_for_target(text, uuid) to anon, authenticated;
revoke execute on function public.list_public_offers(integer) from public;
grant execute on function public.list_public_offers(integer) to anon, authenticated;
