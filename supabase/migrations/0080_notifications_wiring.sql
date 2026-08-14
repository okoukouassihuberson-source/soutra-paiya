-- ============================================================================
-- SOUTRA-PLAYCE — Migration 0080 : câblage des notifications sur les triggers
-- ============================================================================
-- Sans cette migration la table 0079 reste vide et l'écran /notifications
-- affiche son état vide indéfiniment.
--
-- Trois sources câblées, celles qui ont un état qui change dans le dos de
-- l'utilisateur :
--   - reservations : création (48 h d'attente), confirmation, refus (dépôt rendu)
--   - orders       : passage payée -> confirmée -> prête -> livrée/retirée
--   - transactions : transfert P2P reçu et envoyé
--
-- Les fonctions sont SECURITY DEFINER : elles écrivent dans notifications, dont
-- aucune policy n'autorise l'INSERT côté client. C'est volontaire — sinon un
-- utilisateur pourrait s'écrire un faux « paiement reçu ».
--
-- Prérequis : 0079_notifications.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Réservations
-- ----------------------------------------------------------------------------
-- Route : /(tabs)/activity — l'onglet renommé depuis tickets.tsx par le
-- redesign. Si le renommage n'est pas encore fait, remplacer par
-- '/(tabs)/tickets' ici, la valeur est en base et non dans le client.
-- ----------------------------------------------------------------------------

create or replace function public.tg_reservations_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venue text;
begin
  select name into v_venue from public.venues where id = new.venue_id;
  v_venue := coalesce(v_venue, 'le lieu');

  -- Création : dire tout de suite que l'argent est en séquestre, et pour
  -- combien de temps. C'est le point de confiance du produit.
  if tg_op = 'INSERT' then
    perform public.emit_notification(
      new.user_id,
      'reservation_pending',
      'Demande envoyée à ' || v_venue,
      case
        when coalesce(new.deposit_xof, 0) > 0 then
          'Ton dépôt est bloqué, pas encaissé. ' || v_venue ||
          ' a 48 h pour répondre — s''il refuse, il te revient en entier.'
        else
          v_venue || ' a 48 h pour répondre à ta demande.'
      end,
      '/(tabs)/activity',
      jsonb_build_object(
        'reservation_id', new.id,
        'venue_id', new.venue_id,
        'amount_xof', new.deposit_xof
      )
    );
    return new;
  end if;

  -- Changement d'état seulement.
  if new.status = old.status then
    return new;
  end if;

  if new.status = 'confirmed' then
    perform public.emit_notification(
      new.user_id, 'reservation_confirmed',
      v_venue || ' a confirmé ta table',
      case
        when coalesce(new.deposit_xof, 0) > 0
          then 'Ton dépôt sera déduit de l''addition à ton arrivée.'
        else null
      end,
      '/(tabs)/activity',
      jsonb_build_object('reservation_id', new.id, 'venue_id', new.venue_id,
                         'amount_xof', new.deposit_xof)
    );

  elsif new.status in ('cancelled', 'refunded') then
    perform public.emit_notification(
      new.user_id, 'reservation_declined',
      'Réservation annulée chez ' || v_venue,
      case
        when coalesce(new.deposit_xof, 0) > 0
          then 'Ton dépôt t''est rendu en entier, sans frais.'
        else null
      end,
      '/(tabs)/activity',
      jsonb_build_object('reservation_id', new.id, 'venue_id', new.venue_id,
                         'amount_xof', new.deposit_xof)
    );

  elsif new.status = 'no_show' then
    perform public.emit_notification(
      new.user_id, 'system',
      'Absence enregistrée chez ' || v_venue,
      'Le lieu t''a noté absent. Si c''est une erreur, contacte-le directement.',
      '/(tabs)/activity',
      jsonb_build_object('reservation_id', new.id, 'venue_id', new.venue_id)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_reservations_notify_insert on public.reservations;
create trigger trg_reservations_notify_insert
  after insert on public.reservations
  for each row execute function public.tg_reservations_notify();

drop trigger if exists trg_reservations_notify_status on public.reservations;
create trigger trg_reservations_notify_status
  after update of status on public.reservations
  for each row execute function public.tg_reservations_notify();

-- ----------------------------------------------------------------------------
-- 2) Commandes
-- ----------------------------------------------------------------------------
-- Deux événements distincts sur la même table : le paiement confirmé
-- (payment_status) et l'avancement en cuisine (status). Un seul trigger, deux
-- branches, pour garder l'ordre d'émission déterministe.
-- ----------------------------------------------------------------------------

create or replace function public.tg_orders_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venue text;
  v_pickup boolean := (new.delivery_method = 'pickup');
begin
  select name into v_venue from public.venues where id = new.venue_id;
  v_venue := coalesce(v_venue, 'le commerçant');

  -- Paiement encaissé
  if new.payment_status = 'paid' and old.payment_status <> 'paid' then
    perform public.emit_notification(
      new.user_id, 'order_status',
      'Commande ' || new.order_number || ' payée',
      v_venue || ' a reçu ta commande.',
      '/orders',
      jsonb_build_object('order_id', new.id, 'venue_id', new.venue_id,
                         'amount_xof', new.total_xof)
    );
  end if;

  if new.status <> old.status then
    if new.status = 'preparing' then
      perform public.emit_notification(
        new.user_id, 'order_status',
        'Ta commande est en préparation',
        v_venue || ' a commencé — ' || new.items_count || ' article' ||
        case when new.items_count > 1 then 's' else '' end || '.',
        '/orders',
        jsonb_build_object('order_id', new.id, 'venue_id', new.venue_id)
      );

    elsif new.status = 'ready' then
      perform public.emit_notification(
        new.user_id, 'order_status',
        case when v_pickup
          then 'Ta commande est prête à retirer'
          else 'Ta commande part en livraison' end,
        case when v_pickup
          then 'Présente le numéro ' || new.order_number || ' au comptoir de ' || v_venue || '.'
          else 'Le livreur est en route vers ' || coalesce(new.delivery_address, 'ton adresse') || '.' end,
        '/orders',
        jsonb_build_object('order_id', new.id, 'venue_id', new.venue_id)
      );

    elsif new.status = 'delivered' then
      perform public.emit_notification(
        new.user_id, 'order_status',
        case when v_pickup then 'Commande retirée' else 'Commande livrée' end,
        'Laisse un avis à ' || v_venue || ' si tu as deux minutes.',
        '/orders',
        jsonb_build_object('order_id', new.id, 'venue_id', new.venue_id)
      );

    elsif new.status = 'cancelled' then
      perform public.emit_notification(
        new.user_id, 'order_status',
        'Commande ' || new.order_number || ' annulée',
        coalesce(new.cancellation_reason, 'Aucun motif indiqué par ' || v_venue || '.'),
        '/orders',
        jsonb_build_object('order_id', new.id, 'venue_id', new.venue_id)
      );

    elsif new.status = 'refunded' then
      perform public.emit_notification(
        new.user_id, 'order_status',
        'Commande ' || new.order_number || ' remboursée',
        'Le montant est de retour sur ton solde SoutraPay.',
        '/(tabs)/wallet',
        jsonb_build_object('order_id', new.id, 'amount_xof', new.total_xof)
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_orders_notify on public.orders;
create trigger trg_orders_notify
  after update on public.orders
  for each row execute function public.tg_orders_notify();

-- ----------------------------------------------------------------------------
-- 3) Transferts P2P
-- ----------------------------------------------------------------------------
-- wallet_transfer (0008) insère une seule ligne dans transactions, avec
-- user_id = expéditeur et counterparty_id = destinataire. On notifie les deux
-- côtés depuis cette ligne unique.
--
-- Le destinataire est prioritaire : c'est lui qui n'a rien demandé.
-- ----------------------------------------------------------------------------

create or replace function public.tg_transactions_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender_name    text;
  v_recipient_name text;
begin
  if new.type <> 'transfer' or new.status <> 'success' or new.counterparty_id is null then
    return new;
  end if;

  select coalesce(nullif(trim(full_name), ''), 'Quelqu''un')
    into v_sender_name from public.profiles where id = new.user_id;
  select coalesce(nullif(trim(full_name), ''), 'un contact')
    into v_recipient_name from public.profiles where id = new.counterparty_id;

  perform public.emit_notification(
    new.counterparty_id, 'payment_received',
    'Tu as reçu de l''argent de ' || coalesce(v_sender_name, 'Quelqu''un'),
    new.description,
    '/(tabs)/wallet',
    jsonb_build_object('transaction_id', new.id, 'amount_xof', new.amount_xof,
                       'counterparty_id', new.user_id)
  );

  perform public.emit_notification(
    new.user_id, 'payment_sent',
    'Transfert à ' || coalesce(v_recipient_name, 'un contact') || ' effectué',
    new.description,
    '/(tabs)/wallet',
    jsonb_build_object('transaction_id', new.id, 'amount_xof', new.amount_xof,
                       'counterparty_id', new.counterparty_id)
  );

  return new;
end;
$$;

drop trigger if exists trg_transactions_notify on public.transactions;
create trigger trg_transactions_notify
  after insert on public.transactions
  for each row execute function public.tg_transactions_notify();

-- ----------------------------------------------------------------------------
-- 4) Reste à câbler
-- ----------------------------------------------------------------------------
-- La fidélité (0068_loyalty_engine) n'est pas branchée ici : le palier atteint
-- et le crédit de points s'émettent depuis les fonctions de ce moteur, pas
-- depuis un trigger de table. À ajouter avec un
--   perform public.emit_notification(<user>, 'loyalty', …, '/loyalty', …)
-- au moment du changement de niveau, une fois le comportement voulu tranché
-- (chaque crédit de points, ou seulement les changements de palier).
--
-- Idem pour le social (0022–0027) : like, commentaire et match sont des
-- candidats évidents, mais volumétriques — à cadrer avant de câbler, sinon le
-- centre de notifications devient illisible.

comment on function public.tg_reservations_notify is
  'Émet les notifications in-app du cycle de vie d''une réservation (0079/0080).';
comment on function public.tg_orders_notify is
  'Émet les notifications in-app du paiement et du workflow commande (0079/0080).';
comment on function public.tg_transactions_notify is
  'Émet les notifications in-app des deux côtés d''un transfert P2P (0079/0080).';
