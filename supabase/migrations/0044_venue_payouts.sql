-- ============================================================================
-- SOUTRA-PAIYA — Migration 0044 : Payouts gérants (virements sortants venue)
-- ============================================================================
-- Permet au gérant d'un venue de demander un virement mobile money d'une
-- partie de ses revenus nets, depuis l'Espace gérant.
--
-- Architecture :
--   • Table `venue_payouts` dédiée (séparée des transactions perso)
--   • Solde payable virtuel = net (brut − commission Soutra-Playce)
--     − payouts (pending + success) déjà enregistrés
--   • Le règlement physique se fait via Paystack transfer mobile money,
--     orchestré par l'Edge function `venue-payout-initiate` (à venir).
--
-- Sécurité :
--   • RLS : SELECT pour owner + admin ; INSERT/UPDATE réservés au service_role
--   • RPCs SECURITY DEFINER vérifient `auth.uid() = venues.owner_id`
--     (réutilise `assert_venue_owner_or_admin` de la 0043)
--   • Concurrence : `pg_advisory_xact_lock` par venue pour sérialiser les
--     demandes concurrentes sur le même venue (évite le double-spend)
--
-- Non-cassant : aucune table existante modifiée. Le wiring monétisation (0042)
-- et le dashboard pro (0043) restent inchangés.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Table venue_payouts
-- ----------------------------------------------------------------------------

create table if not exists public.venue_payouts (
  id                  uuid primary key default gen_random_uuid(),
  venue_id            uuid not null references public.venues(id) on delete cascade,
  owner_id            uuid not null references public.profiles(id) on delete cascade,
  amount_xof          bigint not null check (amount_xof > 0),
  provider            payment_provider not null,
  phone               text not null,
  status              tx_status not null default 'pending',
  paystack_reference  text not null unique,
  recipient_code      text,
  transfer_code       text,
  failure_reason      text,
  requested_at        timestamptz not null default now(),
  completed_at        timestamptz,
  metadata            jsonb not null default '{}'::jsonb
);

create index if not exists idx_venue_payouts_venue_date
  on public.venue_payouts(venue_id, requested_at desc);

create index if not exists idx_venue_payouts_owner_date
  on public.venue_payouts(owner_id, requested_at desc);

create index if not exists idx_venue_payouts_pending
  on public.venue_payouts(venue_id) where status = 'pending';

-- ----------------------------------------------------------------------------
-- 2) RLS — lecture par owner / admin, écriture service_role uniquement
-- ----------------------------------------------------------------------------

alter table public.venue_payouts enable row level security;

drop policy if exists "venue_payouts_select_owner" on public.venue_payouts;
create policy "venue_payouts_select_owner" on public.venue_payouts
  for select
  using (auth.uid() = owner_id or public.is_admin());

-- Aucune policy INSERT/UPDATE/DELETE pour le rôle authenticated :
-- toutes les mutations passent par les RPCs SECURITY DEFINER ci-dessous,
-- elles-mêmes appelées par l'Edge function (service_role) ou par l'utilisateur
-- avec contrôle d'owner explicite.

-- ----------------------------------------------------------------------------
-- 3) RPC : get_venue_payable_balance
--    Calcule le solde encore retirable pour un venue.
--    payable = max(0, net_lifetime − payouts_pending − payouts_success)
--    avec net_lifetime = gross_lifetime − commission_lifetime
--    (même définition que get_pro_revenue_summary mais sans bornes temporelles).
-- ----------------------------------------------------------------------------

create or replace function public.get_venue_payable_balance(p_venue_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_gross      bigint := 0;
  v_commission bigint := 0;
  v_pending    bigint := 0;
  v_paid       bigint := 0;
  v_net        bigint;
  v_payable    bigint;
  v_avg        bigint;
begin
  perform public.assert_venue_owner_or_admin(p_venue_id);

  -- Brut lifetime : même 3 sources que get_pro_revenue_summary, sans dates.
  select avg_price_xof into v_avg from public.venues where id = p_venue_id limit 1;

  -- Réservations honorées (deposit ou estimation party_size × avg_price)
  select coalesce(sum(coalesce(r.deposit_xof,
    coalesce(v_avg, 0) * coalesce(r.party_size, 1)
  )), 0)::bigint
    into v_gross
    from public.reservations r
   where r.venue_id = p_venue_id
     and r.status = 'arrived';

  -- + Tickets vendus (events du venue)
  v_gross := v_gross + coalesce((
    select sum(t.price_xof)::bigint
      from public.tickets t
      join public.events e on e.id = t.event_id
     where e.venue_id = p_venue_id
       and t.status = 'valid'
  ), 0);

  -- + Paiements liés à une réservation du venue
  v_gross := v_gross + coalesce((
    select sum(tx.amount_xof)::bigint
      from public.transactions tx
      join public.reservations r on r.id = tx.reservation_id
     where r.venue_id = p_venue_id
       and tx.status = 'success'
       and tx.type in ('payment', 'split')
  ), 0);

  -- Commission Soutra-Playce lifetime
  select coalesce(sum(amount_xof), 0)::bigint
    into v_commission
    from public.monetization_revenue_log
   where venue_id = p_venue_id;

  v_net := greatest(0, v_gross - v_commission);

  -- Payouts déjà demandés / réglés
  select
    coalesce(sum(amount_xof) filter (where status = 'pending'), 0)::bigint,
    coalesce(sum(amount_xof) filter (where status = 'success'), 0)::bigint
    into v_pending, v_paid
    from public.venue_payouts
   where venue_id = p_venue_id;

  v_payable := greatest(0, v_net - v_pending - v_paid);

  return jsonb_build_object(
    'gross_xof',      v_gross,
    'commission_xof', v_commission,
    'net_xof',        v_net,
    'pending_xof',    v_pending,
    'paid_xof',       v_paid,
    'payable_xof',    v_payable
  );
end;
$$;

revoke execute on function public.get_venue_payable_balance(uuid) from public;
grant execute on function public.get_venue_payable_balance(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 4) RPC : request_venue_payout
--    Sérialise via advisory_lock par venue pour empêcher le double-spend.
--    Retourne { payout_id, reference } à l'Edge function qui orchestrera
--    le transfer Paystack ensuite.
-- ----------------------------------------------------------------------------

create or replace function public.request_venue_payout(
  p_venue_id  uuid,
  p_amount    bigint,
  p_provider  text,
  p_phone     text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_owner_id   uuid;
  v_kyc        kyc_status;
  v_balance    jsonb;
  v_payable    bigint;
  v_reference  text;
  v_payout_id  uuid;
  v_min_xof    bigint := 1000;
  v_max_xof    bigint := 2000000;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- Owner check (raises NOT_OWNER / VENUE_NOT_FOUND si pas autorisé)
  perform public.assert_venue_owner_or_admin(p_venue_id);

  -- Récupère owner_id et KYC du caller pour les checks suivants
  select v.owner_id into v_owner_id
    from public.venues v
   where v.id = p_venue_id
   limit 1;

  if v_owner_id is null then
    raise exception 'VENUE_NOT_FOUND';
  end if;

  select p.kyc_status into v_kyc
    from public.profiles p
   where p.id = v_uid
   limit 1;

  if v_kyc is null or v_kyc <> 'verified' then
    raise exception 'KYC_REQUIRED';
  end if;

  -- Montant valide
  if p_amount is null or p_amount < v_min_xof then
    raise exception 'AMOUNT_TOO_LOW';
  end if;
  if p_amount > v_max_xof then
    raise exception 'AMOUNT_TOO_HIGH';
  end if;

  -- Opérateur supporté (les mêmes que paystack-withdraw)
  if lower(p_provider) not in ('mtn', 'orange', 'wave') then
    raise exception 'PROVIDER_INVALID';
  end if;

  -- Format téléphone CI (+225 + 10 chiffres)
  if p_phone is null or p_phone !~ '^\+225[0-9]{10}$' then
    raise exception 'PHONE_INVALID';
  end if;

  -- ── Sérialise les demandes concurrentes pour le même venue ──
  -- pg_advisory_xact_lock : libéré automatiquement à la fin de la transaction.
  perform pg_advisory_xact_lock(
    hashtextextended('venue_payout:' || p_venue_id::text, 0)
  );

  -- Re-calcule le solde APRÈS lock (toute écriture pending concurrente est
  -- déjà visible, le lock garantit qu'aucune nouvelle ne passera entre
  -- maintenant et le INSERT ci-dessous).
  v_balance := public.get_venue_payable_balance(p_venue_id);
  v_payable := coalesce((v_balance->>'payable_xof')::bigint, 0);

  if p_amount > v_payable then
    raise exception 'INSUFFICIENT_PAYABLE';
  end if;

  -- Crée le payout en pending. Référence Paystack = sp-vp-<uuid>
  -- (vs sp-wd-<uuid> pour les retraits wallet user, cf. paystack-withdraw).
  v_reference := 'sp-vp-' || gen_random_uuid()::text;

  insert into public.venue_payouts (
    venue_id, owner_id, amount_xof, provider, phone, status, paystack_reference
  ) values (
    p_venue_id,
    -- L'owner_id stocké est celui du venue (= caller en règle générale,
    -- sauf si admin qui agit pour lui).
    v_owner_id,
    p_amount,
    lower(p_provider)::payment_provider,
    p_phone,
    'pending',
    v_reference
  )
  returning id into v_payout_id;

  return jsonb_build_object(
    'payout_id', v_payout_id,
    'reference', v_reference
  );
end;
$$;

revoke execute on function public.request_venue_payout(uuid, bigint, text, text) from public;
grant execute on function public.request_venue_payout(uuid, bigint, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 5) RPC : settle_venue_payout
--    Appelée par l'Edge function (succès immédiat) ou par le webhook Paystack
--    (transfer.success / transfer.failed / transfer.reversed). Idempotente.
--    Sur échec : pas de recrédit (le solde se recalcule sans cette ligne,
--    puisqu'elle n'est plus ni pending ni success).
-- ----------------------------------------------------------------------------

create or replace function public.settle_venue_payout(
  p_reference       text,
  p_outcome         text,
  p_failure_reason  text default null,
  p_metadata_patch  jsonb default '{}'::jsonb
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payout venue_payouts;
begin
  select * into v_payout
    from public.venue_payouts
   where paystack_reference = p_reference
   for update;

  if not found then
    return 'not_found';
  end if;

  -- Idempotence : si déjà réglé, on patch éventuellement la metadata seulement.
  if v_payout.status in ('success', 'failed') then
    if p_metadata_patch is not null and p_metadata_patch <> '{}'::jsonb then
      update public.venue_payouts
         set metadata = coalesce(metadata, '{}'::jsonb) || p_metadata_patch
       where id = v_payout.id;
    end if;
    return 'already_settled';
  end if;

  if p_outcome = 'success' then
    update public.venue_payouts
       set status = 'success',
           completed_at = now(),
           metadata = coalesce(metadata, '{}'::jsonb) || coalesce(p_metadata_patch, '{}'::jsonb)
     where id = v_payout.id;
    return 'settled_success';
  else
    update public.venue_payouts
       set status = 'failed',
           completed_at = now(),
           failure_reason = nullif(trim(coalesce(p_failure_reason, '')), ''),
           metadata = coalesce(metadata, '{}'::jsonb) || coalesce(p_metadata_patch, '{}'::jsonb)
     where id = v_payout.id;
    return 'settled_failed';
  end if;
end;
$$;

revoke execute on function public.settle_venue_payout(text, text, text, jsonb) from public;
grant execute on function public.settle_venue_payout(text, text, text, jsonb) to service_role;

-- ----------------------------------------------------------------------------
-- 6) RPC pratique : liste des payouts pour un venue (réutilisable côté UI)
--    L'UI peut aussi taper directement la table (RLS l'autorise) — cette RPC
--    sert quand on veut limiter / ordonner sans s'inquiéter de la pagination.
-- ----------------------------------------------------------------------------

create or replace function public.list_venue_payouts(
  p_venue_id uuid,
  p_limit    integer default 50
) returns table (
  id                  uuid,
  amount_xof          bigint,
  provider            text,
  phone               text,
  status              text,
  paystack_reference  text,
  failure_reason      text,
  requested_at        timestamptz,
  completed_at        timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.assert_venue_owner_or_admin(p_venue_id);
  return query
    select vp.id, vp.amount_xof, vp.provider::text, vp.phone, vp.status::text,
           vp.paystack_reference, vp.failure_reason,
           vp.requested_at, vp.completed_at
      from public.venue_payouts vp
     where vp.venue_id = p_venue_id
     order by vp.requested_at desc
     limit greatest(1, least(coalesce(p_limit, 50), 500));
end;
$$;

revoke execute on function public.list_venue_payouts(uuid, integer) from public;
grant execute on function public.list_venue_payouts(uuid, integer) to authenticated;

-- ----------------------------------------------------------------------------
-- 7) Commentaires
-- ----------------------------------------------------------------------------

comment on table public.venue_payouts is
  'Demandes de virement sortant d''un gérant vers son compte mobile money. Cycle de vie : pending → success | failed.';
comment on function public.get_venue_payable_balance is
  'Solde encore retirable pour un venue : net (brut − commission) − payouts (pending + success).';
comment on function public.request_venue_payout is
  'Crée une demande de payout pour un venue. Sérialisée par advisory_lock, vérifie owner + KYC + solde.';
comment on function public.settle_venue_payout is
  'Règle un payout (success / failed / reversed). Idempotente. Appelée par l''Edge function et le webhook.';
comment on function public.list_venue_payouts is
  'Liste les payouts d''un venue (owner ou admin) pour affichage UI.';
