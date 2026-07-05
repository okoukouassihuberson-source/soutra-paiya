-- ============================================================================
-- SOUTRA-PAIYA — Migration 0076 : système d'avis complet
-- ============================================================================
-- Phase 2 de la refonte UX fiche établissement (section 2 du master prompt) :
--   1. Étend reviews (room_booking_id, order_id) — hôtels et boutiques
--      peuvent désormais recevoir des avis (avant : réservations de table
--      et billets d'événement uniquement).
--   2. Policy DELETE manquante + trigger de recalcul de note réécrit pour
--      gérer UPDATE/DELETE (avant : INSERT uniquement — supprimer un avis
--      ne recalculait jamais rating_avg/rating_count).
--   3. RPCs de lecture/écriture/modération, calquées sur les patterns
--      existants (submit_venue_report / 0034_venue_reports.sql).
--   4. Vote "utile" (review_helpful_votes) + signalement d'avis
--      (review_reports), même anti-spam que les signalements de venue.
--
-- Hors scope (décision produit) : les billets d'événement (ticket_id) ne
-- sont pas câblés côté RPC — aucune UI mobile événements n'existe encore
-- (audit confirmé), ce serait du code mort. La colonne ticket_id reste
-- dans la contrainte "exactement une source" pour compatibilité future.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Étendre reviews : room_booking_id, order_id
-- ----------------------------------------------------------------------------

alter table public.reviews
  add column if not exists room_booking_id uuid references public.room_bookings(id),
  add column if not exists order_id        uuid references public.orders(id);

-- La contrainte d'origine (reservation_id OR ticket_id) est anonyme et il y a
-- 2 CHECK anonymes sur cette table (venue/event + reservation/ticket) — on la
-- retrouve dynamiquement plutôt que de deviner son nom auto-généré.
do $$
declare
  v_conname text;
begin
  select conname into v_conname
    from pg_constraint
   where conrelid = 'public.reviews'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%reservation_id%ticket_id%';
  if v_conname is not null then
    execute format('alter table public.reviews drop constraint %I', v_conname);
  end if;
end $$;

-- Exactement une source (pas juste "au moins une") : un avis ne doit jamais
-- être ambigu sur deux transactions à la fois. submit_review ne renseigne
-- jamais plus d'une colonne source.
alter table public.reviews
  add constraint reviews_exactly_one_source_check
  check (
    (case when reservation_id  is not null then 1 else 0 end) +
    (case when ticket_id       is not null then 1 else 0 end) +
    (case when room_booking_id is not null then 1 else 0 end) +
    (case when order_id        is not null then 1 else 0 end) = 1
  );

create unique index if not exists uniq_review_per_booking
  on public.reviews(room_booking_id) where room_booking_id is not null;
create unique index if not exists uniq_review_per_order
  on public.reviews(order_id) where order_id is not null;
-- Trou déjà présent dans le schéma d'origine (jamais d'index unique sur
-- ticket_id) — comblé ici par cohérence, même si non utilisé cette phase.
create unique index if not exists uniq_review_per_ticket
  on public.reviews(ticket_id) where ticket_id is not null;

-- ----------------------------------------------------------------------------
-- 2) Policy DELETE manquante
-- ----------------------------------------------------------------------------

drop policy if exists "reviews_user_delete" on public.reviews;
create policy "reviews_user_delete" on public.reviews
  for delete to authenticated
  using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 3) Trigger de recalcul — réécrit pour INSERT/UPDATE/DELETE
-- ----------------------------------------------------------------------------

create or replace function public.tg_update_venue_rating()
returns trigger
language plpgsql
as $$
declare
  v_venue_id uuid;
begin
  v_venue_id := coalesce(new.venue_id, old.venue_id);
  if v_venue_id is not null then
    update public.venues set
      rating_avg   = coalesce((select round(avg(rating)::numeric, 1) from public.reviews where venue_id = v_venue_id), 0),
      rating_count = (select count(*) from public.reviews where venue_id = v_venue_id)
    where id = v_venue_id;
  end if;

  -- Défensif : si un UPDATE changeait venue_id (l'app ne le fait jamais),
  -- l'ancien venue ne doit pas garder une note obsolète.
  if tg_op = 'UPDATE' and old.venue_id is not null and old.venue_id is distinct from new.venue_id then
    update public.venues set
      rating_avg   = coalesce((select round(avg(rating)::numeric, 1) from public.reviews where venue_id = old.venue_id), 0),
      rating_count = (select count(*) from public.reviews where venue_id = old.venue_id)
    where id = old.venue_id;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists update_venue_rating on public.reviews;
create trigger update_venue_rating
  after insert or update or delete on public.reviews
  for each row execute function public.tg_update_venue_rating();

-- ----------------------------------------------------------------------------
-- 4) RPC : visites éligibles à un avis (réservation / séjour / commande)
-- ----------------------------------------------------------------------------

create or replace function public.list_my_reviewable_visits(p_venue_id uuid)
returns table (
  source_type text,        -- 'reservation' | 'room_booking' | 'order'
  source_id   uuid,
  label       text,
  occurred_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select 'reservation'::text as source_type, r.id as source_id,
         'Réservation du ' || to_char(r.date_time, 'DD/MM/YYYY') as label,
         r.arrived_at as occurred_at
    from public.reservations r
   where r.user_id = auth.uid()
     and r.venue_id = p_venue_id
     and r.status = 'arrived'
     and not exists (select 1 from public.reviews rv where rv.reservation_id = r.id)

  union all

  select 'room_booking'::text as source_type, b.id as source_id,
         'Séjour du ' || to_char(b.check_in_date, 'DD/MM/YYYY') || ' au ' || to_char(b.check_out_date, 'DD/MM/YYYY') as label,
         b.checked_out_at as occurred_at
    from public.room_bookings b
   where b.user_id = auth.uid()
     and b.venue_id = p_venue_id
     and b.status = 'checked_out'
     and not exists (select 1 from public.reviews rv where rv.room_booking_id = b.id)

  union all

  select 'order'::text as source_type, o.id as source_id,
         'Commande ' || o.order_number as label,
         o.delivered_at as occurred_at
    from public.orders o
   where o.user_id = auth.uid()
     and o.venue_id = p_venue_id
     and o.status = 'delivered'
     and not exists (select 1 from public.reviews rv where rv.order_id = o.id)

  order by occurred_at desc nulls last;
$$;

revoke execute on function public.list_my_reviewable_visits(uuid) from public;
grant execute on function public.list_my_reviewable_visits(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 5) RPC : soumission d'un avis
-- ----------------------------------------------------------------------------

create or replace function public.submit_review(
  p_venue_id        uuid,
  p_rating          int,
  p_body            text default null,
  p_photos          text[] default '{}',
  p_reservation_id  uuid default null,
  p_room_booking_id uuid default null,
  p_order_id        uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_new_id uuid;
  v_source_count int;
  v_ok boolean;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then raise exception 'INVALID_RATING'; end if;
  if p_photos is not null and array_length(p_photos, 1) > 5 then raise exception 'TOO_MANY_PHOTOS'; end if;

  v_source_count :=
    (case when p_reservation_id  is not null then 1 else 0 end) +
    (case when p_room_booking_id is not null then 1 else 0 end) +
    (case when p_order_id        is not null then 1 else 0 end);
  if v_source_count <> 1 then raise exception 'EXACTLY_ONE_SOURCE_REQUIRED'; end if;

  if p_reservation_id is not null then
    select exists(
      select 1 from public.reservations
       where id = p_reservation_id and user_id = v_uid and venue_id = p_venue_id and status = 'arrived'
    ) into v_ok;
    if not v_ok then raise exception 'INELIGIBLE_RESERVATION'; end if;

  elsif p_room_booking_id is not null then
    select exists(
      select 1 from public.room_bookings
       where id = p_room_booking_id and user_id = v_uid and venue_id = p_venue_id and status = 'checked_out'
    ) into v_ok;
    if not v_ok then raise exception 'INELIGIBLE_BOOKING'; end if;

  elsif p_order_id is not null then
    select exists(
      select 1 from public.orders
       where id = p_order_id and user_id = v_uid and venue_id = p_venue_id and status = 'delivered'
    ) into v_ok;
    if not v_ok then raise exception 'INELIGIBLE_ORDER'; end if;
  end if;

  insert into public.reviews (
    user_id, venue_id, reservation_id, room_booking_id, order_id, rating, body, photos
  ) values (
    v_uid, p_venue_id, p_reservation_id, p_room_booking_id, p_order_id,
    p_rating, nullif(trim(coalesce(p_body, '')), ''), coalesce(p_photos, '{}')
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

revoke execute on function public.submit_review(uuid, int, text, text[], uuid, uuid, uuid) from public;
grant execute on function public.submit_review(uuid, int, text, text[], uuid, uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 6) RPC : modification / suppression d'un avis
-- ----------------------------------------------------------------------------

create or replace function public.update_review(
  p_review_id uuid,
  p_rating    int,
  p_body      text default null,
  p_photos    text[] default '{}'
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then raise exception 'INVALID_RATING'; end if;
  if p_photos is not null and array_length(p_photos, 1) > 5 then raise exception 'TOO_MANY_PHOTOS'; end if;

  update public.reviews
     set rating = p_rating,
         body   = nullif(trim(coalesce(p_body, '')), ''),
         photos = coalesce(p_photos, '{}')
   where id = p_review_id and user_id = auth.uid();

  if not found then raise exception 'NOT_FOUND_OR_FORBIDDEN'; end if;
end;
$$;

create or replace function public.delete_review(p_review_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  delete from public.reviews where id = p_review_id and user_id = auth.uid();
  if not found then raise exception 'NOT_FOUND_OR_FORBIDDEN'; end if;
end;
$$;

revoke execute on function public.update_review(uuid, int, text, text[]) from public;
grant execute on function public.update_review(uuid, int, text, text[]) to authenticated;
revoke execute on function public.delete_review(uuid) from public;
grant execute on function public.delete_review(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 7) RPC : stats de notation (moyenne + répartition par étoile)
-- ----------------------------------------------------------------------------

create or replace function public.get_venue_review_stats(p_venue_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'rating_avg',   coalesce(v.rating_avg, 0),
    'rating_count', coalesce(v.rating_count, 0),
    'distribution', coalesce((
      select jsonb_object_agg(r.rating, r.cnt)
        from (
          select rating, count(*) as cnt
            from public.reviews
           where venue_id = p_venue_id
           group by rating
        ) r
    ), '{}'::jsonb)
  )
  from public.venues v
  where v.id = p_venue_id;
$$;

revoke execute on function public.get_venue_review_stats(uuid) from public;
grant execute on function public.get_venue_review_stats(uuid) to authenticated, anon;

-- ----------------------------------------------------------------------------
-- 8) RPC : liste des avis d'un venue (tri/pagination)
-- ----------------------------------------------------------------------------

create or replace function public.list_venue_reviews(
  p_venue_id uuid,
  p_sort     text default 'recent',
  p_limit    int default 20,
  p_offset   int default 0
) returns table (
  id              uuid,
  user_id         uuid,
  full_name       text,
  avatar_url      text,
  rating          int,
  body            text,
  photos          text[],
  created_at      timestamptz,
  helpful_count   bigint,
  i_voted_helpful boolean,
  is_mine         boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  return query
  select
    rv.id, rv.user_id, p.full_name, p.avatar_url, rv.rating, rv.body, rv.photos, rv.created_at,
    coalesce(hv.cnt, 0) as helpful_count,
    exists(select 1 from public.review_helpful_votes h2 where h2.review_id = rv.id and h2.user_id = v_uid) as i_voted_helpful,
    (rv.user_id = v_uid) as is_mine
  from public.reviews rv
  join public.profiles p on p.id = rv.user_id
  left join (
    select review_id, count(*) as cnt from public.review_helpful_votes group by review_id
  ) hv on hv.review_id = rv.id
  where rv.venue_id = p_venue_id
  order by
    case when p_sort = 'helpful'     then coalesce(hv.cnt, 0) end desc nulls last,
    case when p_sort = 'rating_high' then rv.rating end desc nulls last,
    case when p_sort = 'rating_low'  then rv.rating end asc nulls last,
    case when p_sort = 'recent' or p_sort not in ('helpful','rating_high','rating_low') then rv.created_at end desc,
    rv.created_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 50))
  offset greatest(0, coalesce(p_offset, 0));
end;
$$;

revoke execute on function public.list_venue_reviews(uuid, text, int, int) from public;
grant execute on function public.list_venue_reviews(uuid, text, int, int) to authenticated, anon;

-- ----------------------------------------------------------------------------
-- 9) Vote "utile" — table + RPC transactionnelle unique
-- ----------------------------------------------------------------------------

create table if not exists public.review_helpful_votes (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  review_id  uuid not null references public.reviews(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, review_id)
);
create index if not exists idx_review_helpful_review on public.review_helpful_votes(review_id);

alter table public.review_helpful_votes enable row level security;

drop policy if exists "review_helpful_select_public" on public.review_helpful_votes;
create policy "review_helpful_select_public" on public.review_helpful_votes
  for select to anon, authenticated using (true);

drop policy if exists "review_helpful_self" on public.review_helpful_votes;
create policy "review_helpful_self" on public.review_helpful_votes
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.toggle_review_helpful(p_review_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_voted boolean;
  v_count bigint;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  if exists(select 1 from public.review_helpful_votes where user_id = v_uid and review_id = p_review_id) then
    delete from public.review_helpful_votes where user_id = v_uid and review_id = p_review_id;
    v_voted := false;
  else
    insert into public.review_helpful_votes (user_id, review_id) values (v_uid, p_review_id);
    v_voted := true;
  end if;

  select count(*) into v_count from public.review_helpful_votes where review_id = p_review_id;

  return jsonb_build_object('voted', v_voted, 'count', v_count);
end;
$$;

revoke execute on function public.toggle_review_helpful(uuid) from public;
grant execute on function public.toggle_review_helpful(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 10) Signalement d'avis — mêmes principes que venue_reports (0034)
-- ----------------------------------------------------------------------------

do $$ begin
  create type review_report_kind as enum ('spam', 'offensive', 'fake', 'irrelevant', 'other');
exception when duplicate_object then null;
end $$;

-- Réutilise venue_report_status (open/reviewing/resolved/rejected) plutôt que
-- de dupliquer un enum identique.

create table if not exists public.review_reports (
  id              uuid primary key default gen_random_uuid(),
  review_id       uuid not null references public.reviews(id) on delete cascade,
  reporter_id     uuid not null references public.profiles(id),
  kind            review_report_kind not null,
  details         text check (details is null or length(details) <= 1000),
  status          venue_report_status not null default 'open',
  resolved_by     uuid references public.profiles(id),
  resolved_at     timestamptz,
  resolution_note text check (resolution_note is null or length(resolution_note) <= 1000),
  created_at      timestamptz not null default now()
);

create index if not exists idx_review_reports_review_open
  on public.review_reports(review_id) where status in ('open', 'reviewing');
create index if not exists idx_review_reports_status_recent
  on public.review_reports(status, created_at desc);
create index if not exists idx_review_reports_reporter
  on public.review_reports(reporter_id, created_at desc);

alter table public.review_reports enable row level security;

drop policy if exists "review_reports_select_reporter" on public.review_reports;
create policy "review_reports_select_reporter" on public.review_reports
  for select to authenticated using (reporter_id = auth.uid());

drop policy if exists "review_reports_select_owner" on public.review_reports;
create policy "review_reports_select_owner" on public.review_reports
  for select to authenticated
  using (
    exists (
      select 1 from public.reviews rv
      join public.venues v on v.id = rv.venue_id
      where rv.id = review_reports.review_id and v.owner_id = auth.uid()
    )
  );

drop policy if exists "review_reports_select_admin" on public.review_reports;
create policy "review_reports_select_admin" on public.review_reports
  for select to authenticated using (public.is_admin());

drop policy if exists "review_reports_insert_authenticated" on public.review_reports;
create policy "review_reports_insert_authenticated" on public.review_reports
  for insert to authenticated with check (reporter_id = auth.uid());

drop policy if exists "review_reports_update_admin" on public.review_reports;
create policy "review_reports_update_admin" on public.review_reports
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "review_reports_delete_admin" on public.review_reports;
create policy "review_reports_delete_admin" on public.review_reports
  for delete to authenticated using (public.is_admin());

create or replace function public.submit_review_report(
  p_review_id uuid,
  p_kind      text,
  p_details   text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_kind review_report_kind;
  v_existing uuid;
  v_new_id uuid;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_review_id is null then raise exception 'REVIEW_REQUIRED'; end if;
  begin
    v_kind := p_kind::review_report_kind;
  exception when others then
    raise exception 'INVALID_KIND';
  end;

  select id into v_existing
    from public.review_reports
   where review_id = p_review_id
     and reporter_id = v_uid
     and status in ('open', 'reviewing')
   limit 1;
  if v_existing is not null then
    return jsonb_build_object('ok', false, 'reason', 'ALREADY_REPORTED', 'report_id', v_existing);
  end if;

  insert into public.review_reports (review_id, reporter_id, kind, details)
  values (p_review_id, v_uid, v_kind, nullif(trim(coalesce(p_details, '')), ''))
  returning id into v_new_id;

  return jsonb_build_object('ok', true, 'report_id', v_new_id);
end;
$$;

revoke execute on function public.submit_review_report(uuid, text, text) from public;
grant execute on function public.submit_review_report(uuid, text, text) to authenticated;

create or replace function public.list_review_reports(
  p_status text default 'open',
  p_limit  integer default 100
) returns table (
  id              uuid,
  review_id       uuid,
  review_body     text,
  review_rating   int,
  venue_id        uuid,
  venue_name      text,
  reporter_id     uuid,
  reporter_name   text,
  kind            review_report_kind,
  details         text,
  status          venue_report_status,
  resolved_by     uuid,
  resolved_at     timestamptz,
  resolution_note text,
  created_at      timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    rr.id, rr.review_id, rv.body, rv.rating, rv.venue_id, v.name,
    rr.reporter_id, p.full_name,
    rr.kind, rr.details, rr.status, rr.resolved_by, rr.resolved_at, rr.resolution_note, rr.created_at
  from public.review_reports rr
  join public.reviews rv on rv.id = rr.review_id
  left join public.venues v on v.id = rv.venue_id
  left join public.profiles p on p.id = rr.reporter_id
  where public.is_admin()
    and (p_status is null or p_status = 'all' or rr.status::text = p_status)
  order by rr.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

revoke execute on function public.list_review_reports(text, integer) from public;
grant execute on function public.list_review_reports(text, integer) to authenticated;

create or replace function public.resolve_review_report(
  p_report_id uuid,
  p_status    text,
  p_note      text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status venue_report_status;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  begin
    v_status := p_status::venue_report_status;
  exception when others then
    raise exception 'INVALID_STATUS';
  end;
  update public.review_reports
     set status          = v_status,
         resolved_by     = case when v_status in ('resolved','rejected') then auth.uid() else resolved_by end,
         resolved_at     = case when v_status in ('resolved','rejected') then now()       else resolved_at end,
         resolution_note = coalesce(nullif(trim(coalesce(p_note, '')), ''), resolution_note)
   where id = p_report_id;
end;
$$;

revoke execute on function public.resolve_review_report(uuid, text, text) from public;
grant execute on function public.resolve_review_report(uuid, text, text) to authenticated;

comment on table public.review_helpful_votes is
  'Votes "avis utile" — un vote max par (user, review), toggle via toggle_review_helpful.';
comment on table public.review_reports is
  'Signalements communautaires sur les avis. Soumis via submit_review_report (anti-spam par user/review), traités par admin via resolve_review_report.';
comment on function public.submit_review is
  'Soumet un avis vérifié (exactement une source : reservation_id/room_booking_id/order_id), après contrôle de propriété et de statut terminal.';
comment on function public.list_my_reviewable_visits is
  'Visites éligibles à un avis (non encore notées) pour l''utilisateur courant sur un venue donné.';
