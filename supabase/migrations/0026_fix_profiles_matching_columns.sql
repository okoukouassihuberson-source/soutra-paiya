-- ============================================================================
-- SOUTRA-PAIYA — Migration 0026 : hot-fix colonnes matching sur profiles
-- ============================================================================
-- Symptôme prod : « column profiles.interests does not exist » dans le RPC
-- `discover_profiles`. La migration 0023 était censée ajouter ces colonnes
-- mais visiblement elles ne sont pas toutes là en base.
--
-- Cause probable : 0023 a peut-être été ré-exécutée partiellement (uniquement
-- le fix `district` collé en isolation, pas le bloc ALTER TABLE complet), ou
-- bien la transaction initiale a fait un rollback silencieux.
--
-- Ce fix est 100 % idempotent (`add column if not exists`). Il peut être
-- rejoué autant de fois que nécessaire sans risque.
-- ============================================================================

alter table public.profiles
  add column if not exists district     text,
  add column if not exists interests    text[] not null default '{}',
  add column if not exists birth_year   integer check (birth_year is null or birth_year between 1900 and extract(year from now())::int - 13),
  add column if not exists gender       text check (gender is null or gender in ('m','f','x')),
  add column if not exists looking_for  text check (looking_for is null or looking_for in ('m','f','any')),
  add column if not exists discoverable boolean not null default false;

-- Vérification post-migration : lever une erreur claire si une colonne manque
-- (ne devrait jamais arriver, mais utile en cas de pépin de droits / schéma).
do $$
declare
  v_missing text;
begin
  select string_agg(c.column_name, ', ')
    into v_missing
  from (values ('district'), ('interests'), ('birth_year'), ('gender'), ('looking_for'), ('discoverable')) c(column_name)
  where not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = c.column_name
  );
  if v_missing is not null then
    raise exception 'Colonnes encore manquantes après la migration : %', v_missing;
  end if;
end$$;
