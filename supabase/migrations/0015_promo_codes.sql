-- ============================================================================
-- SOUTRA-PAIYA — Migration 0015 : codes promo des établissements
-- ============================================================================
-- Persiste les codes promo créés depuis l'onglet PRO « Marketing ».
-- Idempotente : recrée table + policies sans casser un déploiement existant.
-- ============================================================================

create table if not exists promo_codes (
  id            uuid primary key default gen_random_uuid(),
  venue_id      uuid not null references venues(id) on delete cascade,
  code          text not null check (length(code) between 2 and 32),
  discount_pct  smallint not null check (discount_pct between 1 and 100),
  max_uses      integer check (max_uses is null or max_uses > 0),
  uses_count    integer not null default 0 check (uses_count >= 0),
  valid_until   timestamptz,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Le code est unique au sein d'un même établissement (insensible à la casse).
create unique index if not exists ux_promo_codes_venue_code
  on promo_codes(venue_id, upper(code));

create index if not exists idx_promo_codes_venue
  on promo_codes(venue_id, active);

-- Trigger updated_at (réutilise set_updated_at si déjà défini).
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'set_updated_at') then
    create or replace function set_updated_at() returns trigger as $fn$
    begin new.updated_at = now(); return new; end;
    $fn$ language plpgsql;
  end if;
end$$;

drop trigger if exists trg_promo_codes_updated_at on promo_codes;
create trigger trg_promo_codes_updated_at
  before update on promo_codes
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table promo_codes enable row level security;

-- Lecture publique des codes ACTIFS uniquement — la vérification de validité
-- complète (max_uses, valid_until) reste côté serveur au moment de l'usage.
drop policy if exists "promo_codes_select_public_active" on promo_codes;
create policy "promo_codes_select_public_active" on promo_codes
  for select using (active = true);

-- Le propriétaire (ou un admin) voit ses propres codes même désactivés.
drop policy if exists "promo_codes_select_owner_all" on promo_codes;
create policy "promo_codes_select_owner_all" on promo_codes
  for select to authenticated
  using (
    exists (
      select 1 from venues v
      where v.id = promo_codes.venue_id
        and (v.owner_id = auth.uid() or public.is_admin())
    )
  );

drop policy if exists "promo_codes_insert_owner" on promo_codes;
create policy "promo_codes_insert_owner" on promo_codes
  for insert to authenticated
  with check (
    exists (
      select 1 from venues v
      where v.id = promo_codes.venue_id
        and (v.owner_id = auth.uid() or public.is_admin())
    )
  );

drop policy if exists "promo_codes_update_owner" on promo_codes;
create policy "promo_codes_update_owner" on promo_codes
  for update to authenticated
  using (
    exists (
      select 1 from venues v
      where v.id = promo_codes.venue_id
        and (v.owner_id = auth.uid() or public.is_admin())
    )
  )
  with check (
    exists (
      select 1 from venues v
      where v.id = promo_codes.venue_id
        and (v.owner_id = auth.uid() or public.is_admin())
    )
  );

drop policy if exists "promo_codes_delete_owner" on promo_codes;
create policy "promo_codes_delete_owner" on promo_codes
  for delete to authenticated
  using (
    exists (
      select 1 from venues v
      where v.id = promo_codes.venue_id
        and (v.owner_id = auth.uid() or public.is_admin())
    )
  );
