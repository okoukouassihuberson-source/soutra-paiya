-- ============================================================================
-- SOUTRA-PAIYA — Migration 0011 : PIN de paiement à 4 chiffres
-- ============================================================================
-- Le PIN est hashé via bcrypt (pgcrypto) et stocké dans une table dédiée dont
-- AUCUNE policy RLS n'autorise l'accès client : seules les fonctions
-- SECURITY DEFINER ci-dessous le lisent/écrivent. Le hash n'est jamais exposé.
-- Migration idempotente.
-- ============================================================================

create table if not exists payment_pins (
  user_id uuid primary key references profiles(id) on delete cascade,
  pin_hash text not null,
  updated_at timestamptz not null default now()
);

alter table payment_pins enable row level security;
-- Volontairement aucune policy : table inaccessible aux clients.

-- Définit ou met à jour le PIN (4 chiffres) de l'utilisateur courant.
create or replace function set_payment_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if p_pin !~ '^[0-9]{4}$' then
    raise exception 'INVALID_PIN';
  end if;
  insert into payment_pins (user_id, pin_hash, updated_at)
  values (auth.uid(), crypt(p_pin, gen_salt('bf')), now())
  on conflict (user_id) do update
    set pin_hash = excluded.pin_hash, updated_at = now();
end;
$$;

-- Vérifie le PIN de l'utilisateur courant (false si aucun PIN / PIN erroné).
create or replace function verify_payment_pin(p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
begin
  if auth.uid() is null then
    return false;
  end if;
  select pin_hash into v_hash from payment_pins where user_id = auth.uid();
  if v_hash is null then
    return false;
  end if;
  return v_hash = crypt(p_pin, v_hash);
end;
$$;

-- Indique si l'utilisateur courant a défini un PIN.
create or replace function has_payment_pin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (select 1 from payment_pins where user_id = auth.uid());
$$;

revoke execute on function set_payment_pin(text) from public;
revoke execute on function verify_payment_pin(text) from public;
revoke execute on function has_payment_pin() from public;
grant execute on function set_payment_pin(text) to authenticated;
grant execute on function verify_payment_pin(text) to authenticated;
grant execute on function has_payment_pin() to authenticated;
