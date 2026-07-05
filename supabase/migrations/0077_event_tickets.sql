-- ============================================================================
-- SOUTRA-PAIYA — Migration 0077 : découverte et achat de billets d'événement
-- ============================================================================
-- Phase 4 de la refonte UX fiche établissement (section 9 du master prompt) :
-- events/tickets existent depuis la migration 0001 (schéma complet) mais
-- aucune UI mobile ne les exploite et aucun achat n'est possible. Cette
-- migration ajoute les RPC de découverte, la réservation de capacité
-- concurrency-safe, et le règlement via GeniusPay (Pattern B — fonctions
-- dédiées + RPC de prix faisant autorité, calqué sur geniuspay-pay-order/
-- geniuspay-pay-booking, PAS l'ancien pattern inline de geniuspay-initialize).
--
-- Note importante : ticket_status n'a pas de valeur 'pending'
-- (valid|scanned|refunded|transferred uniquement). La ligne `tickets` n'est
-- donc créée qu'au règlement réussi ; avant cela, seul le compteur
-- ticket_tiers[].sold est réservé (et libéré si le paiement échoue).
-- Quantité limitée à 1 billet/achat (transactions.ticket_id est un FK
-- singulier, pas un tableau) — voir initialize_ticket_purchase.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) RPC : liste des événements publiés (découverte)
-- ----------------------------------------------------------------------------

create or replace function public.list_published_events(
  p_city   text default null,
  p_limit  integer default 20,
  p_offset integer default 0
)
returns table (
  event_id           uuid,
  title              text,
  slug               text,
  cover_url          text,
  starts_at          timestamptz,
  ends_at            timestamptz,
  city               text,
  venue_id           uuid,
  venue_name         text,
  venue_district     text,
  min_price_xof      bigint,
  max_price_xof      bigint,
  is_free            boolean,
  remaining_capacity integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    e.id, e.title, e.slug, e.cover_url, e.starts_at, e.ends_at, e.city,
    v.id, v.name, v.district,
    (select min((t->>'price_xof')::bigint) from jsonb_array_elements(e.ticket_tiers) t) as min_price_xof,
    (select max((t->>'price_xof')::bigint) from jsonb_array_elements(e.ticket_tiers) t) as max_price_xof,
    (jsonb_array_length(e.ticket_tiers) = 0) as is_free,
    case
      when jsonb_array_length(e.ticket_tiers) = 0 then e.capacity
      else (select sum(greatest(0, (t->>'qty')::int - (t->>'sold')::int))::int
              from jsonb_array_elements(e.ticket_tiers) t)
    end as remaining_capacity
  from public.events e
  left join public.venues v on v.id = e.venue_id
  where e.status = 'published'
    and e.ends_at > now()
    and (p_city is null or e.city = p_city)
  order by e.starts_at asc
  limit greatest(1, least(coalesce(p_limit, 20), 100))
  offset greatest(0, coalesce(p_offset, 0));
$$;

grant execute on function public.list_published_events(text, integer, integer) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2) RPC : détail d'un événement
-- ----------------------------------------------------------------------------

create or replace function public.get_event_detail(p_event_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_event record;
begin
  select
    e.id, e.title, e.slug, e.description, e.cover_url,
    e.starts_at, e.ends_at, e.capacity, e.ticket_tiers, e.status::text, e.city,
    e.organizer_id,
    p.full_name as organizer_name,
    v.id as venue_id, v.name as venue_name, v.address as venue_address,
    v.cover_url as venue_cover_url, v.district as venue_district
  into v_event
  from public.events e
  left join public.venues v on v.id = e.venue_id
  left join public.profiles p on p.id = e.organizer_id
  where e.id = p_event_id
    and (e.status = 'published' or e.organizer_id = auth.uid())
  limit 1;

  if v_event.id is null then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  return jsonb_build_object(
    'event_id', v_event.id,
    'title', v_event.title,
    'slug', v_event.slug,
    'description', v_event.description,
    'cover_url', v_event.cover_url,
    'starts_at', v_event.starts_at,
    'ends_at', v_event.ends_at,
    'capacity', v_event.capacity,
    'ticket_tiers', v_event.ticket_tiers,
    'status', v_event.status,
    'city', v_event.city,
    'organizer_name', v_event.organizer_name,
    'venue', case when v_event.venue_id is null then null else jsonb_build_object(
      'id', v_event.venue_id,
      'name', v_event.venue_name,
      'address', v_event.venue_address,
      'cover_url', v_event.venue_cover_url,
      'district', v_event.venue_district
    ) end
  );
end;
$$;

grant execute on function public.get_event_detail(uuid) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3) Réservation / libération de capacité — concurrency-safe
--
-- ticket_tiers vit dans une seule colonne jsonb (pas de ligne par palier à
-- verrouiller individuellement) : on verrouille donc la ligne events entière
-- via `for update`, ce qui sérialise toute tentative concurrente d'achat sur
-- le même événement et élimine toute race lost-update sur le tableau jsonb.
-- Mirroir du mécanisme `for update of p` sur products dans
-- create_order_from_cart (migration 0055), étendu à la ligne entière faute
-- de sous-ligne naturelle à verrouiller ici.
-- ----------------------------------------------------------------------------

create or replace function public.reserve_ticket_capacity(
  p_event_id  uuid,
  p_tier_name text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event events;
  v_tiers jsonb;
  v_idx   int;
  v_tier  jsonb;
  v_qty   int;
  v_sold  int;
  v_price bigint;
begin
  select * into v_event from public.events where id = p_event_id for update;
  if v_event.id is null then
    raise exception 'EVENT_NOT_FOUND';
  end if;
  if v_event.status <> 'published' then
    raise exception 'EVENT_NOT_PUBLISHED';
  end if;
  if v_event.ends_at <= now() then
    raise exception 'EVENT_PAST';
  end if;

  v_tiers := v_event.ticket_tiers;
  v_idx := null;
  for i in 0 .. jsonb_array_length(v_tiers) - 1 loop
    if (v_tiers -> i ->> 'name') = p_tier_name then
      v_idx := i;
      exit;
    end if;
  end loop;
  if v_idx is null then
    raise exception 'TIER_NOT_FOUND';
  end if;

  v_tier  := v_tiers -> v_idx;
  v_qty   := coalesce((v_tier->>'qty')::int, 0);
  v_sold  := coalesce((v_tier->>'sold')::int, 0);
  v_price := coalesce((v_tier->>'price_xof')::bigint, 0);

  if v_sold + 1 > v_qty then
    raise exception 'SOLD_OUT';
  end if;

  update public.events
     set ticket_tiers = jsonb_set(
           ticket_tiers,
           array[v_idx::text, 'sold'],
           to_jsonb(v_sold + 1)
         ),
         status = case
           when (
             select bool_and((t->>'sold')::int >= (t->>'qty')::int)
             from jsonb_array_elements(
               jsonb_set(ticket_tiers, array[v_idx::text, 'sold'], to_jsonb(v_sold + 1))
             ) t
           ) then 'sold_out'::event_status
           else status
         end
   where id = p_event_id;

  return jsonb_build_object('tier_name', p_tier_name, 'price_xof', v_price);
end;
$$;

revoke execute on function public.reserve_ticket_capacity(uuid, text) from public;
grant execute on function public.reserve_ticket_capacity(uuid, text) to authenticated, service_role;

create or replace function public.release_ticket_capacity(
  p_event_id  uuid,
  p_tier_name text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event events;
  v_idx   int;
  v_sold  int;
begin
  select * into v_event from public.events where id = p_event_id for update;
  if v_event.id is null then return; end if;

  for i in 0 .. jsonb_array_length(v_event.ticket_tiers) - 1 loop
    if (v_event.ticket_tiers -> i ->> 'name') = p_tier_name then
      v_idx := i;
      exit;
    end if;
  end loop;
  if v_idx is null then return; end if;

  v_sold := greatest(0, coalesce((v_event.ticket_tiers -> v_idx ->> 'sold')::int, 0) - 1);

  update public.events
     set ticket_tiers = jsonb_set(ticket_tiers, array[v_idx::text, 'sold'], to_jsonb(v_sold)),
         status = case when status = 'sold_out' then 'published'::event_status else status end
   where id = p_event_id;
end;
$$;

revoke execute on function public.release_ticket_capacity(uuid, text) from public;
grant execute on function public.release_ticket_capacity(uuid, text) to service_role;

-- ----------------------------------------------------------------------------
-- 4) RPC : initialisation d'un achat de billet (appelée avec le JWT
--    utilisateur par l'edge function geniuspay-pay-ticket)
-- ----------------------------------------------------------------------------

create or replace function public.initialize_ticket_purchase(
  p_event_id  uuid,
  p_tier_name text,
  p_quantity  integer default 1
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_hold jsonb;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if p_quantity <> 1 then
    raise exception 'QUANTITY_NOT_SUPPORTED';
  end if;

  v_hold := public.reserve_ticket_capacity(p_event_id, p_tier_name);

  return jsonb_build_object(
    'event_id', p_event_id,
    'tier_name', p_tier_name,
    'price_xof', v_hold->>'price_xof',
    'quantity', 1
  );
end;
$$;

revoke execute on function public.initialize_ticket_purchase(uuid, text, integer) from public;
grant execute on function public.initialize_ticket_purchase(uuid, text, integer) to authenticated;

-- ----------------------------------------------------------------------------
-- 5) Règlement : crée la ligne tickets (idempotent) — sold déjà incrémenté
--    à l'initiation, ne pas y retoucher ici.
-- ----------------------------------------------------------------------------

create or replace function public.geniuspay_settle_ticket_purchase(p_tx_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx        record;
  v_event_id  uuid;
  v_tier_name text;
  v_ticket_id uuid;
begin
  select id, user_id, amount_xof, provider_ref, metadata, ticket_id
    into v_tx
    from public.transactions
   where id = p_tx_id
   limit 1;
  if v_tx.id is null then
    raise exception 'TX_NOT_FOUND';
  end if;

  if v_tx.ticket_id is not null then
    return jsonb_build_object('ok', false, 'reason', 'ALREADY_SETTLED', 'ticket_id', v_tx.ticket_id);
  end if;

  v_event_id  := (v_tx.metadata->>'event_id')::uuid;
  v_tier_name := v_tx.metadata->>'tier_name';
  if v_event_id is null or v_tier_name is null then
    raise exception 'TICKET_METADATA_MISSING';
  end if;

  insert into public.tickets (event_id, user_id, tier_name, price_xof, status, transaction_id)
  values (v_event_id, v_tx.user_id, v_tier_name, v_tx.amount_xof, 'valid', v_tx.id)
  returning id into v_ticket_id;

  update public.transactions set ticket_id = v_ticket_id where id = v_tx.id;

  return jsonb_build_object('ok', true, 'ticket_id', v_ticket_id, 'event_id', v_event_id);
end;
$$;

revoke execute on function public.geniuspay_settle_ticket_purchase(uuid) from public;
grant execute on function public.geniuspay_settle_ticket_purchase(uuid) to service_role;

-- ----------------------------------------------------------------------------
-- 6) Libération si le paiement échoue/expire — no-op pour tout autre achat
-- ----------------------------------------------------------------------------

create or replace function public.geniuspay_release_ticket_hold(p_reference text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx transactions;
begin
  select * into v_tx from transactions where provider_ref = p_reference limit 1;
  if v_tx.id is null then return; end if;
  if v_tx.metadata->>'purpose' <> 'ticket_purchase' then return; end if;
  if v_tx.status <> 'failed' then return; end if;
  perform public.release_ticket_capacity(
    (v_tx.metadata->>'event_id')::uuid,
    v_tx.metadata->>'tier_name'
  );
end;
$$;

revoke execute on function public.geniuspay_release_ticket_hold(text) from public;
grant execute on function public.geniuspay_release_ticket_hold(text) to service_role;

-- ----------------------------------------------------------------------------
-- 7) geniuspay_settle_charge : ajout additif de la branche ticket_purchase.
--    Corps identique à la version actuelle (migration 0065), une seule
--    branche elsif ajoutée avant le fallback topup/reservation.
-- ----------------------------------------------------------------------------

create or replace function public.geniuspay_settle_charge(
  p_reference      text,
  p_paid_amount_xof bigint
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx       transactions;
  v_purpose  text;
begin
  select * into v_tx
    from transactions
   where provider_ref = p_reference
   for update;

  if not found then
    return 'not_found';
  end if;
  if v_tx.status = 'success' then
    return 'already_settled';
  end if;
  if v_tx.status <> 'pending' then
    return 'not_pending';
  end if;
  if p_paid_amount_xof < v_tx.amount_xof then
    return 'amount_mismatch';
  end if;

  update transactions
     set status = 'success', completed_at = now()
   where id = v_tx.id;

  v_purpose := v_tx.metadata->>'purpose';

  if v_purpose = 'subscription' then
    perform public.geniuspay_settle_subscription(v_tx.id);
  elsif v_purpose = 'order' then
    perform public.geniuspay_settle_order(v_tx.id);
  elsif v_purpose = 'room_booking' then
    perform public.geniuspay_settle_room_booking(v_tx.id);
  elsif v_purpose = 'ticket_purchase' then
    perform public.geniuspay_settle_ticket_purchase(v_tx.id);
  elsif v_tx.type = 'topup' then
    update wallets
       set balance_xof = balance_xof + v_tx.amount_xof
     where user_id = v_tx.user_id;
  elsif v_tx.type = 'payment' and v_tx.reservation_id is not null then
    update reservations
       set escrow_tx_id = v_tx.id
     where id = v_tx.reservation_id;
  end if;

  return 'settled';
end;
$$;

revoke execute on function public.geniuspay_settle_charge(text, bigint) from public;
grant execute on function public.geniuspay_settle_charge(text, bigint) to service_role;

comment on function public.list_published_events is
  'Découverte des événements publiés (à venir), avec prix min/max et capacité restante calculés depuis ticket_tiers.';
comment on function public.reserve_ticket_capacity is
  'Réserve une place sur un palier de billetterie, concurrency-safe via verrou for update sur la ligne events. Bascule published->sold_out si tous les paliers sont épuisés.';
comment on function public.geniuspay_settle_ticket_purchase is
  'Crée la ligne tickets (statut valid) au règlement d''un achat de billet. Idempotent via transactions.ticket_id.';
