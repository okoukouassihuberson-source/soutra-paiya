-- ============================================================================
-- SOUTRA-PAIYA — Migration 0010 : partage d'addition (bouton « Split Bill »)
-- ============================================================================
-- Un « bill_split » regroupe N demandes d'argent (une par participant). Chaque
-- part est une payment_requests classique (réutilise le moteur 0009) reliée au
-- split par split_id. Migration idempotente.
-- ============================================================================

create table if not exists bill_splits (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references profiles(id) on delete cascade,
  title text,
  total_xof bigint not null check (total_xof > 0),
  created_at timestamptz not null default now()
);
create index if not exists idx_bill_splits_creator
  on bill_splits(creator_id, created_at desc);

-- Relie chaque demande à son partage (null pour une demande simple).
alter table payment_requests
  add column if not exists split_id uuid references bill_splits(id) on delete cascade;
create index if not exists idx_payreq_split on payment_requests(split_id);

alter table bill_splits enable row level security;
drop policy if exists "bill_splits_select_creator" on bill_splits;
create policy "bill_splits_select_creator" on bill_splits for select
  using (auth.uid() = creator_id);

-- ============================================================================
-- Création atomique d'un partage : insère le bill_split + une demande par
-- participant, le tout dans une seule transaction. Le créateur est déduit du
-- JWT (auth.uid()) — impossible de créer un partage au nom d'autrui.
--   p_participants : [{ "payer_id": uuid, "amount": bigint }, ...]
-- ============================================================================
create or replace function create_bill_split(
  p_title text,
  p_total bigint,
  p_participants jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator uuid := auth.uid();
  v_split_id uuid;
  v_title text := nullif(trim(coalesce(p_title, '')), '');
  v_part jsonb;
  v_payer uuid;
  v_amount bigint;
begin
  if v_creator is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if p_total is null or p_total <= 0 then
    raise exception 'INVALID_TOTAL';
  end if;
  if p_participants is null or jsonb_array_length(p_participants) < 1 then
    raise exception 'NO_PARTICIPANTS';
  end if;

  insert into bill_splits (creator_id, title, total_xof)
  values (v_creator, v_title, p_total)
  returning id into v_split_id;

  for v_part in select * from jsonb_array_elements(p_participants) loop
    v_payer := (v_part ->> 'payer_id')::uuid;
    v_amount := (v_part ->> 'amount')::bigint;
    if v_payer = v_creator then
      raise exception 'SELF_PARTICIPANT';
    end if;
    if v_amount is null or v_amount <= 0 then
      raise exception 'INVALID_SHARE';
    end if;
    insert into payment_requests (
      requester_id, payer_id, amount_xof, note, split_id
    )
    values (
      v_creator, v_payer, v_amount,
      coalesce(v_title, 'Partage d''addition'), v_split_id
    );
  end loop;

  return v_split_id;
end;
$$;

-- Appelable par les utilisateurs authentifiés (la fonction agit uniquement
-- pour l'appelant via auth.uid()).
revoke execute on function create_bill_split(text, bigint, jsonb) from public;
grant execute on function create_bill_split(text, bigint, jsonb) to authenticated;
grant execute on function create_bill_split(text, bigint, jsonb) to service_role;
