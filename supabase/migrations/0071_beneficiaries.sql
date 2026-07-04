-- ============================================================================
-- SOUTRA-PAIYA — Migration 0071 : bénéficiaires, résumé dépenses, recherche universelle
-- ============================================================================
-- Phase 2 du master prompt "Soutra-Pay V2" (dashboard enrichi + actions
-- rapides + recherche universelle). Trois briques indépendantes regroupées
-- dans une seule migration car toutes légères et sans dépendance croisée :
--
--   1. Bénéficiaires : carnet de contacts P2P, alimenté automatiquement à
--      chaque transfert réussi (upsert_beneficiary appelée par l'edge
--      function wallet-transfer) + utilisable manuellement.
--   2. Résumé dépenses/revenus du mois — pure agrégation sur `transactions`
--      existante, aucune nouvelle table.
--   3. Recherche universelle — combine bénéficiaires + transactions + venues
--      en une seule RPC (recherche texte simple, pas de LLM, pour rester
--      instantanée au fil de la frappe).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Bénéficiaires
-- ----------------------------------------------------------------------------

create table public.beneficiaries (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  phone        text not null,
  nickname     text,
  use_count    integer not null default 1,
  last_used_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  unique (owner_id, phone)
);

create index idx_beneficiaries_owner_recent
  on public.beneficiaries (owner_id, use_count desc, last_used_at desc);

alter table public.beneficiaries enable row level security;

create policy "beneficiaries_select_own" on public.beneficiaries
  for select to authenticated using (owner_id = auth.uid());
create policy "beneficiaries_write_own" on public.beneficiaries
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Insert ou incrémente use_count/last_used_at si le contact existe déjà.
-- Appelée par l'edge function wallet-transfer (service_role) juste après un
-- transfert réussi — p_owner_id explicite car le client service_role n'a
-- pas de auth.uid() (pas de contexte utilisateur authentifié côté DB).
create or replace function public.upsert_beneficiary(p_owner_id uuid, p_phone text, p_nickname text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_owner_id is null then
    raise exception 'OWNER_REQUIRED';
  end if;
  if p_phone is null or p_phone !~ '^\+225[0-9]{10}$' then
    raise exception 'PHONE_INVALID';
  end if;

  insert into public.beneficiaries (owner_id, phone, nickname)
  values (p_owner_id, p_phone, nullif(trim(coalesce(p_nickname, '')), ''))
  on conflict (owner_id, phone) do update
    set use_count    = public.beneficiaries.use_count + 1,
        last_used_at = now(),
        nickname     = coalesce(excluded.nickname, public.beneficiaries.nickname)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.upsert_beneficiary(uuid, text, text) from public;
grant execute on function public.upsert_beneficiary(uuid, text, text) to service_role;

-- Liste triée par fréquence d'usage puis récence, avec le nom à jour depuis
-- profiles (le nickname prime s'il est défini).
create or replace function public.list_my_beneficiaries(p_limit integer default 10)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
    select
      b.phone,
      coalesce(b.nickname, p.full_name, b.phone) as display_name,
      b.use_count,
      b.last_used_at
    from public.beneficiaries b
    left join public.profiles p on p.phone in (b.phone, replace(b.phone, '+', ''))
    where b.owner_id = auth.uid()
    order by b.use_count desc, b.last_used_at desc
    limit greatest(1, least(coalesce(p_limit, 10), 50))
  ) t;
$$;

grant execute on function public.list_my_beneficiaries(integer) to authenticated;

-- ----------------------------------------------------------------------------
-- 2) Résumé dépenses / revenus du mois — pure agrégation, aucune nouvelle table
-- ----------------------------------------------------------------------------

create or replace function public.get_my_spending_summary(p_month date default date_trunc('month', now())::date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_since timestamptz := date_trunc('month', p_month);
  v_until timestamptz := v_since + interval '1 month';
  v_spent    bigint := 0;
  v_received bigint := 0;
  v_by_type  jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'NOT_AUTHENTICATED');
  end if;

  -- Dépenses : tout ce qui sort du wallet du user sur la période.
  select coalesce(sum(amount_xof), 0)::bigint into v_spent
    from public.transactions
   where status = 'success'
     and created_at >= v_since and created_at < v_until
     and (
       (user_id = v_uid and type in ('payment', 'withdraw', 'fee', 'split'))
       or (user_id = v_uid and type = 'transfer')
     );

  -- Revenus : tout ce qui entre sur la période.
  select coalesce(sum(amount_xof), 0)::bigint into v_received
    from public.transactions
   where status = 'success'
     and created_at >= v_since and created_at < v_until
     and (
       (user_id = v_uid and type in ('topup', 'refund', 'escrow_release'))
       or (counterparty_id = v_uid and type = 'transfer')
     );

  -- Répartition par type (dépenses uniquement, pour la barre du dashboard).
  select coalesce(jsonb_agg(jsonb_build_object('type', ty, 'amount_xof', amt) order by amt desc), '[]'::jsonb)
    into v_by_type
    from (
      select type::text as ty, sum(amount_xof)::bigint as amt
        from public.transactions
       where status = 'success'
         and created_at >= v_since and created_at < v_until
         and user_id = v_uid
         and type in ('payment', 'withdraw', 'fee', 'split', 'transfer')
       group by type
    ) sub;

  return jsonb_build_object(
    'ok', true,
    'month', to_char(v_since, 'YYYY-MM'),
    'spent_xof', v_spent,
    'received_xof', v_received,
    'net_xof', v_received - v_spent,
    'by_type', coalesce(v_by_type, '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_my_spending_summary(date) to authenticated;

-- ----------------------------------------------------------------------------
-- 3) Recherche universelle v1 — texte simple, pas de LLM (instantané)
-- ----------------------------------------------------------------------------

create or replace function public.search_my_universe(p_query text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_q   text := nullif(trim(coalesce(p_query, '')), '');
  v_contacts     jsonb;
  v_transactions jsonb;
  v_venues       jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'NOT_AUTHENTICATED');
  end if;
  if v_q is null or length(v_q) < 2 then
    return jsonb_build_object('ok', true, 'contacts', '[]'::jsonb, 'transactions', '[]'::jsonb, 'venues', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_contacts
    from (
      select
        b.phone,
        coalesce(b.nickname, p.full_name, b.phone) as display_name
      from public.beneficiaries b
      left join public.profiles p on p.phone in (b.phone, replace(b.phone, '+', ''))
      where b.owner_id = v_uid
        and (
          b.phone ilike '%' || v_q || '%'
          or coalesce(b.nickname, '') ilike '%' || v_q || '%'
          or coalesce(p.full_name, '') ilike '%' || v_q || '%'
        )
      limit 5
    ) t;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_transactions
    from (
      select
        tx.id, tx.type::text, tx.amount_xof, tx.description, tx.created_at,
        coalesce(p.full_name, p.phone) as counterparty_name
      from public.transactions tx
      left join public.profiles p on p.id = tx.counterparty_id
      where (tx.user_id = v_uid or tx.counterparty_id = v_uid)
        and (
          coalesce(tx.description, '') ilike '%' || v_q || '%'
          or coalesce(p.full_name, '') ilike '%' || v_q || '%'
        )
      order by tx.created_at desc
      limit 5
    ) t;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_venues
    from (
      select id, name, slug, category::text, city
        from public.venues
       where status = 'active'
         and name ilike '%' || v_q || '%'
       order by rating_count desc nulls last
       limit 5
    ) t;

  return jsonb_build_object(
    'ok', true,
    'contacts', v_contacts,
    'transactions', v_transactions,
    'venues', v_venues
  );
end;
$$;

grant execute on function public.search_my_universe(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 4) Commentaires
-- ----------------------------------------------------------------------------

comment on table public.beneficiaries is
  'Carnet de contacts P2P par utilisateur, alimenté automatiquement à chaque transfert réussi (wallet-transfer appelle upsert_beneficiary).';
comment on function public.upsert_beneficiary is
  'Ajoute ou met à jour (use_count++, last_used_at) un bénéficiaire pour le user courant.';
comment on function public.list_my_beneficiaries is
  'Liste des bénéficiaires du user courant, triée par fréquence puis récence.';
comment on function public.get_my_spending_summary is
  'Agrège les transactions du user courant sur un mois donné : dépenses, revenus, répartition par type.';
comment on function public.search_my_universe is
  'Recherche texte simple combinant bénéficiaires + transactions + venues du user courant. Pas de LLM, pensée pour la recherche instantanée au fil de la frappe.';
