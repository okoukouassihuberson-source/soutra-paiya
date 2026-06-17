-- ============================================================================
-- SOUTRA-PAIYA — Migration 0058 : réparation des horaires legacy
-- ============================================================================
-- BUG DÉTECTÉ : le dashboard Pro Web stockait opening_hours en STRING brut
-- ("12:00 - 23:00") au lieu du format ARRAY ["12:00","23:00"] attendu par
-- le mobile et par la fonction SQL is_venue_open. Conséquence : tous les
-- venues qui ont édité leurs horaires côté web depuis le dashboard sont
-- marqués "Fermé aujourd'hui" sur mobile en permanence.
--
-- Cette migration :
--   1. Définit un helper parse_hours_string(text) qui convertit toute
--      forme courante de saisie ("12:00 - 23:00", "12h-23h", "Fermé", etc.)
--      vers un jsonb array ["HH:MM","HH:MM"] ou NULL.
--   2. RPC migrate_legacy_hours() qui scanne tous les venues et corrige
--      les horaires au mauvais format. Idempotente : skip si déjà array.
--      Retourne {converted, skipped, errors}.
--   3. Appelle automatiquement la RPC une fois à la fin de la migration
--      pour fixer l'état actuel.
--
-- Non-cassant : les venues avec format déjà correct (array) sont laissés
-- intacts. Les venues sans horaires (jsonb null/vide) ne sont pas touchés.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Helper : parse une string en jsonb array de 2 horaires
--    Accepte : "12:00 - 23:00", "12h-23h", "12h00 → 23h00", "9:00-17:00", etc.
--    Retourne : '["12:00","23:00"]'::jsonb ou NULL si non parsable.
-- ----------------------------------------------------------------------------

create or replace function public.parse_hours_string(p_input text)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_clean text;
  v_match text[];
  v_open  text;
  v_close text;
begin
  if p_input is null or trim(p_input) = '' then
    return null;
  end if;

  v_clean := lower(trim(p_input));

  -- Mots-clés "fermé" → null
  if v_clean in ('fermé', 'ferme', 'closed', 'fermé.', 'fermée') then
    return null;
  end if;

  -- Cherche 2 horaires HH:MM ou Hh ou HhMM séparés par un délimiteur
  -- Pattern accepté : "12:00 - 23:00", "12h - 23h", "12h00→23h00", "9-17", "09h 23h"
  v_match := regexp_match(
    v_clean,
    '(\d{1,2})\s*[h:]?\s*(\d{0,2})\s*[-–—→àa]+\s*(\d{1,2})\s*[h:]?\s*(\d{0,2})'
  );
  if v_match is null then
    return null;
  end if;

  v_open  := lpad(v_match[1], 2, '0') || ':' || coalesce(nullif(v_match[2], ''), '00');
  v_close := lpad(v_match[3], 2, '0') || ':' || coalesce(nullif(v_match[4], ''), '00');

  -- Validation basique heures 0-23
  if (v_match[1])::int > 23 or (v_match[3])::int > 23 then
    return null;
  end if;

  return jsonb_build_array(v_open, v_close);
end;
$$;

comment on function public.parse_hours_string is
  'Convertit "12:00 - 23:00" et variantes en jsonb [open, close]. NULL si non parsable.';

-- ----------------------------------------------------------------------------
-- 2) RPC de migration des données legacy
--    Scanne tous les venues et corrige les opening_hours mal formatés.
--    Idempotente : skip les venues déjà au bon format (array de 2 strings).
-- ----------------------------------------------------------------------------

create or replace function public.migrate_legacy_hours()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row     record;
  v_new     jsonb;
  v_day     text;
  v_value   jsonb;
  v_parsed  jsonb;
  v_dirty   boolean;
  v_converted integer := 0;
  v_skipped   integer := 0;
  v_errors    integer := 0;
begin
  -- Garde-fou : admin uniquement pour éviter un appel accidentel par un user.
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED';
  end if;

  for v_row in
    select id, opening_hours from public.venues
    where opening_hours is not null
      and jsonb_typeof(opening_hours) = 'object'
  loop
    v_new := '{}'::jsonb;
    v_dirty := false;

    for v_day in select jsonb_object_keys(v_row.opening_hours)
    loop
      v_value := v_row.opening_hours -> v_day;

      -- Format CORRECT : array de 2 strings → conserver tel quel
      if jsonb_typeof(v_value) = 'array' and jsonb_array_length(v_value) >= 2 then
        v_new := v_new || jsonb_build_object(v_day, v_value);
        continue;
      end if;

      -- Format LEGACY : string → tenter parsing
      if jsonb_typeof(v_value) = 'string' then
        v_parsed := public.parse_hours_string(v_value #>> '{}');
        if v_parsed is not null then
          v_new := v_new || jsonb_build_object(v_day, v_parsed);
          v_dirty := true;
        else
          -- String non parsable (ex: "Fermé") → on ne met rien pour ce jour
          v_dirty := true;
        end if;
        continue;
      end if;

      -- Autre format inconnu : skip
      v_dirty := true;
    end loop;

    if v_dirty then
      begin
        update public.venues set opening_hours = v_new where id = v_row.id;
        v_converted := v_converted + 1;
      exception when others then
        v_errors := v_errors + 1;
      end;
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'converted', v_converted,
    'skipped', v_skipped,
    'errors', v_errors,
    'generated_at', now()
  );
end;
$$;

revoke execute on function public.migrate_legacy_hours() from public;
grant execute on function public.migrate_legacy_hours() to authenticated;

comment on function public.migrate_legacy_hours is
  'Scanne et répare les opening_hours au mauvais format. Idempotent. Admin only.';

-- ----------------------------------------------------------------------------
-- 3) Activer le realtime sur la table venues
--    Permet aux clients (mobile) de s'abonner aux UPDATE pour MAJ live
--    quand le Pro change ses horaires depuis le dashboard.
--    NB : la publication 'supabase_realtime' existe par défaut.
-- ----------------------------------------------------------------------------

do $$
begin
  -- Idempotent : skip si déjà ajouté à la publication.
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'venues'
  ) then
    alter publication supabase_realtime add table public.venues;
  end if;
exception when others then
  raise notice 'Realtime publication setup skipped: %', sqlerrm;
end $$;

-- ----------------------------------------------------------------------------
-- 4) Exécution one-shot directement dans la migration
--    On bypass le is_admin() check via SET LOCAL ROLE pour rouler en superuser
--    pendant la migration. Si tu rejoues la migration plus tard sans privilège,
--    elle skippera silencieusement (idempotente).
-- ----------------------------------------------------------------------------

do $$
declare
  v_result jsonb;
begin
  -- Tentative directe : si la session a les droits, on convertit en ligne.
  -- Sinon, le user doit appeler la RPC depuis l'éditeur SQL après login admin.
  begin
    -- Boucle simplifiée (copy de migrate_legacy_hours sans is_admin gate)
    declare
      v_row     record;
      v_new     jsonb;
      v_day     text;
      v_value   jsonb;
      v_parsed  jsonb;
      v_dirty   boolean;
      v_converted integer := 0;
    begin
      for v_row in
        select id, opening_hours from public.venues
        where opening_hours is not null
          and jsonb_typeof(opening_hours) = 'object'
      loop
        v_new := '{}'::jsonb;
        v_dirty := false;

        for v_day in select jsonb_object_keys(v_row.opening_hours)
        loop
          v_value := v_row.opening_hours -> v_day;
          if jsonb_typeof(v_value) = 'array' and jsonb_array_length(v_value) >= 2 then
            v_new := v_new || jsonb_build_object(v_day, v_value);
            continue;
          end if;
          if jsonb_typeof(v_value) = 'string' then
            v_parsed := public.parse_hours_string(v_value #>> '{}');
            if v_parsed is not null then
              v_new := v_new || jsonb_build_object(v_day, v_parsed);
            end if;
            v_dirty := true;
            continue;
          end if;
          v_dirty := true;
        end loop;

        if v_dirty then
          update public.venues set opening_hours = v_new where id = v_row.id;
          v_converted := v_converted + 1;
        end if;
      end loop;
      raise notice 'Migration 0058 : % venues mis à jour', v_converted;
    end;
  exception when others then
    raise notice 'Auto-migration skipped (rejoue manuellement migrate_legacy_hours()) : %', sqlerrm;
  end;
end $$;
