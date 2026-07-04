-- ============================================================================
-- SOUTRA-PAIYA — Migration 0068 : moteur de fidélité (remplace le cashback)
-- ============================================================================
-- 100 FCFA dépensés (paiement marchand confirmé) = 1 point de fidélité.
-- Le moteur cashback (migration 0051) est déprécié par la migration 0069 qui
-- suit celle-ci — on construit d'abord le remplaçant, on bascule le
-- front-end dessus, puis seulement après on coupe le cashback.
--
-- Mécanique (miroir de apply_cashback_for_tx) :
--   1. À chaque transaction type='payment' qui passe à status='success'
--      (hors paiement d'abonnement), on crédite floor(amount_xof / 100)
--      points au compte fidélité de l'utilisateur.
--   2. Le niveau (bronze → diamant) est recalculé à partir du cumul
--      lifetime (qui ne baisse jamais, contrairement au solde dépensable).
--   3. Les missions actives de type "tx_count" progressent automatiquement
--      et se complètent + créditent leur bonus dès que la cible est atteinte
--      (auto-claim : pas de bouton de validation séparé pour le v1).
--   4. Le solde dépensable (points_balance) s'échange contre des
--      récompenses du catalogue via redeem_loyalty_reward — c'est le
--      bouton "Échanger" côté UI.
--
-- Idempotent : unique index sur (source_tx_id) where kind='earn' empêche le
-- double crédit pour une même transaction source.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Tables
-- ----------------------------------------------------------------------------

create table public.loyalty_levels (
  code       text primary key,
  label      text not null,
  min_points bigint not null default 0,
  color      text not null,
  emoji      text not null,
  benefits   jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.loyalty_accounts (
  user_id         uuid primary key references public.profiles(id) on delete cascade,
  points_balance  bigint not null default 0 check (points_balance >= 0),
  points_lifetime bigint not null default 0 check (points_lifetime >= 0),
  level_code      text not null default 'bronze' references public.loyalty_levels(code),
  updated_at      timestamptz not null default now()
);

create type loyalty_tx_kind as enum ('earn', 'redeem', 'bonus', 'adjustment', 'expire');

create table public.loyalty_transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  kind          loyalty_tx_kind not null,
  points        bigint not null,
  source_tx_id  uuid references public.transactions(id),
  description   text,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  check (
    (kind in ('earn', 'bonus') and points > 0)
    or (kind in ('redeem', 'expire') and points < 0)
    or kind = 'adjustment'
  )
);

create unique index uq_loyalty_tx_source_earn
  on public.loyalty_transactions (source_tx_id)
  where kind = 'earn' and source_tx_id is not null;

create index idx_loyalty_transactions_user_date
  on public.loyalty_transactions (user_id, created_at desc);

create table public.loyalty_badges (
  code        text primary key,
  label       text not null,
  description text,
  icon        text not null,
  criteria    jsonb not null default '{}'::jsonb,
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.loyalty_user_badges (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  badge_code text not null references public.loyalty_badges(code) on delete cascade,
  earned_at  timestamptz not null default now(),
  primary key (user_id, badge_code)
);

create table public.loyalty_missions (
  code          text primary key,
  label         text not null,
  description   text,
  icon          text,
  points_reward integer not null default 0,
  criteria      jsonb not null default '{}'::jsonb,
  active        boolean not null default true,
  starts_at     timestamptz,
  ends_at       timestamptz,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);

create table public.loyalty_user_missions (
  user_id       uuid not null references public.profiles(id) on delete cascade,
  mission_code  text not null references public.loyalty_missions(code) on delete cascade,
  progress      integer not null default 0,
  completed_at  timestamptz,
  claimed_at    timestamptz,
  primary key (user_id, mission_code)
);

create table public.loyalty_rewards (
  code        text primary key,
  label       text not null,
  description text,
  image_url   text,
  points_cost integer not null check (points_cost > 0),
  stock       integer,
  category    text,
  active      boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create type loyalty_redemption_status as enum ('pending', 'fulfilled', 'cancelled');

create table public.loyalty_reward_redemptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  reward_code  text not null references public.loyalty_rewards(code),
  points_spent integer not null,
  status       loyalty_redemption_status not null default 'pending',
  notes        text,
  created_at   timestamptz not null default now(),
  fulfilled_at timestamptz
);

-- ----------------------------------------------------------------------------
-- 2) RLS
-- ----------------------------------------------------------------------------

alter table public.loyalty_levels enable row level security;
alter table public.loyalty_accounts enable row level security;
alter table public.loyalty_transactions enable row level security;
alter table public.loyalty_badges enable row level security;
alter table public.loyalty_user_badges enable row level security;
alter table public.loyalty_missions enable row level security;
alter table public.loyalty_user_missions enable row level security;
alter table public.loyalty_rewards enable row level security;
alter table public.loyalty_reward_redemptions enable row level security;

-- Catalogue : lecture publique (anon inclus — landing marketing /loyalty,
-- même logique que subscription_plans), écriture réservée à l'admin.
create policy "loyalty_levels_select" on public.loyalty_levels
  for select to anon, authenticated using (true);
create policy "loyalty_levels_admin_write" on public.loyalty_levels
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "loyalty_badges_select" on public.loyalty_badges
  for select to anon, authenticated using (active or public.is_admin());
create policy "loyalty_badges_admin_write" on public.loyalty_badges
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "loyalty_missions_select" on public.loyalty_missions
  for select to anon, authenticated using (active or public.is_admin());
create policy "loyalty_missions_admin_write" on public.loyalty_missions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "loyalty_rewards_select" on public.loyalty_rewards
  for select to anon, authenticated using (active or public.is_admin());
create policy "loyalty_rewards_admin_write" on public.loyalty_rewards
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Perso : lecture propre + admin. Écriture réservée à service_role via les
-- RPC SECURITY DEFINER ci-dessous (pas de policy INSERT/UPDATE pour
-- authenticated -> RLS bloque par défaut).
create policy "loyalty_accounts_select_own" on public.loyalty_accounts
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "loyalty_transactions_select_own" on public.loyalty_transactions
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "loyalty_user_badges_select_own" on public.loyalty_user_badges
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "loyalty_user_missions_select_own" on public.loyalty_user_missions
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "loyalty_reward_redemptions_select_own" on public.loyalty_reward_redemptions
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "loyalty_reward_redemptions_admin_update" on public.loyalty_reward_redemptions
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 3) RPC : crédite les points pour une transaction de paiement confirmée
-- ----------------------------------------------------------------------------

create or replace function public.apply_loyalty_points_for_tx(p_tx_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx             record;
  v_points         bigint;
  v_existing_id    uuid;
  v_new_tx_id      uuid;
  v_account        record;
  v_new_level      text;
  v_earn_count     integer;
  v_mission        record;
  v_just_completed boolean;
begin
  select id, user_id, type, amount_xof, status, metadata
    into v_tx
    from public.transactions
   where id = p_tx_id
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'TX_NOT_FOUND');
  end if;

  if v_tx.status <> 'success' then
    return jsonb_build_object('ok', false, 'reason', 'TX_NOT_SUCCESS');
  end if;
  if v_tx.type <> 'payment' then
    return jsonb_build_object('ok', false, 'reason', 'TX_NOT_PAYMENT');
  end if;
  if v_tx.metadata->>'purpose' = 'subscription' then
    return jsonb_build_object('ok', false, 'reason', 'TX_IS_SUBSCRIPTION');
  end if;
  if v_tx.amount_xof <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'TX_AMOUNT_ZERO');
  end if;

  select id into v_existing_id
    from public.loyalty_transactions
   where source_tx_id = p_tx_id and kind = 'earn'
   limit 1;
  if v_existing_id is not null then
    return jsonb_build_object('ok', false, 'reason', 'ALREADY_APPLIED', 'loyalty_tx_id', v_existing_id);
  end if;

  -- 100 FCFA = 1 point. Division entière bigint/int : tronque vers zéro,
  -- donc floor pour un montant positif.
  v_points := v_tx.amount_xof / 100;
  if v_points < 1 then
    return jsonb_build_object('ok', false, 'reason', 'AMOUNT_TOO_SMALL', 'computed', v_points);
  end if;

  insert into public.loyalty_transactions (user_id, kind, points, source_tx_id, description, metadata)
  values (
    v_tx.user_id, 'earn', v_points, p_tx_id,
    'Points gagnés — achat',
    jsonb_build_object('source_amount_xof', v_tx.amount_xof)
  )
  returning id into v_new_tx_id;

  insert into public.loyalty_accounts (user_id, points_balance, points_lifetime, level_code)
  values (v_tx.user_id, v_points, v_points, 'bronze')
  on conflict (user_id) do update
    set points_balance  = loyalty_accounts.points_balance + excluded.points_balance,
        points_lifetime = loyalty_accounts.points_lifetime + excluded.points_lifetime,
        updated_at      = now()
  returning * into v_account;

  -- Recalcul du niveau à partir du cumul lifetime (ne baisse jamais).
  select code into v_new_level
    from public.loyalty_levels
   where min_points <= v_account.points_lifetime
   order by min_points desc
   limit 1;

  if v_new_level is not null and v_new_level <> v_account.level_code then
    update public.loyalty_accounts set level_code = v_new_level where user_id = v_tx.user_id;
  end if;

  -- Badge "premier achat" au tout premier gain de points.
  select count(*) into v_earn_count
    from public.loyalty_transactions
   where user_id = v_tx.user_id and kind = 'earn';
  if v_earn_count = 1 then
    insert into public.loyalty_user_badges (user_id, badge_code)
    values (v_tx.user_id, 'first_purchase')
    on conflict do nothing;
  end if;

  -- Progression des missions actives de type "tx_count" (ex: "5 paiements
  -- ce mois-ci"). Auto-complète + crédite le bonus dès la cible atteinte.
  for v_mission in
    select m.code, m.points_reward, m.criteria
      from public.loyalty_missions m
     where m.active
       and (m.starts_at is null or m.starts_at <= now())
       and (m.ends_at is null or m.ends_at >= now())
       and coalesce(m.criteria->>'type', '') = 'tx_count'
  loop
    insert into public.loyalty_user_missions (user_id, mission_code, progress)
    values (v_tx.user_id, v_mission.code, 1)
    on conflict (user_id, mission_code) do update
      set progress = loyalty_user_missions.progress + 1
    where loyalty_user_missions.completed_at is null;

    v_just_completed := null;
    update public.loyalty_user_missions
       set completed_at = now(), claimed_at = now()
     where user_id = v_tx.user_id
       and mission_code = v_mission.code
       and completed_at is null
       and progress >= coalesce((v_mission.criteria->>'target')::int, 999999)
    returning true into v_just_completed;

    if v_just_completed and v_mission.points_reward > 0 then
      insert into public.loyalty_transactions (user_id, kind, points, description, metadata)
      values (
        v_tx.user_id, 'bonus', v_mission.points_reward,
        'Mission accomplie : ' || v_mission.code,
        jsonb_build_object('mission_code', v_mission.code)
      );

      update public.loyalty_accounts
         set points_balance  = points_balance + v_mission.points_reward,
             points_lifetime = points_lifetime + v_mission.points_reward,
             updated_at      = now()
       where user_id = v_tx.user_id;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'loyalty_tx_id', v_new_tx_id,
    'points', v_points,
    'level_code', coalesce(v_new_level, v_account.level_code)
  );
end;
$$;

revoke execute on function public.apply_loyalty_points_for_tx(uuid) from public;
grant execute on function public.apply_loyalty_points_for_tx(uuid) to service_role;

-- ----------------------------------------------------------------------------
-- 4) Trigger AFTER UPDATE transactions : déclenche le crédit automatiquement
-- ----------------------------------------------------------------------------

create or replace function public.tg_transactions_apply_loyalty()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.type <> 'payment' then return new; end if;
  if new.status <> 'success' then return new; end if;
  if old.status = 'success' then return new; end if;
  if new.metadata->>'purpose' = 'subscription' then return new; end if;
  perform public.apply_loyalty_points_for_tx(new.id);
  return new;
end;
$$;

drop trigger if exists trg_transactions_apply_loyalty on public.transactions;
create trigger trg_transactions_apply_loyalty
  after update of status on public.transactions
  for each row execute function public.tg_transactions_apply_loyalty();

-- Badge de bienvenue à la création du compte fidélité (1re transaction
-- payante de l'utilisateur, cf. upsert dans apply_loyalty_points_for_tx).
create or replace function public.tg_loyalty_accounts_welcome_badge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.loyalty_user_badges (user_id, badge_code)
  values (new.user_id, 'welcome')
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists trg_loyalty_accounts_welcome_badge on public.loyalty_accounts;
create trigger trg_loyalty_accounts_welcome_badge
  after insert on public.loyalty_accounts
  for each row execute function public.tg_loyalty_accounts_welcome_badge();

-- ----------------------------------------------------------------------------
-- 5) RPC : échange de points contre une récompense du catalogue
-- ----------------------------------------------------------------------------

create or replace function public.redeem_loyalty_reward(p_reward_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid           uuid := auth.uid();
  v_reward        record;
  v_account       record;
  v_redemption_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'NOT_AUTHENTICATED');
  end if;

  select * into v_reward
    from public.loyalty_rewards
   where code = p_reward_code and active
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'REWARD_NOT_FOUND');
  end if;
  if v_reward.stock is not null and v_reward.stock <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'OUT_OF_STOCK');
  end if;

  select * into v_account
    from public.loyalty_accounts
   where user_id = v_uid
   for update;
  if not found or v_account.points_balance < v_reward.points_cost then
    return jsonb_build_object('ok', false, 'reason', 'INSUFFICIENT_POINTS');
  end if;

  -- Seul le solde dépensable baisse ; le cumul lifetime (niveau) ne bouge pas.
  update public.loyalty_accounts
     set points_balance = points_balance - v_reward.points_cost,
         updated_at     = now()
   where user_id = v_uid;

  if v_reward.stock is not null then
    update public.loyalty_rewards set stock = stock - 1 where code = p_reward_code;
  end if;

  insert into public.loyalty_transactions (user_id, kind, points, description, metadata)
  values (
    v_uid, 'redeem', -v_reward.points_cost,
    'Échange : ' || v_reward.label,
    jsonb_build_object('reward_code', p_reward_code)
  );

  insert into public.loyalty_reward_redemptions (user_id, reward_code, points_spent, status)
  values (v_uid, p_reward_code, v_reward.points_cost, 'pending')
  returning id into v_redemption_id;

  return jsonb_build_object(
    'ok', true,
    'redemption_id', v_redemption_id,
    'points_spent', v_reward.points_cost,
    'remaining_balance', v_account.points_balance - v_reward.points_cost
  );
end;
$$;

grant execute on function public.redeem_loyalty_reward(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 6) RPC user-facing : stats fidélité du user courant
-- ----------------------------------------------------------------------------

create or replace function public.get_my_loyalty_stats(p_window_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid           uuid := auth.uid();
  v_window        integer := greatest(1, least(coalesce(p_window_days, 30), 365));
  v_since         timestamptz := now() - (v_window || ' days')::interval;
  v_account       record;
  v_level         record;
  v_next          record;
  v_period_points bigint;
  v_period_count  integer;
  v_rank          bigint;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'NOT_AUTHENTICATED');
  end if;

  select * into v_account from public.loyalty_accounts where user_id = v_uid;

  if not found then
    select code, label, min_points, color, emoji into v_level
      from public.loyalty_levels order by min_points asc limit 1;
    return jsonb_build_object(
      'ok', true,
      'window_days', v_window,
      'points_balance', 0,
      'points_lifetime', 0,
      'level', jsonb_build_object(
        'code', v_level.code, 'label', v_level.label,
        'min_points', v_level.min_points, 'color', v_level.color, 'emoji', v_level.emoji
      ),
      'next_level', null,
      'period_points', 0,
      'period_count', 0,
      'rank', null
    );
  end if;

  select code, label, min_points, color, emoji into v_level
    from public.loyalty_levels where code = v_account.level_code;

  select code, label, min_points into v_next
    from public.loyalty_levels
   where min_points > v_account.points_lifetime
   order by min_points asc limit 1;

  select coalesce(sum(points), 0), count(*) into v_period_points, v_period_count
    from public.loyalty_transactions
   where user_id = v_uid and kind in ('earn', 'bonus') and created_at >= v_since;

  select ranked.rank into v_rank from (
    select user_id, rank() over (order by points_lifetime desc) as rank
      from public.loyalty_accounts
  ) ranked where ranked.user_id = v_uid;

  return jsonb_build_object(
    'ok', true,
    'window_days', v_window,
    'points_balance', v_account.points_balance,
    'points_lifetime', v_account.points_lifetime,
    'level', jsonb_build_object(
      'code', v_level.code, 'label', v_level.label,
      'min_points', v_level.min_points, 'color', v_level.color, 'emoji', v_level.emoji
    ),
    'next_level', case when v_next.code is null then null else jsonb_build_object(
      'code', v_next.code, 'label', v_next.label, 'min_points', v_next.min_points,
      'points_remaining', v_next.min_points - v_account.points_lifetime
    ) end,
    'period_points', v_period_points,
    'period_count', v_period_count,
    'rank', v_rank
  );
end;
$$;

grant execute on function public.get_my_loyalty_stats(integer) to authenticated;

-- ----------------------------------------------------------------------------
-- 7) RPC : classement public par cumul lifetime
-- ----------------------------------------------------------------------------

create or replace function public.get_loyalty_leaderboard(p_limit integer default 20)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
    select p.full_name, la.points_lifetime, la.level_code,
           rank() over (order by la.points_lifetime desc) as rank
      from public.loyalty_accounts la
      join public.profiles p on p.id = la.user_id
     order by la.points_lifetime desc
     limit greatest(1, least(coalesce(p_limit, 20), 100))
  ) t;
$$;

grant execute on function public.get_loyalty_leaderboard(integer) to authenticated;

-- ----------------------------------------------------------------------------
-- 8) RPC admin : stats globales fidélité (dashboard back-office)
-- ----------------------------------------------------------------------------

create or replace function public.admin_loyalty_stats(p_window_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_window integer := greatest(1, least(coalesce(p_window_days, 30), 365));
  v_since  timestamptz := now() - (v_window || ' days')::interval;
begin
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED';
  end if;

  return jsonb_build_object(
    'window_days', v_window,
    'generated_at', now(),
    'totals', jsonb_build_object(
      'points_distributed_all_time', (
        select coalesce(sum(points), 0)::bigint from public.loyalty_transactions where kind in ('earn', 'bonus')
      ),
      'points_distributed_period', (
        select coalesce(sum(points), 0)::bigint from public.loyalty_transactions
         where kind in ('earn', 'bonus') and created_at >= v_since
      ),
      'points_redeemed_all_time', (
        select coalesce(abs(sum(points)), 0)::bigint from public.loyalty_transactions where kind = 'redeem'
      ),
      'active_accounts', (select count(*) from public.loyalty_accounts),
      'active_users_period', (
        select count(distinct user_id) from public.loyalty_transactions where created_at >= v_since
      )
    ),
    'by_level', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'level_code', code, 'label', label, 'count', cnt
      ) order by min_points), '[]'::jsonb)
      from (
        select l.code, l.label, l.min_points, count(la.user_id) as cnt
          from public.loyalty_levels l
          left join public.loyalty_accounts la on la.level_code = l.code
         group by l.code, l.label, l.min_points
      ) sub
    ),
    'by_day', (
      select coalesce(jsonb_agg(jsonb_build_object('date', d, 'points', pts) order by d), '[]'::jsonb)
      from (
        select gs::date as d,
               coalesce((
                 select sum(points) from public.loyalty_transactions
                  where kind in ('earn', 'bonus')
                    and created_at >= gs and created_at < gs + interval '1 day'
               ), 0) as pts
          from generate_series(v_since::date, now()::date, interval '1 day') gs
      ) sub
    ),
    'top_users', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'full_name', p.full_name, 'points_lifetime', la.points_lifetime, 'level_code', la.level_code
      ) order by la.points_lifetime desc), '[]'::jsonb)
      from (select * from public.loyalty_accounts order by points_lifetime desc limit 10) la
      join public.profiles p on p.id = la.user_id
    ),
    'recent_transactions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', lt.id, 'user_id', lt.user_id, 'kind', lt.kind, 'points', lt.points,
        'description', lt.description, 'created_at', lt.created_at
      ) order by lt.created_at desc), '[]'::jsonb)
      from (select * from public.loyalty_transactions order by created_at desc limit 30) lt
    )
  );
end;
$$;

revoke execute on function public.admin_loyalty_stats(integer) from public;
grant execute on function public.admin_loyalty_stats(integer) to authenticated;

-- ----------------------------------------------------------------------------
-- 9) Seed — données de démonstration pour que l'admin ait du contenu réel
-- ----------------------------------------------------------------------------

insert into public.loyalty_levels (code, label, min_points, color, emoji, benefits, sort_order) values
  ('bronze',   'Bronze',  0,     '#B87333', '🥉', '["Bienvenue dans le programme fidélité Soutra-Playce"]'::jsonb, 1),
  ('silver',   'Argent',  1000,  '#9CA3AF', '🥈', '["Support prioritaire"]'::jsonb, 2),
  ('gold',     'Or',      5000,  '#D4AF37', '🥇', '["Offres partenaires exclusives"]'::jsonb, 3),
  ('platinum', 'Platine', 20000, '#6E8898', '💎', '["Cadeaux surprises réguliers"]'::jsonb, 4),
  ('diamond',  'Diamant', 60000, '#5BCFFA', '✨', '["Statut VIP Soutra-Playce"]'::jsonb, 5)
on conflict (code) do nothing;

insert into public.loyalty_badges (code, label, description, icon, criteria, sort_order) values
  ('welcome',        'Bienvenue',    'Ton compte fidélité est activé.',            '🎉', '{}'::jsonb, 1),
  ('first_purchase', 'Premier achat', 'Ton premier paiement crédité en points.',    '🛍️', '{}'::jsonb, 2)
on conflict (code) do nothing;

insert into public.loyalty_missions (code, label, description, icon, points_reward, criteria, active, sort_order) values
  ('five_payments_month', '5 paiements ce mois-ci', 'Effectue 5 paiements pour gagner un bonus de points.', '🎯', 200, '{"type":"tx_count","target":5}'::jsonb, true, 1)
on conflict (code) do nothing;

insert into public.loyalty_rewards (code, label, description, points_cost, stock, category, active, sort_order) values
  ('discount_10',  'Réduction 10 % partenaire', 'Bon de réduction chez un établissement partenaire.', 500, null, 'reduction', true, 1),
  ('free_delivery', 'Livraison offerte',        'Une livraison offerte sur ta prochaine commande shop.', 300, null, 'shop', true, 2)
on conflict (code) do nothing;

-- ----------------------------------------------------------------------------
-- 10) Commentaires
-- ----------------------------------------------------------------------------

comment on function public.apply_loyalty_points_for_tx is
  'Calcule et crédite les points fidélité pour une tx payment confirmée (100 FCFA = 1 point). Idempotent via uq_loyalty_tx_source_earn. Recalcule le niveau, fait progresser les missions tx_count, attribue le badge premier achat.';
comment on function public.redeem_loyalty_reward is
  'Échange des points du solde dépensable contre une récompense du catalogue. Le cumul lifetime (niveau) ne baisse jamais.';
comment on function public.get_my_loyalty_stats is
  'Stats fidélité du user courant : solde, cumul lifetime, niveau + prochain niveau, gains sur la fenêtre, rang.';
comment on function public.get_loyalty_leaderboard is
  'Classement public des utilisateurs par cumul de points lifetime.';
comment on function public.admin_loyalty_stats is
  'Stats globales fidélité pour le dashboard admin : totaux, répartition par niveau, timeseries, top users, transactions récentes.';
