-- ============================================================================
-- SOUTRA-PAIYA — Migration 0042 : Wiring monétisation aux flux existants
-- ============================================================================
-- Branche automatiquement les flux opérationnels (réservations, billetterie,
-- paiements) au système de monétisation de la 0041, sans modifier la logique
-- métier existante.
--
-- Stratégie : 3 triggers AFTER INSERT/UPDATE qui appellent silencieusement
-- compute_fee_amount + log_revenue_event quand un événement déclencheur est
-- détecté. Try/catch global : si le wiring échoue, la transaction métier
-- continue (le monitoring d'erreur arrive via NOTICE).
--
-- Flux instrumentés :
--   1. tickets    — INSERT status='valid'        → ticket_commission_pct
--   2. reservations — UPDATE status -> 'arrived' → reservation_commission_pct
--   3. transactions — UPDATE status -> 'success' AND type='payment'
--                                                → payment_commission
--
-- Anti-doublon : index unique partial sur monetization_revenue_log par
-- (kind, ticket_id|reservation_id|transaction_id) — un même flux ne génère
-- qu'un seul revenue event.
--
-- Backfill : RPC admin pour rattraper l'historique sans doublonner.
-- Non-cassant : aucune table existante modifiée, juste des triggers + index.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Anti-doublons sur monetization_revenue_log
--    On évite qu'un même ticket / reservation / transaction génère plusieurs
--    fois la même entrée (kind, source_id). Les index partials ne se déclen-
--    chent que quand la colonne est non-NULL.
-- ----------------------------------------------------------------------------

create unique index if not exists uq_revlog_ticket_kind
  on public.monetization_revenue_log(kind, ticket_id)
  where ticket_id is not null;

create unique index if not exists uq_revlog_reservation_kind
  on public.monetization_revenue_log(kind, reservation_id)
  where reservation_id is not null;

create unique index if not exists uq_revlog_transaction_kind
  on public.monetization_revenue_log(kind, transaction_id)
  where transaction_id is not null;

-- ----------------------------------------------------------------------------
-- 2) Helper interne : récupère category/city/commune d'un venue
--    SECURITY DEFINER pour passer la RLS dans le trigger.
-- ----------------------------------------------------------------------------

create or replace function public.get_venue_context(p_venue_id uuid)
returns table (category text, city text, commune text)
language sql
stable
security definer
set search_path = public
as $$
  select v.category::text, v.city, coalesce(v.district, '') as commune
    from public.venues v
   where v.id = p_venue_id
   limit 1;
$$;

grant execute on function public.get_venue_context(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 3) Helper : compute + log en un seul appel
--    Renvoie l'id du revenue_log inséré (ou null si rien à logguer).
-- ----------------------------------------------------------------------------

create or replace function public.wrap_compute_and_log(
  p_amount_xof      bigint,
  p_kind_fee        text,                  -- 'reservation','ticket','payment',…
  p_kind_revenue    text,                  -- ex : 'ticket_commission_pct'
  p_venue_id        uuid    default null,
  p_category        text    default null,
  p_city            text    default null,
  p_commune         text    default null,
  p_user_id         uuid    default null,
  p_partner_id      uuid    default null,
  p_reservation_id  uuid    default null,
  p_transaction_id  uuid    default null,
  p_ticket_id       uuid    default null,
  p_promo_id        uuid    default null,
  p_metadata        jsonb   default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fee     jsonb;
  v_fee_xof bigint;
  v_rule_id uuid;
  v_id      uuid;
begin
  -- Pas de montant base → rien à logguer (cas frais fixes : on logge le forfait
  -- direct via log_revenue_event).
  if p_amount_xof is null or p_amount_xof <= 0 then
    return null;
  end if;

  v_fee := public.compute_fee_amount(
    p_amount_xof, p_kind_fee, p_category, p_city, p_commune
  );

  v_fee_xof := coalesce((v_fee->>'fee_total_xof')::bigint, 0);
  v_rule_id := nullif(v_fee->>'rule_id', '')::uuid;

  if v_fee_xof <= 0 then
    return null;
  end if;

  begin
    insert into public.monetization_revenue_log (
      kind, amount_xof,
      venue_id, category, city, commune,
      user_id, partner_id,
      reservation_id, transaction_id, ticket_id, promo_id, rule_id,
      metadata
    )
    values (
      p_kind_revenue::revenue_kind, v_fee_xof,
      p_venue_id,
      nullif(trim(coalesce(p_category, '')), '')::venue_category,
      nullif(trim(coalesce(p_city, '')), ''),
      nullif(trim(coalesce(p_commune, '')), ''),
      p_user_id, p_partner_id,
      p_reservation_id, p_transaction_id, p_ticket_id, p_promo_id, v_rule_id,
      coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('fee_detail', v_fee)
    )
    returning id into v_id;
  exception when unique_violation then
    -- Déjà loggué (index unique partial) — silencieux.
    v_id := null;
  end;

  return v_id;
end;
$$;

grant execute on function public.wrap_compute_and_log(
  bigint, text, text, uuid, text, text, text, uuid, uuid, uuid, uuid, uuid, uuid, jsonb
) to authenticated;

-- ----------------------------------------------------------------------------
-- 4) Trigger TICKETS — à l'insertion d'un ticket valide
-- ----------------------------------------------------------------------------

create or replace function public.tg_ticket_revenue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_event_venue uuid;
begin
  -- On ne logge que les billets valides (achetés).
  if new.status <> 'valid' then return new; end if;
  if new.price_xof is null or new.price_xof <= 0 then return new; end if;

  -- Récupère le venue lié via l'événement.
  select e.venue_id into v_event_venue
    from public.events e
   where e.id = new.event_id
   limit 1;

  if v_event_venue is not null then
    select * into v_ctx from public.get_venue_context(v_event_venue);
  end if;

  -- Best-effort : si ça plante, on ne casse pas l'achat de ticket.
  begin
    perform public.wrap_compute_and_log(
      p_amount_xof     := new.price_xof,
      p_kind_fee       := 'ticket',
      p_kind_revenue   := 'ticket_commission',
      p_venue_id       := v_event_venue,
      p_category       := v_ctx.category,
      p_city           := v_ctx.city,
      p_commune        := v_ctx.commune,
      p_user_id        := new.user_id,
      p_ticket_id      := new.id,
      p_transaction_id := new.transaction_id,
      p_metadata       := jsonb_build_object('event_id', new.event_id, 'tier_name', new.tier_name)
    );
  exception when others then
    raise notice 'tg_ticket_revenue ignore err: %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists trg_ticket_revenue on public.tickets;
create trigger trg_ticket_revenue
  after insert on public.tickets
  for each row execute function public.tg_ticket_revenue();

-- ----------------------------------------------------------------------------
-- 5) Trigger RÉSERVATIONS — au passage status='arrived' (client honoré)
--    On logge sur deposit_xof si > 0, sinon on tente d'estimer via
--    party_size × avg_price_xof du venue (la commission s'applique sur la
--    valeur estimée de la consommation).
-- ----------------------------------------------------------------------------

create or replace function public.tg_reservation_revenue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_avg bigint;
  v_base bigint;
begin
  -- Déclenche uniquement quand on passe (autre status) -> 'arrived'.
  if new.status <> 'arrived' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'arrived' then return new; end if;

  select * into v_ctx from public.get_venue_context(new.venue_id);

  -- Base = deposit_xof s'il existe, sinon estimation party_size × avg_price.
  select avg_price_xof into v_avg from public.venues where id = new.venue_id limit 1;
  v_base := case
    when new.deposit_xof is not null and new.deposit_xof > 0 then new.deposit_xof
    when v_avg is not null and v_avg > 0 then v_avg * coalesce(new.party_size, 1)
    else 0
  end;

  if v_base <= 0 then return new; end if;

  begin
    perform public.wrap_compute_and_log(
      p_amount_xof     := v_base,
      p_kind_fee       := 'reservation',
      p_kind_revenue   := 'reservation_commission_pct',
      p_venue_id       := new.venue_id,
      p_category       := v_ctx.category,
      p_city           := v_ctx.city,
      p_commune        := v_ctx.commune,
      p_user_id        := new.user_id,
      p_reservation_id := new.id,
      p_transaction_id := new.escrow_tx_id,
      p_metadata       := jsonb_build_object(
        'party_size', new.party_size,
        'base_kind', case when new.deposit_xof > 0 then 'deposit' else 'estimated' end,
        'avg_price_used', v_avg
      )
    );
  exception when others then
    raise notice 'tg_reservation_revenue ignore err: %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists trg_reservation_revenue on public.reservations;
create trigger trg_reservation_revenue
  after insert or update of status on public.reservations
  for each row execute function public.tg_reservation_revenue();

-- ----------------------------------------------------------------------------
-- 6) Trigger TRANSACTIONS — paiements réussis
--    Capture les commissions paiement sur les types qui génèrent du CA
--    interne : 'payment' (achat au marchand) et 'split' (split bill final).
--    Ignoré pour topup / withdraw / transfer / refund.
-- ----------------------------------------------------------------------------

create or replace function public.tg_transaction_revenue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind_fee     text;
  v_kind_revenue text;
  v_venue_id     uuid;
  v_ctx          record;
begin
  if new.status <> 'success' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'success' then return new; end if;
  if new.amount_xof is null or new.amount_xof <= 0 then return new; end if;

  -- Mapping type → kind monétaire ciblé.
  v_kind_fee     := null;
  v_kind_revenue := null;
  case new.type
    when 'payment' then
      v_kind_fee := 'payment'; v_kind_revenue := 'payment_commission';
    when 'split' then
      v_kind_fee := 'payment'; v_kind_revenue := 'payment_commission';
    else
      return new; -- topup / withdraw / transfer / refund / escrow_* / fee → ignoré
  end case;

  -- Si la transaction est liée à une réservation, on récupère le venue.
  if new.reservation_id is not null then
    select r.venue_id into v_venue_id
      from public.reservations r
     where r.id = new.reservation_id
     limit 1;
  end if;
  if v_venue_id is not null then
    select * into v_ctx from public.get_venue_context(v_venue_id);
  end if;

  begin
    perform public.wrap_compute_and_log(
      p_amount_xof     := new.amount_xof,
      p_kind_fee       := v_kind_fee,
      p_kind_revenue   := v_kind_revenue,
      p_venue_id       := v_venue_id,
      p_category       := v_ctx.category,
      p_city           := v_ctx.city,
      p_commune        := v_ctx.commune,
      p_user_id        := new.user_id,
      p_partner_id     := new.counterparty_id,
      p_transaction_id := new.id,
      p_reservation_id := new.reservation_id,
      p_ticket_id      := new.ticket_id,
      p_metadata       := jsonb_build_object('tx_type', new.type::text, 'provider', new.provider::text)
    );
  exception when others then
    raise notice 'tg_transaction_revenue ignore err: %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists trg_transaction_revenue on public.transactions;
create trigger trg_transaction_revenue
  after insert or update of status on public.transactions
  for each row execute function public.tg_transaction_revenue();

-- ----------------------------------------------------------------------------
-- 7) RPC admin : backfill rétroactif de l'historique
--    Parcourt toutes les sources et appelle wrap_compute_and_log.
--    L'anti-doublon via index unique évite les insertions multiples.
--    Renvoie un récap { tickets, reservations, transactions } avec compteurs.
-- ----------------------------------------------------------------------------

create or replace function public.backfill_revenue_log(
  p_max_per_source integer default 5000
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid          uuid := auth.uid();
  v_t_tickets    integer := 0;
  v_t_resa       integer := 0;
  v_t_tx         integer := 0;
  r              record;
  v_ctx          record;
  v_event_venue  uuid;
  v_avg          bigint;
  v_base         bigint;
  v_inserted     uuid;
begin
  if v_uid is null or not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  -- TICKETS valides
  for r in
    select id, event_id, user_id, price_xof, transaction_id, tier_name
      from public.tickets
     where status = 'valid' and price_xof > 0
     limit p_max_per_source
  loop
    select e.venue_id into v_event_venue from public.events e where e.id = r.event_id limit 1;
    if v_event_venue is not null then
      select * into v_ctx from public.get_venue_context(v_event_venue);
    else
      v_ctx := row(null::text, null::text, null::text);
    end if;
    v_inserted := public.wrap_compute_and_log(
      p_amount_xof := r.price_xof,
      p_kind_fee := 'ticket',
      p_kind_revenue := 'ticket_commission',
      p_venue_id := v_event_venue,
      p_category := v_ctx.category,
      p_city := v_ctx.city,
      p_commune := v_ctx.commune,
      p_user_id := r.user_id,
      p_ticket_id := r.id,
      p_transaction_id := r.transaction_id,
      p_metadata := jsonb_build_object('backfill', true, 'event_id', r.event_id, 'tier_name', r.tier_name)
    );
    if v_inserted is not null then v_t_tickets := v_t_tickets + 1; end if;
  end loop;

  -- RÉSERVATIONS arrivées
  for r in
    select id, venue_id, user_id, deposit_xof, escrow_tx_id, party_size
      from public.reservations
     where status = 'arrived'
     limit p_max_per_source
  loop
    select * into v_ctx from public.get_venue_context(r.venue_id);
    select avg_price_xof into v_avg from public.venues where id = r.venue_id limit 1;
    v_base := case
      when r.deposit_xof is not null and r.deposit_xof > 0 then r.deposit_xof
      when v_avg is not null and v_avg > 0 then v_avg * coalesce(r.party_size, 1)
      else 0
    end;
    if v_base > 0 then
      v_inserted := public.wrap_compute_and_log(
        p_amount_xof := v_base,
        p_kind_fee := 'reservation',
        p_kind_revenue := 'reservation_commission_pct',
        p_venue_id := r.venue_id,
        p_category := v_ctx.category,
        p_city := v_ctx.city,
        p_commune := v_ctx.commune,
        p_user_id := r.user_id,
        p_reservation_id := r.id,
        p_transaction_id := r.escrow_tx_id,
        p_metadata := jsonb_build_object('backfill', true, 'party_size', r.party_size)
      );
      if v_inserted is not null then v_t_resa := v_t_resa + 1; end if;
    end if;
  end loop;

  -- TRANSACTIONS success payment|split
  for r in
    select id, user_id, counterparty_id, type, amount_xof, reservation_id, ticket_id, provider
      from public.transactions
     where status = 'success'
       and type in ('payment', 'split')
       and amount_xof > 0
     limit p_max_per_source
  loop
    v_event_venue := null;
    if r.reservation_id is not null then
      select rv.venue_id into v_event_venue from public.reservations rv where rv.id = r.reservation_id limit 1;
    end if;
    if v_event_venue is not null then
      select * into v_ctx from public.get_venue_context(v_event_venue);
    else
      v_ctx := row(null::text, null::text, null::text);
    end if;
    v_inserted := public.wrap_compute_and_log(
      p_amount_xof := r.amount_xof,
      p_kind_fee := 'payment',
      p_kind_revenue := 'payment_commission',
      p_venue_id := v_event_venue,
      p_category := v_ctx.category,
      p_city := v_ctx.city,
      p_commune := v_ctx.commune,
      p_user_id := r.user_id,
      p_partner_id := r.counterparty_id,
      p_transaction_id := r.id,
      p_reservation_id := r.reservation_id,
      p_ticket_id := r.ticket_id,
      p_metadata := jsonb_build_object('backfill', true, 'tx_type', r.type::text, 'provider', r.provider::text)
    );
    if v_inserted is not null then v_t_tx := v_t_tx + 1; end if;
  end loop;

  return jsonb_build_object(
    'tickets_logged', v_t_tickets,
    'reservations_logged', v_t_resa,
    'transactions_logged', v_t_tx,
    'total_logged', v_t_tickets + v_t_resa + v_t_tx
  );
end;
$$;

revoke execute on function public.backfill_revenue_log(integer) from public;
grant execute on function public.backfill_revenue_log(integer) to authenticated;

-- ----------------------------------------------------------------------------
-- 8) Vue admin : revenus par établissement (utile pour /admin venue card)
-- ----------------------------------------------------------------------------

create or replace view public.venue_revenue_summary as
  select
    l.venue_id,
    v.name             as venue_name,
    v.category::text   as category,
    v.city, v.district as commune,
    count(*)::bigint   as event_count,
    sum(l.amount_xof)::bigint as total_xof,
    sum(case when l.kind = 'reservation_commission_pct' then l.amount_xof else 0 end)::bigint as resa_xof,
    sum(case when l.kind = 'ticket_commission' then l.amount_xof else 0 end)::bigint as ticket_xof,
    sum(case when l.kind = 'payment_commission' then l.amount_xof else 0 end)::bigint as payment_xof,
    max(l.ts) as last_event_at
  from public.monetization_revenue_log l
  join public.venues v on v.id = l.venue_id
  group by l.venue_id, v.name, v.category, v.city, v.district;

grant select on public.venue_revenue_summary to authenticated;

-- ----------------------------------------------------------------------------
-- 9) Commentaires
-- ----------------------------------------------------------------------------

comment on function public.wrap_compute_and_log is
  'Helper : compute_fee_amount + log_revenue_event en un appel. Anti-doublon via index unique partials.';
comment on function public.tg_ticket_revenue is
  'Trigger : log ticket_commission à l''insert d''un ticket valide.';
comment on function public.tg_reservation_revenue is
  'Trigger : log reservation_commission_pct au passage status -> arrived.';
comment on function public.tg_transaction_revenue is
  'Trigger : log payment_commission sur transactions success de type payment/split.';
comment on function public.backfill_revenue_log is
  'Backfill admin : rattrape l''historique. Idempotent grâce aux unique index.';
comment on view public.venue_revenue_summary is
  'Récap revenus par venue — alimente la card "Revenus" sur la fiche admin venue.';
