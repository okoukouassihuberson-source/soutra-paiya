-- ============================================================================
-- SOUTRA-PAIYA — Migration 0045 : Préférences de notifications + jalons revenus
-- ============================================================================
-- Permet aux gérants (et users en général) de choisir quels events business
-- doivent déclencher une push. Étend l'infra `send-push` existante sans la
-- casser : les 6 events utilisateurs déjà cablés (messages, transferts, etc.)
-- restent envoyés à 100% (pas de check préférences pour eux côté Edge).
--
-- Les 4 nouveaux events PRO consultent `is_notification_enabled` avant envoi :
--   • new_reservation    — nouvelle résa pending sur un venue dont je suis owner
--   • payment_received   — paiement encaissé pour mon venue
--   • payout_settled     — mon retrait est passé success / failed
--   • revenue_milestone  — j'ai atteint 50k / 250k / 1M XOF de revenus ce mois
--
-- Table compagnon `revenue_milestones_reached` : évite d'envoyer plusieurs fois
-- la même notif quand le cumul oscille autour d'un seuil.
--
-- Non-cassant : aucune table existante modifiée.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Table notification_preferences
-- ----------------------------------------------------------------------------

create table if not exists public.notification_preferences (
  user_id              uuid primary key references public.profiles(id) on delete cascade,
  new_reservation      boolean not null default true,
  payment_received     boolean not null default true,
  payout_settled       boolean not null default true,
  revenue_milestone    boolean not null default true,
  updated_at           timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2) RLS — lecture / écriture par le user lui-même uniquement
-- ----------------------------------------------------------------------------

alter table public.notification_preferences enable row level security;

drop policy if exists "notif_prefs_select_self" on public.notification_preferences;
create policy "notif_prefs_select_self" on public.notification_preferences
  for select using (auth.uid() = user_id);

drop policy if exists "notif_prefs_upsert_self" on public.notification_preferences;
create policy "notif_prefs_upsert_self" on public.notification_preferences
  for insert with check (auth.uid() = user_id);

drop policy if exists "notif_prefs_update_self" on public.notification_preferences;
create policy "notif_prefs_update_self" on public.notification_preferences
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 3) RPC : get_my_notification_preferences — lit, auto-crée avec défauts true
-- ----------------------------------------------------------------------------

create or replace function public.get_my_notification_preferences()
returns notification_preferences
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row notification_preferences;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_row from public.notification_preferences where user_id = v_uid;
  if not found then
    insert into public.notification_preferences (user_id) values (v_uid)
    returning * into v_row;
  end if;
  return v_row;
end;
$$;

revoke execute on function public.get_my_notification_preferences() from public;
grant execute on function public.get_my_notification_preferences() to authenticated;

-- ----------------------------------------------------------------------------
-- 4) RPC : update_notification_preferences — patch partiel via jsonb
-- ----------------------------------------------------------------------------

create or replace function public.update_notification_preferences(p_prefs jsonb)
returns notification_preferences
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row notification_preferences;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if p_prefs is null or jsonb_typeof(p_prefs) <> 'object' then
    raise exception 'INVALID_PAYLOAD';
  end if;

  -- Auto-crée la row si absente (rejouable).
  insert into public.notification_preferences (user_id) values (v_uid)
  on conflict (user_id) do nothing;

  update public.notification_preferences
     set new_reservation    = coalesce((p_prefs->>'new_reservation')::boolean, new_reservation),
         payment_received   = coalesce((p_prefs->>'payment_received')::boolean, payment_received),
         payout_settled     = coalesce((p_prefs->>'payout_settled')::boolean, payout_settled),
         revenue_milestone  = coalesce((p_prefs->>'revenue_milestone')::boolean, revenue_milestone),
         updated_at         = now()
   where user_id = v_uid
   returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.update_notification_preferences(jsonb) from public;
grant execute on function public.update_notification_preferences(jsonb) to authenticated;

-- ----------------------------------------------------------------------------
-- 5) Helper : is_notification_enabled — appelé par send-push (service_role)
--    SECURITY DEFINER pour bypass la RLS. Retourne true par défaut si l'user
--    n'a pas encore de row (= défaut true sur tous les types).
-- ----------------------------------------------------------------------------

create or replace function public.is_notification_enabled(
  p_user_id    uuid,
  p_event_type text
) returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row notification_preferences;
  v_enabled boolean;
begin
  if p_user_id is null then return false; end if;

  select * into v_row from public.notification_preferences where user_id = p_user_id;
  if not found then
    -- Pas encore de préférences => défaut true sur tous les types.
    return true;
  end if;

  v_enabled := case lower(p_event_type)
    when 'new_reservation'    then v_row.new_reservation
    when 'payment_received'   then v_row.payment_received
    when 'payout_settled'     then v_row.payout_settled
    when 'revenue_milestone'  then v_row.revenue_milestone
    else true  -- event_type inconnu => on envoie (rétro-compat)
  end;

  return coalesce(v_enabled, true);
end;
$$;

revoke execute on function public.is_notification_enabled(uuid, text) from public;
grant execute on function public.is_notification_enabled(uuid, text) to service_role, authenticated;

-- ----------------------------------------------------------------------------
-- 6) Table revenue_milestones_reached — anti-double-trigger pour les jalons
--    PK composite (venue_id, milestone_xof, year_month) : un seuil donné
--    ne peut être atteint qu'une fois par mois calendaire.
-- ----------------------------------------------------------------------------

create table if not exists public.revenue_milestones_reached (
  venue_id        uuid not null references public.venues(id) on delete cascade,
  milestone_xof   bigint not null check (milestone_xof > 0),
  year_month      text not null check (year_month ~ '^\d{4}-\d{2}$'),
  total_xof_at_trigger bigint not null,
  reached_at      timestamptz not null default now(),
  primary key (venue_id, milestone_xof, year_month)
);

create index if not exists idx_milestones_venue_date
  on public.revenue_milestones_reached(venue_id, reached_at desc);

alter table public.revenue_milestones_reached enable row level security;

-- Owner du venue peut lire ses jalons, sinon admin.
drop policy if exists "milestones_select_owner" on public.revenue_milestones_reached;
create policy "milestones_select_owner" on public.revenue_milestones_reached
  for select using (
    public.is_admin() or
    exists (
      select 1 from public.venues v
       where v.id = revenue_milestones_reached.venue_id
         and v.owner_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- 7) Trigger : à chaque commission loggée, on vérifie les jalons mensuels
--    Seuils par défaut : 50 000 / 250 000 / 1 000 000 / 5 000 000 XOF.
--    L'insertion dans revenue_milestones_reached échoue silencieusement
--    (on conflict do nothing) si déjà atteint ce mois → idempotent.
-- ----------------------------------------------------------------------------

create or replace function public.tg_check_revenue_milestones()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venue_id    uuid := new.venue_id;
  v_year_month  text;
  v_total_xof   bigint;
  v_milestone   bigint;
  v_milestones  bigint[] := array[50000, 250000, 1000000, 5000000];
begin
  if v_venue_id is null then return new; end if;

  v_year_month := to_char(now() at time zone 'Africa/Abidjan', 'YYYY-MM');

  -- Cumul brut Soutra-Playce sur ce venue ce mois (en ne prenant que les
  -- entries de gross — on additionne plus simplement le gross calc).
  -- Pour rester simple : on prend le cumul total (brut estimé) via la
  -- fonction get_venue_payable_balance.gross_xof. Mais elle nécessite
  -- assert_owner. On recalcule donc en inline ici, *uniquement pour le
  -- venue concerné par le trigger* (perf OK : indexé venue_id).
  select coalesce(sum(
    case
      when r.deposit_xof is not null and r.deposit_xof > 0 then r.deposit_xof
      else coalesce((select avg_price_xof from public.venues where id = v_venue_id), 0)
           * coalesce(r.party_size, 1)
    end
  ), 0)::bigint
    into v_total_xof
    from public.reservations r
   where r.venue_id = v_venue_id
     and r.status = 'arrived'
     and r.created_at >= date_trunc('month', now() at time zone 'Africa/Abidjan');

  -- Ajoute les tickets et paiements du mois en cours
  v_total_xof := v_total_xof + coalesce((
    select sum(t.price_xof)::bigint
      from public.tickets t
      join public.events e on e.id = t.event_id
     where e.venue_id = v_venue_id
       and t.status = 'valid'
       and t.created_at >= date_trunc('month', now() at time zone 'Africa/Abidjan')
  ), 0);

  v_total_xof := v_total_xof + coalesce((
    select sum(tx.amount_xof)::bigint
      from public.transactions tx
      join public.reservations r on r.id = tx.reservation_id
     where r.venue_id = v_venue_id
       and tx.status = 'success'
       and tx.type in ('payment', 'split')
       and tx.created_at >= date_trunc('month', now() at time zone 'Africa/Abidjan')
  ), 0);

  -- Pour chaque seuil franchi, on tente une insertion (idempotente via PK).
  foreach v_milestone in array v_milestones loop
    if v_total_xof >= v_milestone then
      begin
        insert into public.revenue_milestones_reached (
          venue_id, milestone_xof, year_month, total_xof_at_trigger
        ) values (
          v_venue_id, v_milestone, v_year_month, v_total_xof
        );
        -- Si l'insert réussit (= 1ère fois ce mois), une Database Webhook
        -- INSERT sur cette table déclenchera send-push.
      exception when unique_violation then
        null; -- Jalon déjà atteint ce mois → on ne renote pas.
      end;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_check_revenue_milestones on public.monetization_revenue_log;
create trigger trg_check_revenue_milestones
  after insert on public.monetization_revenue_log
  for each row execute function public.tg_check_revenue_milestones();

-- ----------------------------------------------------------------------------
-- 8) Commentaires
-- ----------------------------------------------------------------------------

comment on table public.notification_preferences is
  'Préférences de notifications push par user. Defaults true pour les 4 events pro. Lue par send-push via is_notification_enabled.';
comment on function public.get_my_notification_preferences is
  'Récupère les préférences du caller (auto-crée avec défauts si absente).';
comment on function public.update_notification_preferences is
  'Patch partiel des préférences via jsonb (clés manquantes = inchangées).';
comment on function public.is_notification_enabled is
  'Helper service_role : true si l''user accepte ce type d''event (défaut true).';
comment on table public.revenue_milestones_reached is
  'Anti-doublon pour les notifications de jalon mensuel. PK (venue, seuil, mois).';
comment on function public.tg_check_revenue_milestones is
  'À chaque commission loggée, vérifie si un seuil mensuel vient d''être franchi.';
