-- ============================================================================
-- SOUTRA-PAIYA — Migration 0014 : carte / menu des établissements
-- ============================================================================
-- Stocke les articles vendus par chaque établissement (plats, boissons,
-- prestations). La carte est publique en lecture (vitrine), modifiable
-- uniquement par le propriétaire de l'établissement (ou un admin).
-- Idempotente : table + policies recréées sans casser un déploiement existant.
-- ============================================================================

create table if not exists menu_items (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references venues(id) on delete cascade,
  name        text not null check (length(name) between 1 and 120),
  category    text not null default 'Plat' check (length(category) between 1 and 60),
  price_xof   integer not null check (price_xof >= 0 and price_xof <= 10000000),
  description text,
  image_url   text,
  available   boolean not null default true,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_menu_items_venue on menu_items(venue_id, position);

-- Trigger updated_at (réutilise la fonction set_updated_at de 0001 si présente,
-- sinon en local).
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'set_updated_at') then
    create or replace function set_updated_at() returns trigger as $fn$
    begin new.updated_at = now(); return new; end;
    $fn$ language plpgsql;
  end if;
end$$;

drop trigger if exists trg_menu_items_updated_at on menu_items;
create trigger trg_menu_items_updated_at
  before update on menu_items
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table menu_items enable row level security;

-- Lecture publique : la carte est visible par tout le monde (vitrine).
drop policy if exists "menu_items_select_public" on menu_items;
create policy "menu_items_select_public" on menu_items
  for select using (true);

-- Écriture réservée au propriétaire de l'établissement (ou à un admin).
drop policy if exists "menu_items_insert_owner" on menu_items;
create policy "menu_items_insert_owner" on menu_items
  for insert to authenticated
  with check (
    exists (
      select 1 from venues v
      where v.id = menu_items.venue_id
        and (v.owner_id = auth.uid() or public.is_admin())
    )
  );

drop policy if exists "menu_items_update_owner" on menu_items;
create policy "menu_items_update_owner" on menu_items
  for update to authenticated
  using (
    exists (
      select 1 from venues v
      where v.id = menu_items.venue_id
        and (v.owner_id = auth.uid() or public.is_admin())
    )
  )
  with check (
    exists (
      select 1 from venues v
      where v.id = menu_items.venue_id
        and (v.owner_id = auth.uid() or public.is_admin())
    )
  );

drop policy if exists "menu_items_delete_owner" on menu_items;
create policy "menu_items_delete_owner" on menu_items
  for delete to authenticated
  using (
    exists (
      select 1 from venues v
      where v.id = menu_items.venue_id
        and (v.owner_id = auth.uid() or public.is_admin())
    )
  );
