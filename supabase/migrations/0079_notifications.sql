-- ============================================================================
-- SOUTRA — Migration 0079 : centre de notifications in-app
-- ============================================================================
-- RÉÉCRITE EN CONVERGENCE (et non en création).
--
-- La version d'origine du handoff faisait `create table public.notifications`.
-- Elle échoue sur la prod (SQLSTATE 42P07) : la table existe déjà, créée hors
-- de l'historique de migrations. Le dump du schéma distant montre qu'elle est
-- VIVANTE, pas orpheline :
--   - le trigger `notify_owner_on_reservation` -> `tg_notify_venue_owner()`
--     y insère à chaque réservation (nouvelle demande + acompte confirmé),
--     pour prévenir le GÉRANT du lieu ;
--   - RLS activée en `select/update/insert self`, REPLICA IDENTITY FULL
--     (realtime), FK vers `profiles(id)` on delete cascade.
-- La détruire ferait donc perdre l'historique et casserait les notifications
-- côté Pro. On l'aligne en place sur le schéma attendu par 0080 et par
-- l'écran /notifications.
--
-- Correspondance des colonnes :
--   type text      -> kind notification_kind   (valeurs remappées)
--   metadata jsonb -> meta jsonb               (renommage)
--   read boolean   -> read_at timestamptz      (booléen -> horodatage)
--   (nouveau)         route text
--
-- `route` porte le chemin expo-router à ouvrir au tap ('/venue/<uuid>',
-- '/orders', '/(tabs)/wallet'…). Le routage vit en base, avec la notification,
-- plutôt que dans un switch côté client à maintenir.
-- ============================================================================

create type public.notification_kind as enum (
  'reservation_pending',   -- envoyée au lieu, 48 h pour répondre
  'reservation_confirmed',
  'reservation_declined',  -- dépôt rendu
  'order_status',          -- payée -> cuisine -> retrait/livraison
  'payment_received',      -- P2P entrant
  'payment_sent',
  'loyalty',               -- palier atteint, points crédités
  'social',                -- like, commentaire, match
  'system'
);

-- ----------------------------------------------------------------------------
-- 1) Colonnes
-- ----------------------------------------------------------------------------

alter table public.notifications add column route text;

alter table public.notifications rename column metadata to meta;

-- `read` booléen -> `read_at` horodaté. On ne connaît pas la date de lecture
-- réelle des lignes déjà lues : on retombe sur `created_at`, qui garde l'ordre
-- chronologique et la sémantique « lue ».
alter table public.notifications add column read_at timestamptz;

update public.notifications
   set read_at = created_at
 where read = true;

alter table public.notifications drop column read;

-- `type` text -> `kind` enum. Les valeurs réellement écrites par
-- `tg_notify_venue_owner` sont 'reservation' et 'payment' ; le défaut de la
-- colonne est 'system'. Tout ce qui ne correspond pas retombe sur 'system'
-- plutôt que de faire échouer la migration.
alter table public.notifications add column kind public.notification_kind;

update public.notifications
   set kind = case type
                when 'reservation' then 'reservation_pending'::public.notification_kind
                when 'payment'     then 'payment_received'::public.notification_kind
                when 'system'      then 'system'::public.notification_kind
                else 'system'::public.notification_kind
              end;

alter table public.notifications alter column kind set not null;
alter table public.notifications drop column type;

-- ----------------------------------------------------------------------------
-- 2) Index
-- ----------------------------------------------------------------------------
-- L'index partiel existant portait sur `read = false`, colonne supprimée : il
-- a disparu avec elle. `idx_notifications_user` couvre déjà (user_id,
-- created_at desc) — on le garde et on ne recrée que le partiel sur read_at.

create index if not exists idx_notifications_unread
  on public.notifications (user_id)
  where read_at is null;

-- ----------------------------------------------------------------------------
-- 3) RLS
-- ----------------------------------------------------------------------------
-- Les policies select/update self existent déjà et restent valables.
-- En revanche `notifications_insert_self` autorise un client à s'écrire ses
-- propres notifications : n'importe qui pourrait se fabriquer un faux
-- « Paiement reçu ». L'émission passe désormais exclusivement par
-- `emit_notification` (security definer), donc on la retire.
drop policy if exists "notifications_insert_self" on public.notifications;

-- ----------------------------------------------------------------------------
-- 4) Compteur de non-lues — appelé au montage de la barre d'onglets.
-- ----------------------------------------------------------------------------
create or replace function public.unread_notifications_count()
returns int
language sql
stable
security invoker
set search_path = public
as $$
  select count(*)::int
  from public.notifications
  where user_id = auth.uid()
    and read_at is null;
$$;

grant execute on function public.unread_notifications_count() to authenticated;

-- ----------------------------------------------------------------------------
-- 5) « Tout lire » — une seule requête, retourne le nombre de lignes touchées.
-- ----------------------------------------------------------------------------
create or replace function public.mark_all_notifications_read()
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count int;
begin
  update public.notifications
     set read_at = now()
   where user_id = auth.uid()
     and read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.mark_all_notifications_read() to authenticated;

-- ----------------------------------------------------------------------------
-- 6) Helper serveur : émettre une notification.
-- ----------------------------------------------------------------------------
create or replace function public.emit_notification(
  p_user_id uuid,
  p_kind    public.notification_kind,
  p_title   text,
  p_body    text default null,
  p_route   text default null,
  p_meta    jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.notifications (user_id, kind, title, body, route, meta)
  values (p_user_id, p_kind, p_title, p_body, p_route, coalesce(p_meta, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.emit_notification(uuid, public.notification_kind, text, text, text, jsonb) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 7) Réalignement du trigger existant côté GÉRANT
-- ----------------------------------------------------------------------------
-- `tg_notify_venue_owner` insère encore en (type, metadata) : ces colonnes
-- n'existent plus, la fonction lèverait à la prochaine réservation. On la
-- réécrit sur `emit_notification`.
--
-- Elle reste COMPLÉMENTAIRE de `tg_reservations_notify` (0080) : celle-ci
-- notifie le CLIENT (`new.user_id`), celle-là le GÉRANT (`venues.owner_id`).
-- Les deux doivent coexister.
create or replace function public.tg_notify_venue_owner() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner from public.venues where id = new.venue_id;
  if v_owner is null then
    return new;
  end if;

  if (tg_op = 'INSERT') then
    perform public.emit_notification(
      v_owner, 'reservation_pending',
      'Nouvelle réservation',
      'Table pour ' || new.party_size || ' — ' || to_char(new.date_time, 'DD/MM" à "HH24:MI'),
      '/pro',
      jsonb_build_object('reservation_id', new.id, 'venue_id', new.venue_id,
                         'party_size', new.party_size)
    );
  elsif (tg_op = 'UPDATE'
         and new.status = 'confirmed'
         and old.status is distinct from 'confirmed') then
    perform public.emit_notification(
      v_owner, 'payment_received',
      'Paiement reçu',
      'Acompte de ' || new.deposit_xof || ' FCFA confirmé',
      '/pro',
      jsonb_build_object('reservation_id', new.id, 'venue_id', new.venue_id,
                         'amount_xof', new.deposit_xof)
    );
  end if;

  return new;
end;
$$;

comment on table public.notifications is
  'Journal des notifications in-app. Émission serveur uniquement (emit_notification). '
  'La colonne route porte le chemin expo-router ouvert au tap.';
