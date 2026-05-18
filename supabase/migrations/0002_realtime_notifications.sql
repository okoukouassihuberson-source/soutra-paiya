-- ============================================================================
-- SOUTRA-PAIYA — Migration 0002
-- Notifications + activation du Realtime (reservations, transactions, notifications)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- NOTIFICATIONS
-- ----------------------------------------------------------------------------
create table if not exists notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  type text not null default 'system',          -- reservation | payment | system | ...
  title text not null,
  body text,
  metadata jsonb not null default '{}'::jsonb,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_user   on notifications(user_id, created_at desc);
create index if not exists idx_notifications_unread on notifications(user_id) where read = false;

alter table notifications enable row level security;

drop policy if exists "notifications_select_self" on notifications;
create policy "notifications_select_self" on notifications
  for select using (auth.uid() = user_id);

drop policy if exists "notifications_update_self" on notifications;
create policy "notifications_update_self" on notifications
  for update using (auth.uid() = user_id);

drop policy if exists "notifications_insert_self" on notifications;
create policy "notifications_insert_self" on notifications
  for insert with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- TRIGGER : notifier le propriétaire du venue à chaque réservation / paiement
-- security definer => peut lire venues + insérer dans notifications hors RLS.
-- ----------------------------------------------------------------------------
create or replace function tg_notify_venue_owner() returns trigger as $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner from venues where id = new.venue_id;
  if v_owner is null then
    return new;
  end if;

  if (tg_op = 'INSERT') then
    insert into notifications (user_id, type, title, body, metadata)
    values (
      v_owner, 'reservation', 'Nouvelle réservation',
      'Table pour ' || new.party_size || ' — ' || to_char(new.date_time, 'DD/MM" à "HH24:MI'),
      jsonb_build_object('reservation_id', new.id, 'venue_id', new.venue_id, 'party_size', new.party_size)
    );
  elsif (tg_op = 'UPDATE'
         and new.status = 'confirmed'
         and old.status is distinct from 'confirmed') then
    insert into notifications (user_id, type, title, body, metadata)
    values (
      v_owner, 'payment', 'Paiement reçu',
      'Acompte de ' || new.deposit_xof || ' FCFA confirmé',
      jsonb_build_object('reservation_id', new.id, 'venue_id', new.venue_id, 'amount_xof', new.deposit_xof)
    );
  end if;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists notify_owner_on_reservation on reservations;
create trigger notify_owner_on_reservation
  after insert or update on reservations
  for each row execute function tg_notify_venue_owner();

-- ----------------------------------------------------------------------------
-- REALTIME — exposer les tables au flux temps réel
-- Supabase Realtime lit le WAL Postgres via la publication `supabase_realtime`.
-- REPLICA IDENTITY FULL => les payloads UPDATE/DELETE incluent l'ancienne ligne
-- (indispensable pour comparer old.status vs new.status côté client).
-- ----------------------------------------------------------------------------
alter table reservations  replica identity full;
alter table transactions  replica identity full;
alter table notifications replica identity full;

do $$
declare
  t text;
begin
  -- La publication existe par défaut sur un projet Supabase ; filet de sécurité.
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach t in array array['reservations', 'transactions', 'notifications']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
