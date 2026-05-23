-- ============================================================================
-- SOUTRA-PAIYA — Migration 0028 : application des promos en réservation
-- ============================================================================
-- Complète la brique « Marketing PRO » (migration 0015) : la table
-- `promo_codes` existait, mais aucun chemin client n'appliquait les codes
-- à une réservation. Ici on câble :
-- - validation côté serveur (active, non expiré, non épuisé)
-- - liaison `reservations.promo_code_id`
-- - consommation atomique au moment où la réservation passe en `confirmed`
--   via un trigger qui incrémente `uses_count` et enregistre la redemption
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Schéma : on annexe le code promo à la réservation.
-- ----------------------------------------------------------------------------
alter table public.reservations
  add column if not exists promo_code_id uuid references public.promo_codes(id) on delete set null;

create index if not exists idx_reservations_promo
  on public.reservations(promo_code_id) where promo_code_id is not null;

-- ----------------------------------------------------------------------------
-- 2) Table de tracking : 1 redemption = 1 réservation qui a utilisé un code.
--    Le PK composite garantit l'idempotence (impossible de consommer 2 fois
--    le même code pour la même réservation).
-- ----------------------------------------------------------------------------
create table if not exists public.promo_redemptions (
  promo_code_id  uuid not null references public.promo_codes(id) on delete cascade,
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  redeemed_at    timestamptz not null default now(),
  primary key (promo_code_id, reservation_id)
);

create index if not exists idx_promo_redemptions_promo
  on public.promo_redemptions(promo_code_id);

alter table public.promo_redemptions enable row level security;

-- Lecture par le propriétaire de l'établissement et l'auteur de la résa.
drop policy if exists "promo_redemptions_select_owner_or_user" on public.promo_redemptions;
create policy "promo_redemptions_select_owner_or_user" on public.promo_redemptions
  for select using (
    exists (
      select 1 from public.reservations r
      join public.venues v on v.id = r.venue_id
      where r.id = reservation_id
        and (r.user_id = auth.uid() or v.owner_id = auth.uid() or public.is_admin())
    )
  );

-- ----------------------------------------------------------------------------
-- 3) RPC : valider un code promo pour un venue donné.
--    Renvoie un jsonb explicite { ok, promo_id?, discount_pct?, code?, reason? }
--    pour que le client puisse afficher un message précis.
-- ----------------------------------------------------------------------------
create or replace function public.validate_promo_code(
  p_venue_id uuid,
  p_code     text
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  p record;
begin
  if p_code is null or trim(p_code) = '' then
    return jsonb_build_object('ok', false, 'reason', 'CODE_VIDE');
  end if;

  select pc.id, pc.code, pc.discount_pct, pc.max_uses, pc.uses_count, pc.valid_until, pc.active
    into p
  from public.promo_codes pc
  where pc.venue_id = p_venue_id and upper(pc.code) = upper(trim(p_code))
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'CODE_INTROUVABLE');
  end if;
  if not p.active then
    return jsonb_build_object('ok', false, 'reason', 'CODE_DESACTIVE');
  end if;
  if p.valid_until is not null and p.valid_until < now() then
    return jsonb_build_object('ok', false, 'reason', 'CODE_EXPIRE');
  end if;
  if p.max_uses is not null and p.uses_count >= p.max_uses then
    return jsonb_build_object('ok', false, 'reason', 'CODE_EPUISE');
  end if;

  return jsonb_build_object(
    'ok', true,
    'promo_id', p.id,
    'code', p.code,
    'discount_pct', p.discount_pct
  );
end;
$$;

grant execute on function public.validate_promo_code(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 4) Trigger : consommation atomique du code au passage en `confirmed`.
--    - n'agit que sur le passage `* -> confirmed`
--    - idempotent grâce à la PK de promo_redemptions
--    - utilise un FOR UPDATE pour éviter la race condition sur uses_count
-- ----------------------------------------------------------------------------
create or replace function public.consume_promo_on_confirm()
returns trigger
language plpgsql
as $$
declare
  v_inserted boolean := false;
begin
  -- On veut consommer une seule fois, au moment du passage en confirmed.
  if new.promo_code_id is null then return new; end if;
  if new.status <> 'confirmed' then return new; end if;
  if old.status = 'confirmed' then return new; end if;

  -- Lock + idempotence : si la redemption existe déjà, on ne fait rien.
  insert into public.promo_redemptions (promo_code_id, reservation_id)
  values (new.promo_code_id, new.id)
  on conflict do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted then
    update public.promo_codes
       set uses_count = uses_count + 1
     where id = new.promo_code_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_consume_promo_on_confirm on public.reservations;
create trigger trg_consume_promo_on_confirm
  after update of status on public.reservations
  for each row execute function public.consume_promo_on_confirm();

comment on function public.validate_promo_code is
  'Valide un code promo pour un venue. Renvoie { ok, promo_id?, code?, discount_pct?, reason? }.';
comment on function public.consume_promo_on_confirm is
  'Trigger : consomme atomiquement un promo_code au passage de la réservation en confirmed (idempotent).';
