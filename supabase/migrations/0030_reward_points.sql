-- ============================================================================
-- SOUTRA-PAIYA — Migration 0030 : Cashback / Récompenses Soutra-Pay
-- ============================================================================
-- Ajoute un système de fidélité par points :
--
--   • Chaque paiement éligible (type IN ('payment','transfer','split') et
--     status='success') déclenche un crédit de points proportionnel au montant,
--     multiplié par le coefficient du palier courant de l'utilisateur.
--   • Les points sont stockés dans un ledger immuable (`reward_points`).
--     Le solde courant et le cumul à vie en sont dérivés.
--   • L'utilisateur peut convertir ses points en bonus wallet (FCFA) via
--     `redeem_reward_points` à partir d'un palier minimum.
--
-- Tables nouvelles : reward_tiers, reward_points
-- Trigger : tg_award_reward_points sur transactions
-- RPCs : get_reward_summary, list_reward_history, redeem_reward_points
--
-- Migration idempotente : utilise IF NOT EXISTS et CREATE OR REPLACE partout.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ENUM : nature d'une ligne de ledger
-- ----------------------------------------------------------------------------
do $$ begin
  create type reward_kind as enum (
    'earn_transaction',  -- crédit auto sur paiement
    'redeem_wallet',     -- débit après conversion en FCFA
    'bonus_tier',        -- bonus de bienvenue / palier
    'admin_adjust'       -- ajustement manuel (support)
  );
exception
  when duplicate_object then null;
end $$;

-- ----------------------------------------------------------------------------
-- TABLE : paliers (paramétrage central, modifiable sans toucher au code)
-- ----------------------------------------------------------------------------
-- earn_multiplier_bps en basis points : 10000 = 1.00× ; 12500 = 1.25× ; etc.
-- ----------------------------------------------------------------------------
create table if not exists reward_tiers (
  tier text primary key,
  display_name text not null,
  min_lifetime_points integer not null check (min_lifetime_points >= 0),
  earn_multiplier_bps integer not null check (earn_multiplier_bps >= 10000),
  color_hex text not null,
  rank integer not null unique
);

-- Seed des paliers — INSERT idempotent.
insert into reward_tiers (tier, display_name, min_lifetime_points, earn_multiplier_bps, color_hex, rank)
values
  ('bronze',   'Bronze',   0,     10000, '#CD7F32', 1),
  ('silver',   'Argent',   1000,  12500, '#9CA3AF', 2),
  ('gold',     'Or',       5000,  15000, '#F59E0B', 3),
  ('platinum', 'Platine',  20000, 20000, '#6366F1', 4)
on conflict (tier) do update
  set display_name = excluded.display_name,
      min_lifetime_points = excluded.min_lifetime_points,
      earn_multiplier_bps = excluded.earn_multiplier_bps,
      color_hex = excluded.color_hex,
      rank = excluded.rank;

-- ----------------------------------------------------------------------------
-- TABLE : ledger des mouvements de points (append-only)
-- ----------------------------------------------------------------------------
-- delta_points > 0 = gain ; < 0 = retrait. Pas d'update / pas de delete par
-- les clients (RLS) — l'historique reste immuable.
-- ----------------------------------------------------------------------------
create table if not exists reward_points (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  delta_points integer not null check (delta_points <> 0),
  kind reward_kind not null,
  source_tx_id uuid references transactions(id) on delete set null,
  description text,
  created_at timestamptz not null default now()
);

create index if not exists idx_reward_points_user_date
  on reward_points(user_id, created_at desc);

-- Idempotence : une seule ligne 'earn_transaction' par transaction source.
create unique index if not exists uniq_reward_points_source_tx
  on reward_points(source_tx_id)
  where source_tx_id is not null and kind = 'earn_transaction';

-- ----------------------------------------------------------------------------
-- RLS : ledger privé en lecture, paliers publics en lecture
-- ----------------------------------------------------------------------------
alter table reward_points enable row level security;
alter table reward_tiers enable row level security;

drop policy if exists reward_points_self on reward_points;
create policy reward_points_self on reward_points
  for select using (auth.uid() = user_id);
-- Aucune policy write : seules les fonctions SECURITY DEFINER écrivent.

drop policy if exists reward_tiers_public on reward_tiers;
create policy reward_tiers_public on reward_tiers
  for select using (true);

-- ----------------------------------------------------------------------------
-- VUE INTERNE : résumé courant par utilisateur (utilisée par les RPCs)
-- ----------------------------------------------------------------------------
-- Lifetime = somme des gains uniquement (les conversions ne réduisent PAS le
-- cumul à vie qui détermine le palier). Balance = somme nette (gains - retraits).
-- ----------------------------------------------------------------------------
create or replace view reward_points_user_balance as
  select
    user_id,
    coalesce(sum(delta_points), 0)::integer                                       as balance,
    coalesce(sum(delta_points) filter (where delta_points > 0), 0)::integer       as lifetime
  from reward_points
  group by user_id;

-- ----------------------------------------------------------------------------
-- FONCTION INTERNE : palier courant d'un utilisateur
-- ----------------------------------------------------------------------------
create or replace function reward_current_tier(p_lifetime integer)
returns reward_tiers
language sql
stable
as $$
  select t.* from reward_tiers t
   where t.min_lifetime_points <= coalesce(p_lifetime, 0)
   order by t.rank desc
   limit 1;
$$;

-- ----------------------------------------------------------------------------
-- TRIGGER : crédit automatique de points sur transactions réussies
-- ----------------------------------------------------------------------------
-- Déclenché par AFTER INSERT (status='success' direct) et AFTER UPDATE
-- (status devient 'success' depuis un autre état).
--
-- Règles :
--   - éligibles : types 'payment', 'transfer', 'split'
--   - bénéficiaire = user_id (l'émetteur paye → c'est lui qui gagne le cashback)
--   - taux de base : 1 point pour 100 FCFA, soit amount_xof / 100
--   - multiplicateur : earn_multiplier_bps du palier courant / 10000
--   - le UNIQUE INDEX sur source_tx_id rend la fonction idempotente
-- ----------------------------------------------------------------------------
create or replace function tg_award_reward_points()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lifetime integer;
  v_multiplier_bps integer;
  v_base_points integer;
  v_final_points integer;
begin
  -- Only act when the row is (or just became) 'success'.
  if new.status <> 'success' then
    return new;
  end if;
  -- For UPDATE : only act on the transition into 'success'.
  if tg_op = 'UPDATE' and old.status = 'success' then
    return new;
  end if;
  -- Type éligible ?
  if new.type not in ('payment', 'transfer', 'split') then
    return new;
  end if;
  -- Montant valide ?
  if new.amount_xof is null or new.amount_xof < 100 then
    return new;
  end if;

  select coalesce(lifetime, 0) into v_lifetime
    from reward_points_user_balance
   where user_id = new.user_id;

  select earn_multiplier_bps into v_multiplier_bps
    from reward_current_tier(coalesce(v_lifetime, 0));
  if v_multiplier_bps is null then
    v_multiplier_bps := 10000; -- fallback Bronze 1×
  end if;

  v_base_points  := (new.amount_xof / 100)::integer;
  v_final_points := (v_base_points * v_multiplier_bps / 10000)::integer;

  if v_final_points <= 0 then
    return new;
  end if;

  -- ON CONFLICT DO NOTHING + le UNIQUE INDEX partiel garantissent l'idempotence
  -- (retry, replay webhook, double trigger, etc.).
  insert into reward_points (user_id, delta_points, kind, source_tx_id, description)
  values (
    new.user_id,
    v_final_points,
    'earn_transaction',
    new.id,
    concat('Cashback ', new.type, ' ', new.amount_xof, ' FCFA')
  )
  on conflict (source_tx_id) where source_tx_id is not null and kind = 'earn_transaction' do nothing;

  return new;
end;
$$;

drop trigger if exists award_reward_points_insert on transactions;
create trigger award_reward_points_insert
  after insert on transactions
  for each row execute function tg_award_reward_points();

drop trigger if exists award_reward_points_update on transactions;
create trigger award_reward_points_update
  after update of status on transactions
  for each row execute function tg_award_reward_points();

-- ----------------------------------------------------------------------------
-- RPC : résumé récompenses du caller (solde, palier, prochain palier)
-- ----------------------------------------------------------------------------
create or replace function get_reward_summary()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_balance integer;
  v_lifetime integer;
  v_current_tier reward_tiers;
  v_next_tier reward_tiers;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select coalesce(balance, 0), coalesce(lifetime, 0)
    into v_balance, v_lifetime
    from reward_points_user_balance
   where user_id = v_uid;

  v_balance := coalesce(v_balance, 0);
  v_lifetime := coalesce(v_lifetime, 0);

  select * into v_current_tier from reward_current_tier(v_lifetime);

  select * into v_next_tier
    from reward_tiers
   where rank > coalesce(v_current_tier.rank, 0)
   order by rank asc
   limit 1;

  return jsonb_build_object(
    'balance', v_balance,
    'lifetime', v_lifetime,
    'redeem_rate_xof_per_point', 1,        -- 1 point = 1 FCFA
    'redeem_min_points', 500,
    'current_tier', case when v_current_tier.tier is null then null else jsonb_build_object(
      'tier', v_current_tier.tier,
      'display_name', v_current_tier.display_name,
      'multiplier_bps', v_current_tier.earn_multiplier_bps,
      'color_hex', v_current_tier.color_hex,
      'min_lifetime_points', v_current_tier.min_lifetime_points
    ) end,
    'next_tier', case when v_next_tier.tier is null then null else jsonb_build_object(
      'tier', v_next_tier.tier,
      'display_name', v_next_tier.display_name,
      'multiplier_bps', v_next_tier.earn_multiplier_bps,
      'color_hex', v_next_tier.color_hex,
      'min_lifetime_points', v_next_tier.min_lifetime_points,
      'points_to_reach', greatest(v_next_tier.min_lifetime_points - v_lifetime, 0)
    ) end
  );
end;
$$;

revoke execute on function get_reward_summary() from public;
grant execute on function get_reward_summary() to authenticated;

-- ----------------------------------------------------------------------------
-- RPC : historique des points (caller uniquement) — N lignes max
-- ----------------------------------------------------------------------------
create or replace function list_reward_history(p_limit integer default 50)
returns table (
  id uuid,
  delta_points integer,
  kind reward_kind,
  description text,
  source_tx_id uuid,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select id, delta_points, kind, description, source_tx_id, created_at
    from reward_points
   where user_id = auth.uid()
   order by created_at desc
   limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

revoke execute on function list_reward_history(integer) from public;
grant execute on function list_reward_history(integer) to authenticated;

-- ----------------------------------------------------------------------------
-- RPC : conversion points → bonus wallet (FCFA)
-- ----------------------------------------------------------------------------
-- Atomique :
--   1. vérifie solde + minimum
--   2. débite le ledger (delta_points négatif, kind='redeem_wallet')
--   3. crédite le wallet en XOF
--   4. enregistre une transaction type 'refund' (provider='wallet') pour
--      tracer l'opération dans l'historique
-- ----------------------------------------------------------------------------
create or replace function redeem_reward_points(p_points integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_balance integer;
  v_xof bigint;
  v_tx_id uuid;
  v_new_wallet bigint;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if p_points is null or p_points < 500 then
    raise exception 'BELOW_MIN_POINTS';
  end if;

  -- Verrou : lock le wallet pour éviter les courses de redemption parallèles.
  perform 1 from wallets where user_id = v_uid for update;

  select coalesce(balance, 0) into v_balance
    from reward_points_user_balance
   where user_id = v_uid;

  if coalesce(v_balance, 0) < p_points then
    raise exception 'INSUFFICIENT_POINTS';
  end if;

  v_xof := p_points::bigint; -- taux fixe 1:1

  -- 1) débit du ledger
  insert into reward_points (user_id, delta_points, kind, description)
  values (v_uid, -p_points, 'redeem_wallet', concat('Conversion en bonus wallet (', v_xof, ' FCFA)'));

  -- 2) transaction wallet — d'abord pour avoir l'id à référencer
  insert into transactions (
    user_id, type, amount_xof, status, provider, description, completed_at
  )
  values (
    v_uid, 'refund', v_xof, 'success', 'wallet',
    concat('Conversion de ', p_points, ' points en bonus wallet'),
    now()
  )
  returning id into v_tx_id;

  -- 3) crédit du wallet
  update wallets
     set balance_xof = balance_xof + v_xof
   where user_id = v_uid
   returning balance_xof into v_new_wallet;

  return jsonb_build_object(
    'transaction_id', v_tx_id,
    'redeemed_points', p_points,
    'credited_xof', v_xof,
    'remaining_points', v_balance - p_points,
    'new_wallet_balance', v_new_wallet
  );
end;
$$;

revoke execute on function redeem_reward_points(integer) from public;
grant execute on function redeem_reward_points(integer) to authenticated;

-- ----------------------------------------------------------------------------
-- Backfill : crédite les points pour toutes les transactions success existantes
-- (idempotent grâce au UNIQUE INDEX sur source_tx_id).
-- ----------------------------------------------------------------------------
do $$
declare
  v_tx record;
  v_lifetime integer;
  v_multiplier_bps integer;
  v_points integer;
begin
  for v_tx in
    select id, user_id, type, amount_xof
      from transactions
     where status = 'success'
       and type in ('payment', 'transfer', 'split')
       and amount_xof >= 100
     order by created_at asc
  loop
    select coalesce(lifetime, 0) into v_lifetime
      from reward_points_user_balance where user_id = v_tx.user_id;
    select earn_multiplier_bps into v_multiplier_bps
      from reward_current_tier(coalesce(v_lifetime, 0));
    v_multiplier_bps := coalesce(v_multiplier_bps, 10000);
    v_points := ((v_tx.amount_xof / 100) * v_multiplier_bps / 10000)::integer;
    if v_points > 0 then
      insert into reward_points (user_id, delta_points, kind, source_tx_id, description)
      values (v_tx.user_id, v_points, 'earn_transaction', v_tx.id,
              concat('Cashback ', v_tx.type, ' ', v_tx.amount_xof, ' FCFA (backfill)'))
      on conflict (source_tx_id) where source_tx_id is not null and kind = 'earn_transaction' do nothing;
    end if;
  end loop;
end $$;

comment on table reward_points is
  'Ledger immuable des mouvements de points (cashback Soutra-Pay). Lecture self via RLS, écriture uniquement via fonctions SECURITY DEFINER.';
comment on table reward_tiers is
  'Paliers de fidélité (Bronze/Argent/Or/Platine) et leur multiplicateur de cashback.';
