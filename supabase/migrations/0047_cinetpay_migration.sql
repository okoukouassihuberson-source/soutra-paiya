-- ============================================================================
-- SOUTRA-PAIYA — Migration 0047 : socle migration Paystack → CinetPay
-- ============================================================================
-- Cette migration prépare la migration sans la rendre destructive :
--   1. Aliases SQL `settle_payment_charge` / `settle_payment_transfer` qui
--      forwardent vers les `paystack_settle_*` existantes. Permet aux
--      nouvelles Edge functions CinetPay d'appeler des noms agnostiques
--      sans casser les anciennes (le webhook Paystack continue à marcher
--      pendant la transition).
--   2. Table `subscriptions` (Phase 13 minimal — tier + status + expires_at).
--   3. Table `fraud_logs` (Phase 14 minimal — détection paiements suspects).
--
-- Non-cassant : aucune table existante modifiée. Les anciennes fonctions
-- paystack_* restent intactes — elles seront supprimées en Phase 14 quand
-- on aura confirmé que toutes les Edge functions ont basculé.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Aliases agnostiques pour les fonctions de règlement
-- ----------------------------------------------------------------------------
-- Forwardent simplement vers les fonctions existantes. Si plus tard on
-- supprime les paystack_*, il suffira de remplacer le corps de ces alias.

create or replace function public.settle_payment_charge(
  p_reference text,
  p_paid_subunit bigint
) returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Forwarder vers la fonction Paystack tant qu'elle existe.
  -- Note : `paystack_settle_charge` attend déjà subunit (XOF × 100) ; CinetPay
  -- nous donnera des montants en XOF entiers, l'Edge function multipliera
  -- par 100 avant d'appeler cette function.
  return public.paystack_settle_charge(p_reference, p_paid_subunit);
end;
$$;

revoke execute on function public.settle_payment_charge(text, bigint) from public;
grant execute on function public.settle_payment_charge(text, bigint) to service_role;

create or replace function public.settle_payment_transfer(
  p_reference text,
  p_outcome   text
) returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.paystack_settle_transfer(p_reference, p_outcome);
end;
$$;

revoke execute on function public.settle_payment_transfer(text, text) from public;
grant execute on function public.settle_payment_transfer(text, text) to service_role;

comment on function public.settle_payment_charge is
  'Alias agnostique vers paystack_settle_charge. Permet aux Edge CinetPay d''utiliser un nom provider-agnostic. Sera modifiable en Phase 14 pour pointer ailleurs.';
comment on function public.settle_payment_transfer is
  'Alias agnostique vers paystack_settle_transfer.';

-- ----------------------------------------------------------------------------
-- 2) Table subscriptions (Phase 13 — abonnements Standard/Pro/Premium)
-- ----------------------------------------------------------------------------

do $$ begin
  create type subscription_status as enum (
    'pending',       -- créé, paiement en attente
    'active',        -- payé et en cours
    'expired',       -- expiré, pas renouvelé
    'cancelled',     -- annulé par l'user
    'past_due'       -- échec de renouvellement, en grâce
  );
exception when duplicate_object then null;
end $$;

-- Plan name est libre (free, standard, pro, premium, soutra_premium, etc.) ;
-- on garde un text plutôt qu'un enum pour permettre à l'admin de créer de
-- nouveaux plans via Super Dashboard sans migration.
create table if not exists public.subscriptions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  plan_code      text not null,
  status         subscription_status not null default 'pending',
  amount_xof     bigint not null check (amount_xof >= 0),
  currency       text not null default 'XOF',
  -- Période courante
  started_at     timestamptz,
  expires_at     timestamptz,
  -- Renouvellement
  auto_renew     boolean not null default true,
  next_renewal_at timestamptz,
  -- Paiement
  provider       payment_provider not null default 'cinetpay',
  provider_ref   text,
  -- Audit
  created_at     timestamptz not null default now(),
  cancelled_at   timestamptz,
  cancellation_reason text
);

create index if not exists idx_subscriptions_user_status
  on public.subscriptions(user_id, status);
create index if not exists idx_subscriptions_expires
  on public.subscriptions(expires_at) where status = 'active';

alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions_select_self" on public.subscriptions;
create policy "subscriptions_select_self" on public.subscriptions
  for select using (auth.uid() = user_id or public.is_admin());

drop policy if exists "subscriptions_insert_self" on public.subscriptions;
create policy "subscriptions_insert_self" on public.subscriptions
  for insert with check (auth.uid() = user_id);

-- Updates réservés au service_role (cycle de vie via Edge functions)
-- pour empêcher un utilisateur de marquer son abo 'active' lui-même.

comment on table public.subscriptions is
  'Abonnements utilisateurs (Phase 13). Cycle de vie : pending → active → expired/cancelled. Renouvellement auto via cron + CinetPay.';

-- ----------------------------------------------------------------------------
-- 3) Table fraud_logs (Phase 14 — journal anti-fraude)
-- ----------------------------------------------------------------------------

do $$ begin
  create type fraud_severity as enum ('info', 'warn', 'high', 'critical');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type fraud_kind as enum (
    'amount_anomaly',         -- montant inhabituel
    'velocity',               -- trop de tx sur courte période
    'geo_mismatch',           -- IP vs profile mismatch
    'device_change',          -- nouveau device pour montant élevé
    'failed_pin_repeated',    -- 3+ échecs PIN
    'failed_payment_repeated',-- 3+ paiements rejetés
    'card_testing',           -- micro-tx successives
    'manual_review'           -- flag manuel admin
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.fraud_logs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references public.profiles(id) on delete set null,
  kind            fraud_kind not null,
  severity        fraud_severity not null default 'warn',
  ip_address      inet,
  user_agent      text,
  -- Contexte JSON libre : montant, device_id, geo, etc.
  context         jsonb not null default '{}'::jsonb,
  -- Lien optionnel vers la transaction concernée
  transaction_id  uuid references public.transactions(id) on delete set null,
  -- Résolution
  resolved        boolean not null default false,
  resolved_at     timestamptz,
  resolved_by     uuid references public.profiles(id) on delete set null,
  resolution_note text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_fraud_logs_user_date
  on public.fraud_logs(user_id, created_at desc);
create index if not exists idx_fraud_logs_unresolved_severity
  on public.fraud_logs(severity, created_at desc) where resolved = false;

alter table public.fraud_logs enable row level security;

-- Seul l'admin lit les fraud_logs. Les utilisateurs ne savent pas qu'on les
-- surveille (best practice anti-évasion).
drop policy if exists "fraud_logs_select_admin" on public.fraud_logs;
create policy "fraud_logs_select_admin" on public.fraud_logs
  for select using (public.is_admin());

-- Insert réservé service_role (les Edge functions logguent les events).

comment on table public.fraud_logs is
  'Journal anti-fraude (Phase 14). Insertion via Edge functions service_role. Lecture admin only — invisible pour l''user surveillé.';

-- ----------------------------------------------------------------------------
-- 4) Helper : detect_fraud_velocity — vérifie nb de tx user sur fenêtre
--    Utilisable par les Edge functions paiement pour bloquer le card testing
-- ----------------------------------------------------------------------------

create or replace function public.detect_fraud_velocity(
  p_user_id       uuid,
  p_window_minutes integer default 10,
  p_max_tx         integer default 5
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select count(*) >= p_max_tx
    from public.transactions
   where user_id = p_user_id
     and created_at >= now() - (p_window_minutes || ' minutes')::interval;
$$;

revoke execute on function public.detect_fraud_velocity(uuid, integer, integer) from public;
grant execute on function public.detect_fraud_velocity(uuid, integer, integer) to service_role;

comment on function public.detect_fraud_velocity is
  'True si l''utilisateur a fait >= p_max_tx transactions dans les p_window_minutes dernières minutes. À utiliser pour bloquer le card testing.';
