-- ============================================================================
-- SOUTRA PLAYCE V2 — Migration 0089 : système de notifications multicanal
-- ============================================================================
-- S'appuie sur l'existant (0079/0080 : table notifications, emit_notification,
-- unread_notifications_count, mark_all_notifications_read ; 0029 : push_tokens ;
-- Edge Function send-push), sans le modifier.
--
-- Ajoute :
--   • notification_preferences : choix par catégorie ET par canal
--   • notification_outbox      : file d'envoi (canaux : push Expo, push navigateur
--                                « webpush », email, sms, whatsapp). Les canaux
--                                sms/whatsapp sont prévus et désactivés par défaut.
--   • web_push_subscriptions   : abonnements push PWA
--   • notify_user()            : point d'entrée unique (in-app + mise en file)
--   • déclencheurs : réservations, paiements, soldes, annulations, modifications,
--                    soumissions à valider, publications, avis, nouveaux partenaires
--   • send_tourism_reminders() : rappels de départ / solde / paiement, idempotents
--   • claim/complete_notification_outbox : consommées par l'Edge Function notify-dispatch
-- Prérequis : 0088 (valeurs d'enum 'tourism' et 'promotion', déjà validées).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Préférences
-- ----------------------------------------------------------------------------
create table if not exists public.notification_preferences (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  category   text not null check (category in ('bookings','payments','reminders','updates','moderation','promotions')),
  channel    text not null check (channel in ('in_app','push','webpush','email','sms','whatsapp')),
  enabled    boolean not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, category, channel)
);
alter table public.notification_preferences enable row level security;
drop policy if exists notification_preferences_own on public.notification_preferences;
create policy notification_preferences_own on public.notification_preferences
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Valeur effective : préférence explicite, sinon défaut par canal.
create or replace function public.notification_channel_enabled(p_user uuid, p_category text, p_channel text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare v boolean;
begin
  select enabled into v from public.notification_preferences
   where user_id = p_user and category = p_category and channel = p_channel;
  if found then return v; end if;
  return case p_channel
    when 'in_app'   then true
    when 'push'     then p_category <> 'promotions'
    when 'webpush'  then p_category <> 'promotions'
    when 'email'    then p_category in ('bookings','payments','reminders','moderation')
    else false  -- sms, whatsapp : désactivés tant que l'utilisateur ne les active pas
  end;
end; $$;
revoke execute on function public.notification_channel_enabled(uuid, text, text) from public;
grant execute on function public.notification_channel_enabled(uuid, text, text) to service_role;

create or replace function public.get_my_notification_preferences()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare r jsonb := '{}'::jsonb; c text; ch text;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  foreach c in array array['bookings','payments','reminders','updates','moderation','promotions'] loop
    r := r || jsonb_build_object(c, '{}'::jsonb);
    foreach ch in array array['in_app','push','webpush','email','sms','whatsapp'] loop
      r := jsonb_set(r, array[c, ch], to_jsonb(public.notification_channel_enabled(auth.uid(), c, ch)));
    end loop;
  end loop;
  return r;
end; $$;

create or replace function public.set_notification_preference(p_category text, p_channel text, p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_category not in ('bookings','payments','reminders','updates','moderation','promotions')
     or p_channel not in ('in_app','push','webpush','email','sms','whatsapp') or p_enabled is null then
    raise exception 'INVALID_PREFERENCE';
  end if;
  insert into public.notification_preferences (user_id, category, channel, enabled)
  values (auth.uid(), p_category, p_channel, p_enabled)
  on conflict (user_id, category, channel) do update set enabled = excluded.enabled, updated_at = now();
  return jsonb_build_object('ok', true);
end; $$;

-- ----------------------------------------------------------------------------
-- 2) File d'envoi + abonnements push navigateur
-- ----------------------------------------------------------------------------
create table if not exists public.notification_outbox (
  id              bigserial primary key,
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  channel         text not null check (channel in ('push','webpush','email','sms','whatsapp')),
  status          text not null default 'pending' check (status in ('pending','processing','sent','failed','skipped')),
  attempts        integer not null default 0,
  last_error      text,
  run_after       timestamptz not null default now(),
  locked_at       timestamptz,
  sent_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists idx_notification_outbox_queue on public.notification_outbox (run_after) where status in ('pending','processing');
alter table public.notification_outbox enable row level security;  -- aucune policy : service role uniquement

create table if not exists public.web_push_subscriptions (
  endpoint   text primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists idx_web_push_user on public.web_push_subscriptions(user_id);
alter table public.web_push_subscriptions enable row level security;

create or replace function public.register_web_push(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or length(p_endpoint) > 2000
     or coalesce(length(p_p256dh), 0) < 10 or coalesce(length(p_auth), 0) < 10 then
    raise exception 'INVALID_SUBSCRIPTION';
  end if;
  delete from public.web_push_subscriptions where endpoint = p_endpoint;
  insert into public.web_push_subscriptions (endpoint, user_id, p256dh, auth, user_agent)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth, left(p_user_agent, 300));
end; $$;

create or replace function public.unregister_web_push(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  delete from public.web_push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
end; $$;

-- ----------------------------------------------------------------------------
-- 3) Émission : un seul point d'entrée
-- ----------------------------------------------------------------------------
create or replace function public.notification_category(p_event text)
returns text language sql immutable as $$
  select case p_event
    when 'booking_new' then 'bookings' when 'booking_cancelled' then 'bookings' when 'booking_expired' then 'bookings'
    when 'payment_confirmed' then 'payments' when 'payment_received' then 'payments' when 'balance_due' then 'payments'
    when 'departure_reminder' then 'reminders' when 'activity_reminder' then 'reminders' when 'payment_expiring' then 'reminders'
    when 'trip_submitted' then 'moderation' when 'activity_submitted' then 'moderation' when 'partner_new' then 'moderation'
    when 'trip_published' then 'moderation' when 'activity_published' then 'moderation' when 'partner_activated' then 'moderation'
    when 'promotion' then 'promotions'
    else 'updates'   -- trip_updated, trip_cancelled, activity_cancelled, slot_changed, review_new…
  end;
$$;

create or replace function public.fmt_xof(p_amount bigint)
returns text language sql immutable as $$
  select replace(to_char(coalesce(p_amount, 0), 'FM999G999G999G999'), ',', ' ') || ' FCFA';
$$;

create or replace function public.notify_user(
  p_user  uuid,
  p_event text,
  p_title text,
  p_body  text default null,
  p_route text default null,
  p_meta  jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cat text := public.notification_category(p_event);
  v_id  uuid;
  v_ch  text;
  v_dest boolean;
begin
  if p_user is null then return null; end if;
  if not public.notification_channel_enabled(p_user, v_cat, 'in_app') then return null; end if;

  v_id := public.emit_notification(
    p_user,
    (case when v_cat = 'promotions' then 'promotion' else 'tourism' end)::public.notification_kind,
    p_title, p_body, p_route,
    coalesce(p_meta, '{}'::jsonb) || jsonb_build_object('event', p_event, 'category', v_cat)
  );

  -- Mise en file des canaux externes, seulement si l'utilisateur les a activés
  -- ET qu'une destination existe (jeton, abonnement, email, téléphone).
  foreach v_ch in array array['push','webpush','email','sms','whatsapp'] loop
    v_dest := case v_ch
      when 'push'    then exists (select 1 from public.push_tokens where user_id = p_user)
      when 'webpush' then exists (select 1 from public.web_push_subscriptions where user_id = p_user)
      when 'email'   then exists (select 1 from public.profiles where id = p_user and nullif(email, '') is not null)
      else                exists (select 1 from public.profiles where id = p_user and nullif(phone, '') is not null)
    end;
    if v_dest and public.notification_channel_enabled(p_user, v_cat, v_ch) then
      insert into public.notification_outbox (notification_id, user_id, channel) values (v_id, p_user, v_ch);
    end if;
  end loop;
  return v_id;
end; $$;
revoke execute on function public.notify_user(uuid, text, text, text, text, jsonb) from public, anon, authenticated;

create or replace function public.notify_admins(p_event text, p_title text, p_body text, p_route text, p_meta jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare r record;
begin
  for r in select id from public.profiles where role::text = 'admin' loop
    perform public.notify_user(r.id, p_event, p_title, p_body, p_route, p_meta);
  end loop;
end; $$;
revoke execute on function public.notify_admins(text, text, text, text, jsonb) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4) Déclencheurs — voyages
-- ----------------------------------------------------------------------------
create or replace function public.tg_trip_bookings_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare t public.trips%rowtype; v_name text; v_delta bigint;
begin
  select * into t from public.trips where id = new.trip_id;
  if tg_op = 'INSERT' then
    select coalesce(nullif(full_name, ''), 'Un voyageur') into v_name from public.profiles where id = new.user_id;
    perform public.notify_user(t.organizer_id, 'booking_new', 'Nouvelle réservation',
      v_name || ' · ' || new.participants || ' place(s) · ' || t.title, '/organisateur',
      jsonb_build_object('booking_id', new.id, 'trip_id', t.id));
    return new;
  end if;

  if new.paid_xof > old.paid_xof then
    v_delta := new.paid_xof - old.paid_xof;
    perform public.notify_user(new.user_id, 'payment_confirmed', 'Paiement confirmé',
      public.fmt_xof(v_delta) || ' reçus pour « ' || t.title || ' ».', '/mes-voyages/' || new.id,
      jsonb_build_object('booking_id', new.id, 'amount_xof', v_delta));
    perform public.notify_user(t.organizer_id, 'payment_received', 'Paiement reçu',
      public.fmt_xof(v_delta) || ' · ' || new.reference || ' · ' || t.title, '/organisateur',
      jsonb_build_object('booking_id', new.id, 'amount_xof', v_delta));
    if new.status = 'confirmed' and new.paid_xof < new.total_xof then
      perform public.notify_user(new.user_id, 'balance_due', 'Solde à payer',
        'Il reste ' || public.fmt_xof(new.total_xof - new.paid_xof) || ' à régler avant le départ du ' || to_char(t.starts_on, 'DD/MM/YYYY') || '.',
        '/mes-voyages/' || new.id, jsonb_build_object('booking_id', new.id, 'due_xof', new.total_xof - new.paid_xof));
    end if;
  end if;

  if new.status = 'cancelled' and old.status <> 'cancelled' then
    if old.paid_xof = 0 and old.status = 'pending' and old.expires_at is not null and old.expires_at < now() then
      perform public.notify_user(new.user_id, 'booking_expired', 'Réservation expirée',
        'Votre réservation ' || new.reference || ' (' || t.title || ') a expiré faute de paiement.', '/mes-voyages',
        jsonb_build_object('booking_id', new.id));
    else
      if auth.uid() is distinct from new.user_id then
        perform public.notify_user(new.user_id, 'booking_cancelled', 'Réservation annulée',
          'Votre réservation ' || new.reference || ' (' || t.title || ') a été annulée.'
          || case when new.paid_xof > 0 then ' Contactez l''organisateur pour le remboursement de ' || public.fmt_xof(new.paid_xof) || '.' else '' end,
          '/mes-voyages/' || new.id, jsonb_build_object('booking_id', new.id));
      end if;
      if auth.uid() is distinct from t.organizer_id then
        perform public.notify_user(t.organizer_id, 'booking_cancelled', 'Réservation annulée',
          new.reference || ' · ' || t.title || ' · ' || new.participants || ' place(s) libérée(s)', '/organisateur',
          jsonb_build_object('booking_id', new.id));
      end if;
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists trg_trip_bookings_notify on public.trip_bookings;
create trigger trg_trip_bookings_notify after insert or update on public.trip_bookings
  for each row execute function public.tg_trip_bookings_notify();

create or replace function public.tg_trips_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record; v_changes text[] := '{}';
begin
  if new.submitted_at is not null and old.submitted_at is distinct from new.submitted_at then
    perform public.notify_admins('trip_submitted', 'Voyage à valider', new.title, '/admin?tab=trips', jsonb_build_object('trip_id', new.id));
  end if;
  if old.status = 'draft' and new.status = 'published' then
    perform public.notify_user(new.organizer_id, 'trip_published', 'Voyage publié',
      '« ' || new.title || ' » est en ligne et ouvert aux réservations.', '/organisateur', jsonb_build_object('trip_id', new.id));
  end if;
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    for r in select id, user_id from public.trip_bookings where trip_id = new.id and status in ('pending','paid','confirmed') loop
      perform public.notify_user(r.user_id, 'trip_cancelled', 'Voyage annulé',
        '« ' || new.title || ' » a été annulé. Contactez l''organisateur pour le remboursement.', '/mes-voyages/' || r.id,
        jsonb_build_object('booking_id', r.id, 'trip_id', new.id));
    end loop;
  elsif new.status in ('published','full','closed') then
    if old.starts_on is distinct from new.starts_on or old.ends_on is distinct from new.ends_on then
      v_changes := v_changes || ('Dates : ' || to_char(new.starts_on, 'DD/MM') || ' → ' || to_char(new.ends_on, 'DD/MM/YYYY'));
    end if;
    if old.departure_point is distinct from new.departure_point then
      v_changes := v_changes || ('Départ : ' || coalesce(new.departure_point, 'à préciser'));
    end if;
    if old.departure_time is distinct from new.departure_time then
      v_changes := v_changes || ('Heure de départ : ' || coalesce(to_char(new.departure_time, 'HH24:MI'), 'à préciser'));
    end if;
    if old.return_time is distinct from new.return_time then
      v_changes := v_changes || ('Heure de retour : ' || coalesce(to_char(new.return_time, 'HH24:MI'), 'à préciser'));
    end if;
    if cardinality(v_changes) > 0 then
      for r in select id, user_id from public.trip_bookings where trip_id = new.id and status in ('pending','paid','confirmed') loop
        perform public.notify_user(r.user_id, 'trip_updated', 'Modification de votre voyage',
          '« ' || new.title || ' » : ' || array_to_string(v_changes, ' · '), '/mes-voyages/' || r.id,
          jsonb_build_object('booking_id', r.id, 'trip_id', new.id));
      end loop;
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists trg_trips_notify on public.trips;
create trigger trg_trips_notify after update on public.trips
  for each row execute function public.tg_trips_notify();

-- ----------------------------------------------------------------------------
-- 5) Déclencheurs — activités
-- ----------------------------------------------------------------------------
create or replace function public.tg_activity_bookings_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare a public.activities%rowtype; s public.activity_slots%rowtype; v_name text; v_delta bigint;
begin
  select * into a from public.activities where id = new.activity_id;
  select * into s from public.activity_slots where id = new.slot_id;
  if tg_op = 'INSERT' then
    select coalesce(nullif(full_name, ''), 'Un voyageur') into v_name from public.profiles where id = new.user_id;
    perform public.notify_user(a.organizer_id, 'booking_new', 'Nouvelle réservation',
      v_name || ' · ' || new.participants || ' pers. · ' || a.title || ' · ' || to_char(s.starts_at, 'DD/MM HH24:MI'),
      '/organisateur', jsonb_build_object('booking_id', new.id, 'activity_id', a.id));
    return new;
  end if;

  if new.paid_xof > old.paid_xof then
    v_delta := new.paid_xof - old.paid_xof;
    perform public.notify_user(new.user_id, 'payment_confirmed', 'Paiement confirmé',
      'Votre billet pour « ' || a.title || ' » (' || to_char(s.starts_at, 'DD/MM HH24:MI') || ') est disponible.',
      '/mes-activites/' || new.id, jsonb_build_object('booking_id', new.id, 'amount_xof', v_delta));
    perform public.notify_user(a.organizer_id, 'payment_received', 'Paiement reçu',
      public.fmt_xof(v_delta) || ' · ' || new.reference || ' · ' || a.title, '/organisateur',
      jsonb_build_object('booking_id', new.id, 'amount_xof', v_delta));
  end if;

  if new.status = 'cancelled' and old.status <> 'cancelled' then
    if old.paid_xof = 0 and old.status = 'pending' and old.expires_at is not null and old.expires_at < now() then
      perform public.notify_user(new.user_id, 'booking_expired', 'Réservation expirée',
        'Votre réservation ' || new.reference || ' (' || a.title || ') a expiré faute de paiement.', '/mes-activites',
        jsonb_build_object('booking_id', new.id));
    else
      if auth.uid() is distinct from new.user_id then
        perform public.notify_user(new.user_id, 'booking_cancelled', 'Réservation annulée',
          'Votre réservation ' || new.reference || ' (' || a.title || ') a été annulée.'
          || case when new.paid_xof > 0 then ' Contactez l''organisateur pour le remboursement de ' || public.fmt_xof(new.paid_xof) || '.' else '' end,
          '/mes-activites/' || new.id, jsonb_build_object('booking_id', new.id));
      end if;
      if auth.uid() is distinct from a.organizer_id then
        perform public.notify_user(a.organizer_id, 'booking_cancelled', 'Réservation annulée',
          new.reference || ' · ' || a.title || ' · ' || new.participants || ' place(s) libérée(s)', '/organisateur',
          jsonb_build_object('booking_id', new.id));
      end if;
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists trg_activity_bookings_notify on public.activity_bookings;
create trigger trg_activity_bookings_notify after insert or update on public.activity_bookings
  for each row execute function public.tg_activity_bookings_notify();

create or replace function public.tg_activities_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.submitted_at is not null and old.submitted_at is distinct from new.submitted_at then
    perform public.notify_admins('activity_submitted', 'Activité à valider', new.title, '/admin?tab=activities', jsonb_build_object('activity_id', new.id));
  end if;
  if old.status = 'draft' and new.status = 'published' then
    perform public.notify_user(new.organizer_id, 'activity_published', 'Activité publiée',
      '« ' || new.title || ' » est en ligne et ouverte aux réservations.', '/organisateur', jsonb_build_object('activity_id', new.id));
  end if;
  if new.status = 'archived' and old.status <> 'archived' then
    for r in select b.id, b.user_id from public.activity_bookings b join public.activity_slots s on s.id = b.slot_id
              where b.activity_id = new.id and b.status in ('pending','paid','confirmed') and s.starts_at > now() loop
      perform public.notify_user(r.user_id, 'activity_cancelled', 'Activité annulée',
        '« ' || new.title || ' » n''est plus proposée. Contactez l''organisateur pour le remboursement.', '/mes-activites/' || r.id,
        jsonb_build_object('booking_id', r.id, 'activity_id', new.id));
    end loop;
  end if;
  return new;
end; $$;
drop trigger if exists trg_activities_notify on public.activities;
create trigger trg_activities_notify after update on public.activities
  for each row execute function public.tg_activities_notify();

create or replace function public.tg_activity_slots_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record; a public.activities%rowtype;
begin
  if (old.starts_at is distinct from new.starts_at) or (old.status = 'open' and new.status = 'closed') then
    select * into a from public.activities where id = new.activity_id;
    for r in select id, user_id from public.activity_bookings where slot_id = new.id and status in ('pending','paid','confirmed') loop
      perform public.notify_user(r.user_id, 'slot_changed',
        case when old.starts_at is distinct from new.starts_at then 'Horaire modifié' else 'Créneau fermé' end,
        case when old.starts_at is distinct from new.starts_at
             then '« ' || a.title || ' » : nouveau départ le ' || to_char(new.starts_at, 'DD/MM à HH24:MI') || '.'
             else '« ' || a.title || ' » du ' || to_char(old.starts_at, 'DD/MM à HH24:MI') || ' : contactez l''organisateur.' end,
        '/mes-activites/' || r.id, jsonb_build_object('booking_id', r.id, 'activity_id', a.id));
    end loop;
  end if;
  return new;
end; $$;
drop trigger if exists trg_activity_slots_notify on public.activity_slots;
create trigger trg_activity_slots_notify after update on public.activity_slots
  for each row execute function public.tg_activity_slots_notify();

create or replace function public.tg_activity_reviews_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare a public.activities%rowtype;
begin
  select * into a from public.activities where id = new.activity_id;
  perform public.notify_user(a.organizer_id, 'review_new', 'Nouvel avis ' || repeat('★', new.rating::int),
    a.title || coalesce(' : ' || left(new.comment, 120), ''), '/organisateur',
    jsonb_build_object('activity_id', a.id, 'review_id', new.id));
  return new;
end; $$;
drop trigger if exists trg_activity_reviews_notify on public.activity_reviews;
create trigger trg_activity_reviews_notify after insert on public.activity_reviews
  for each row execute function public.tg_activity_reviews_notify();

-- ----------------------------------------------------------------------------
-- 6) Nouveaux partenaires
-- ----------------------------------------------------------------------------
create or replace function public.tg_profiles_partner_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role and new.role::text in ('organizer','guide','venue_owner') then
    perform public.notify_admins('partner_new', 'Nouveau partenaire',
      coalesce(nullif(new.full_name, ''), 'Un utilisateur') || ' : ' ||
      case new.role::text when 'organizer' then 'organisateur' when 'guide' then 'guide' else 'propriétaire d''établissement' end,
      '/admin?tab=users', jsonb_build_object('profile_id', new.id));
    if new.role::text in ('organizer','guide') then
      perform public.notify_user(new.id, 'partner_activated', 'Votre espace partenaire est activé',
        'Vous pouvez créer vos voyages et activités depuis l''espace organisateur.', '/organisateur', '{}'::jsonb);
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists trg_profiles_partner_notify on public.profiles;
create trigger trg_profiles_partner_notify after update of role on public.profiles
  for each row execute function public.tg_profiles_partner_notify();

-- ----------------------------------------------------------------------------
-- 7) Rappels planifiés (idempotents) — appelés toutes les ~15 min par notify-dispatch
-- ----------------------------------------------------------------------------
create table if not exists public.notification_reminders (
  kind    text not null,
  ref_id  uuid not null,
  tag     text not null,
  sent_at timestamptz not null default now(),
  primary key (kind, ref_id, tag)
);
alter table public.notification_reminders enable row level security;

create or replace function public.send_tourism_reminders()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare r record; n integer := 0; v_tag text; v_days integer; v_ins integer;
begin
  -- Voyages : départ J-3 et J-1 (réservations payées ou avec acompte)
  for r in select b.id, b.user_id, b.reference, t.title, t.starts_on, t.departure_point, t.departure_time, (t.starts_on - current_date) as d
             from public.trip_bookings b join public.trips t on t.id = b.trip_id
            where b.status in ('paid','confirmed') and t.status in ('published','full','closed')
              and (t.starts_on - current_date) in (1, 3) loop
    v_tag := 'd' || r.d;
    insert into public.notification_reminders (kind, ref_id, tag) values ('trip_departure', r.id, v_tag) on conflict do nothing;
    get diagnostics v_ins = row_count;
    if v_ins = 1 then
      perform public.notify_user(r.user_id, 'departure_reminder',
        case when r.d = 1 then 'Départ demain' else 'Départ dans 3 jours' end,
        '« ' || r.title || ' »' || coalesce(' · rendez-vous : ' || r.departure_point, '')
          || coalesce(' à ' || to_char(r.departure_time, 'HH24:MI'), '') || '.',
        '/mes-voyages/' || r.id, jsonb_build_object('booking_id', r.id));
      n := n + 1;
    end if;
  end loop;

  -- Voyages : solde à payer J-7 et J-2
  for r in select b.id, b.user_id, t.title, t.starts_on, (b.total_xof - b.paid_xof) as due, (t.starts_on - current_date) as d
             from public.trip_bookings b join public.trips t on t.id = b.trip_id
            where b.status = 'confirmed' and b.paid_xof < b.total_xof and t.status in ('published','full','closed')
              and (t.starts_on - current_date) in (2, 7) loop
    v_tag := 'bal' || r.d;
    insert into public.notification_reminders (kind, ref_id, tag) values ('trip_balance', r.id, v_tag) on conflict do nothing;
    get diagnostics v_ins = row_count;
    if v_ins = 1 then
      perform public.notify_user(r.user_id, 'balance_due', 'Solde à payer',
        'Il reste ' || public.fmt_xof(r.due) || ' pour « ' || r.title || ' » (départ le ' || to_char(r.starts_on, 'DD/MM/YYYY') || ').',
        '/mes-voyages/' || r.id, jsonb_build_object('booking_id', r.id, 'due_xof', r.due));
      n := n + 1;
    end if;
  end loop;

  -- Voyages : réservation non payée qui expire dans moins de 3 h
  for r in select b.id, b.user_id, b.reference, t.title from public.trip_bookings b join public.trips t on t.id = b.trip_id
            where b.status = 'pending' and b.paid_xof = 0 and b.expires_at between now() and now() + interval '3 hours' loop
    insert into public.notification_reminders (kind, ref_id, tag) values ('trip_expiring', r.id, 'exp') on conflict do nothing;
    get diagnostics v_ins = row_count;
    if v_ins = 1 then
      perform public.notify_user(r.user_id, 'payment_expiring', 'Réservation à régler',
        'Votre réservation ' || r.reference || ' (« ' || r.title || ' ») expire bientôt : payez pour garder vos places.',
        '/mes-voyages/' || r.id, jsonb_build_object('booking_id', r.id));
      n := n + 1;
    end if;
  end loop;

  -- Activités : rappel 24 h et 3 h avant le créneau
  for r in select b.id, b.user_id, a.title, s.starts_at, a.address,
                  case when s.starts_at <= now() + interval '3 hours' then 'h3' else 'h24' end as tag
             from public.activity_bookings b join public.activities a on a.id = b.activity_id
             join public.activity_slots s on s.id = b.slot_id
            where b.status in ('paid','confirmed') and s.starts_at > now() and s.starts_at <= now() + interval '24 hours' loop
    -- le rappel 3 h supplante le 24 h : on marque les deux pour ne pas envoyer 24 h après coup
    insert into public.notification_reminders (kind, ref_id, tag) values ('activity', r.id, r.tag) on conflict do nothing;
    get diagnostics v_ins = row_count;
    if r.tag = 'h3' then
      insert into public.notification_reminders (kind, ref_id, tag) values ('activity', r.id, 'h24') on conflict do nothing;
    end if;
    if v_ins = 1 then
      perform public.notify_user(r.user_id, 'activity_reminder',
        case when r.tag = 'h3' then 'C''est bientôt !' else 'Rappel : activité demain' end,
        '« ' || r.title || ' » le ' || to_char(r.starts_at, 'DD/MM à HH24:MI') || coalesce(' · ' || r.address, '') || '. Présentez votre QR code.',
        '/mes-activites/' || r.id, jsonb_build_object('booking_id', r.id));
      n := n + 1;
    end if;
  end loop;

  -- Activités : réservation non payée qui expire dans moins de 20 min
  for r in select b.id, b.user_id, b.reference, a.title from public.activity_bookings b join public.activities a on a.id = b.activity_id
            where b.status = 'pending' and b.paid_xof = 0 and b.expires_at between now() and now() + interval '20 minutes' loop
    insert into public.notification_reminders (kind, ref_id, tag) values ('activity_expiring', r.id, 'exp') on conflict do nothing;
    get diagnostics v_ins = row_count;
    if v_ins = 1 then
      perform public.notify_user(r.user_id, 'payment_expiring', 'Réservation à régler',
        'Votre réservation ' || r.reference || ' (« ' || r.title || ' ») expire dans quelques minutes.',
        '/mes-activites/' || r.id, jsonb_build_object('booking_id', r.id));
      n := n + 1;
    end if;
  end loop;

  return jsonb_build_object('sent', n);
end; $$;
revoke execute on function public.send_tourism_reminders() from public, anon, authenticated;
grant execute on function public.send_tourism_reminders() to service_role;

-- ----------------------------------------------------------------------------
-- 8) File d'envoi : prise en charge par l'Edge Function notify-dispatch
-- ----------------------------------------------------------------------------
create or replace function public.claim_notification_outbox(p_limit integer default 50)
returns table (
  outbox_id bigint, notification_id uuid, user_id uuid, channel text, attempts integer,
  title text, body text, route text, meta jsonb, email text, phone text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with c as (
    select o.id from public.notification_outbox o
     where (o.status = 'pending' and o.run_after <= now())
        or (o.status = 'processing' and o.locked_at < now() - interval '10 minutes')
     order by o.id
     limit greatest(1, least(coalesce(p_limit, 50), 200))
       for update skip locked),
  u as (
    update public.notification_outbox o
       set status = 'processing', locked_at = now(), attempts = o.attempts + 1
      from c where o.id = c.id
    returning o.id, o.notification_id, o.user_id, o.channel, o.attempts)
  select u.id, u.notification_id, u.user_id, u.channel, u.attempts,
         n.title, n.body, n.route, n.meta, p.email, p.phone
    from u
    join public.notifications n on n.id = u.notification_id
    join public.profiles p on p.id = u.user_id;
end; $$;

create or replace function public.complete_notification_outbox(p_id bigint, p_status text, p_error text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare o public.notification_outbox%rowtype;
begin
  if p_status not in ('sent','failed','skipped') then raise exception 'INVALID_STATUS'; end if;
  select * into o from public.notification_outbox where id = p_id for update;
  if not found then return; end if;
  if p_status = 'failed' and o.attempts < 5 then
    -- nouvelle tentative avec attente exponentielle : 2, 4, 8, 16 minutes
    update public.notification_outbox
       set status = 'pending', last_error = left(p_error, 500), locked_at = null,
           run_after = now() + make_interval(mins => power(2, o.attempts)::int)
     where id = p_id;
  else
    update public.notification_outbox
       set status = p_status, last_error = left(p_error, 500), locked_at = null,
           sent_at = case when p_status = 'sent' then now() else sent_at end
     where id = p_id;
  end if;
end; $$;

revoke execute on function public.claim_notification_outbox(integer) from public, anon, authenticated;
revoke execute on function public.complete_notification_outbox(bigint, text, text) from public, anon, authenticated;
grant execute on function public.claim_notification_outbox(integer) to service_role;
grant execute on function public.complete_notification_outbox(bigint, text, text) to service_role;

-- Droits des RPC utilisateur
revoke execute on function public.get_my_notification_preferences() from public;
revoke execute on function public.set_notification_preference(text, text, boolean) from public;
revoke execute on function public.register_web_push(text, text, text, text) from public;
revoke execute on function public.unregister_web_push(text) from public;
grant execute on function public.get_my_notification_preferences() to authenticated;
grant execute on function public.set_notification_preference(text, text, boolean) to authenticated;
grant execute on function public.register_web_push(text, text, text, text) to authenticated;
grant execute on function public.unregister_web_push(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 9) Planification (optionnelle, même principe que 0050) : toutes les 15 minutes.
--    Si pg_cron/pg_net sont absents, appeler notify-dispatch depuis un cron externe.
-- ----------------------------------------------------------------------------
do $$
declare v_cron boolean := false; v_net boolean := false;
begin
  begin create extension if not exists pg_cron; v_cron := true;
  exception when others then raise notice 'pg_cron non disponible : %', sqlerrm; end;
  begin create extension if not exists pg_net; v_net := true;
  exception when others then raise notice 'pg_net non disponible : %', sqlerrm; end;

  if v_cron and v_net then
    begin perform cron.unschedule('soutra_notify_dispatch'); exception when others then null; end;
    perform cron.schedule(
      'soutra_notify_dispatch',
      '*/15 * * * *',
      $cmd$
      select net.http_post(
        url := 'https://pjtmmzxcitbcwbbgtpdj.supabase.co/functions/v1/notify-dispatch',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        ),
        body := '{}'::jsonb
      ) as request_id;
      $cmd$
    );
  else
    raise notice 'pg_cron ou pg_net manquant : configurer un cron externe appelant notify-dispatch toutes les 15 minutes';
  end if;
exception when others then
  raise notice 'planification notify-dispatch ignorée : %', sqlerrm;
end $$;

comment on table public.notification_outbox is 'File d''envoi des notifications vers les canaux externes (push, webpush, email, sms, whatsapp). Consommée par l''Edge Function notify-dispatch.';
comment on function public.notify_user is 'Point d''entrée unique : crée la notification in-app et met en file les canaux externes activés par l''utilisateur.';
