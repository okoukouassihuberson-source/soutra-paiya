-- ============================================================================
-- SOUTRA-PAIYA — Migration 0061 : activation immédiate des établissements Pro
-- ============================================================================
-- Supprime le goulot admin : un Pro qui crée son venue depuis /pro obtient
-- IMMÉDIATEMENT un venue status='active' (visible côté mobile via la vue
-- venues_public, migration 0020). Plus de status='draft' bloquant.
--
-- Pattern :
--   • RPC pro_create_venue : owner = caller, status='active' direct
--   • Defaults intelligents selon businessType (migration 0057) :
--       - horaires par défaut (hôtel 24/7, restau 9-22h, magasin 8-20h, etc.)
--       - description auto si vide ("Découvrez {name} à {city}")
--       - cover/logo placeholders par businessType (Unsplash CC0)
--   • Slug unique (suffixe random si conflit, jamais bloquant)
--   • Anti-spam basique : 1 venue actif max par couple (owner_id, lower(name),
--     lower(address)) — empêche les doublons triviaux
--
-- Conservation : la table venue_submissions (migration 0040) reste pertinente
-- pour les CONTRIBUTIONS COMMUNAUTAIRES (user normal qui signale un lieu qu'il
-- n'opère pas). Ce flow community garde sa modération admin. Différent du Pro
-- qui ouvre SON business — c'est le scope de cette migration.
--
-- Non-cassant : aucune table modifiée, aucun INSERT direct retiré (le code
-- frontend choisit s'il appelle la RPC ou pas).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Helper : défauts d'horaires par businessType
--    Format normalisé venues.opening_hours : Record<DayKey, [openHHMM, closeHHMM]>
--    Si jour fermé, clé omise. Cohérent avec apps/web pro/page.tsx.
-- ----------------------------------------------------------------------------

create or replace function public.default_opening_hours(p_business_type venue_business_type)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case p_business_type
    -- Hôtels : front desk 24/7
    when 'hotel_rooms' then jsonb_build_object(
      'mon', jsonb_build_array('00:00', '23:59'),
      'tue', jsonb_build_array('00:00', '23:59'),
      'wed', jsonb_build_array('00:00', '23:59'),
      'thu', jsonb_build_array('00:00', '23:59'),
      'fri', jsonb_build_array('00:00', '23:59'),
      'sat', jsonb_build_array('00:00', '23:59'),
      'sun', jsonb_build_array('00:00', '23:59')
    )
    -- Restauration & nightlife : large amplitude soir
    when 'reservation_table' then jsonb_build_object(
      'mon', jsonb_build_array('09:00', '23:00'),
      'tue', jsonb_build_array('09:00', '23:00'),
      'wed', jsonb_build_array('09:00', '23:00'),
      'thu', jsonb_build_array('09:00', '23:00'),
      'fri', jsonb_build_array('09:00', '23:59'),
      'sat', jsonb_build_array('10:00', '23:59'),
      'sun', jsonb_build_array('10:00', '22:00')
    )
    -- Commerce : 8-20h tous les jours sauf dimanche après-midi
    when 'product_catalog' then jsonb_build_object(
      'mon', jsonb_build_array('08:00', '20:00'),
      'tue', jsonb_build_array('08:00', '20:00'),
      'wed', jsonb_build_array('08:00', '20:00'),
      'thu', jsonb_build_array('08:00', '20:00'),
      'fri', jsonb_build_array('08:00', '20:00'),
      'sat', jsonb_build_array('08:00', '20:00'),
      'sun', jsonb_build_array('09:00', '13:00')
    )
    -- Sport / cinéma / loisirs : 9-22h tous les jours
    when 'time_slot' then jsonb_build_object(
      'mon', jsonb_build_array('09:00', '22:00'),
      'tue', jsonb_build_array('09:00', '22:00'),
      'wed', jsonb_build_array('09:00', '22:00'),
      'thu', jsonb_build_array('09:00', '22:00'),
      'fri', jsonb_build_array('09:00', '22:00'),
      'sat', jsonb_build_array('09:00', '22:00'),
      'sun', jsonb_build_array('09:00', '22:00')
    )
    -- Services pro : heures de bureau lun-ven 8-18h, sam 9-13h
    when 'service_quote' then jsonb_build_object(
      'mon', jsonb_build_array('08:00', '18:00'),
      'tue', jsonb_build_array('08:00', '18:00'),
      'wed', jsonb_build_array('08:00', '18:00'),
      'thu', jsonb_build_array('08:00', '18:00'),
      'fri', jsonb_build_array('08:00', '18:00'),
      'sat', jsonb_build_array('09:00', '13:00')
    )
    -- VTC : mêmes horaires que services pro (PostgreSQL CASE simple ne
    -- supporte pas "WHEN a, b THEN x" → on duplique la branche).
    when 'vtc_ride' then jsonb_build_object(
      'mon', jsonb_build_array('08:00', '18:00'),
      'tue', jsonb_build_array('08:00', '18:00'),
      'wed', jsonb_build_array('08:00', '18:00'),
      'thu', jsonb_build_array('08:00', '18:00'),
      'fri', jsonb_build_array('08:00', '18:00'),
      'sat', jsonb_build_array('09:00', '13:00')
    )
    -- Événementiel : flexible — pas de défaut, le Pro renseignera par événement
    when 'event_tickets' then '{}'::jsonb
    -- Fiche info / visite : 8-18h en semaine
    else jsonb_build_object(
      'mon', jsonb_build_array('08:00', '18:00'),
      'tue', jsonb_build_array('08:00', '18:00'),
      'wed', jsonb_build_array('08:00', '18:00'),
      'thu', jsonb_build_array('08:00', '18:00'),
      'fri', jsonb_build_array('08:00', '18:00'),
      'sat', jsonb_build_array('09:00', '13:00')
    )
  end;
$$;

grant execute on function public.default_opening_hours(venue_business_type) to anon, authenticated, service_role;

comment on function public.default_opening_hours is
  'Horaires d''ouverture par défaut selon le businessType. Format Record<DayKey,[HH:MM,HH:MM]> aligné avec la lecture mobile.';

-- ----------------------------------------------------------------------------
-- 2) Helper : cover URL placeholder par businessType
--    Photos CC0 Unsplash (URLs stables, hot-linkables). Le Pro upload sa
--    vraie photo en quelques secondes après création — c'est un fallback
--    pour qu'aucune fiche n'apparaisse vide côté mobile.
-- ----------------------------------------------------------------------------

create or replace function public.default_cover_url(p_business_type venue_business_type)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_business_type
    when 'reservation_table' then 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1600&q=80'
    when 'hotel_rooms'       then 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1600&q=80'
    when 'product_catalog'   then 'https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=1600&q=80'
    when 'event_tickets'     then 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1600&q=80'
    when 'time_slot'         then 'https://images.unsplash.com/photo-1571902943202-507ec2618e8f?w=1600&q=80'
    when 'service_quote'     then 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1600&q=80'
    when 'vtc_ride'          then 'https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=1600&q=80'
    else                          'https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=1600&q=80'
  end;
$$;

grant execute on function public.default_cover_url(venue_business_type) to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3) RPC pro_create_venue : activation immédiate
--    Owner = caller. Status='active' direct. Slug unique.
--    Defaults selon businessType. Anti-doublon trivial (owner+name+address).
-- ----------------------------------------------------------------------------

create or replace function public.pro_create_venue(
  p_name        text,
  p_category    text,
  p_address     text,
  p_city        text default 'Abidjan',
  p_phone       text default null,
  p_whatsapp    text default null,
  p_description text default null,
  p_district    text default null,
  p_lat         double precision default null,
  p_lng         double precision default null
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid       uuid := auth.uid();
  v_cat       venue_category;
  v_bt        venue_business_type;
  v_slug      text;
  v_slug_try  text;
  v_n         integer := 0;
  v_existing  uuid;
  v_new_id    uuid;
  v_name      text;
  v_addr      text;
  v_city      text;
  v_desc      text;
  v_hours     jsonb;
  v_cover     text;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- Normalisation + validation
  v_name := trim(coalesce(p_name, ''));
  v_addr := trim(coalesce(p_address, ''));
  v_city := nullif(trim(coalesce(p_city, '')), '');
  if v_city is null then v_city := 'Abidjan'; end if;

  if length(v_name) < 2 then
    raise exception 'NAME_REQUIRED';
  end if;
  if length(v_name) > 200 then
    raise exception 'NAME_TOO_LONG';
  end if;
  if length(v_addr) < 4 then
    raise exception 'ADDRESS_REQUIRED';
  end if;

  -- Validation catégorie (lève si invalide)
  begin
    v_cat := p_category::venue_category;
  exception when others then
    raise exception 'INVALID_CATEGORY';
  end;

  v_bt := public.get_venue_business_type(v_cat);

  -- Anti-doublon trivial : même owner + même nom + même adresse actif déjà ?
  select id into v_existing
    from public.venues
   where owner_id = v_uid
     and lower(name) = lower(v_name)
     and lower(address) = lower(v_addr)
     and status <> 'closed'
   limit 1;
  if v_existing is not null then
    return jsonb_build_object('ok', false, 'reason', 'ALREADY_EXISTS', 'venue_id', v_existing);
  end if;

  -- Slug unique. Base = slugify(name). Suffixe -2, -3... si conflit.
  v_slug := nullif(public.slugify_text(v_name), '');
  if v_slug is null then v_slug := 'lieu'; end if;
  v_slug_try := v_slug;
  while exists (select 1 from public.venues where slug = v_slug_try) loop
    v_n := v_n + 1;
    v_slug_try := v_slug || '-' || (v_n + 1)::text;
    exit when v_n > 50; -- safety
  end loop;
  v_slug := v_slug_try;

  -- Defaults selon businessType
  v_desc := nullif(trim(coalesce(p_description, '')), '');
  if v_desc is null then
    v_desc := format('Découvrez %s à %s.', v_name, v_city);
  end if;
  v_hours := public.default_opening_hours(v_bt);
  v_cover := public.default_cover_url(v_bt);

  -- Création atomique en status='active'
  insert into public.venues (
    owner_id, name, slug, category, description,
    address, city, district,
    location,
    phone, whatsapp, email,
    cover_url, opening_hours,
    status
  )
  values (
    v_uid, v_name, v_slug, v_cat, v_desc,
    v_addr, v_city,
    nullif(trim(coalesce(p_district, '')), ''),
    case
      when p_lat is not null and p_lng is not null
        then st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
      else null
    end,
    nullif(trim(coalesce(p_phone, '')), ''),
    nullif(trim(coalesce(p_whatsapp, '')), ''),
    null,
    v_cover, v_hours,
    'active'
  )
  returning id into v_new_id;

  return jsonb_build_object(
    'ok', true,
    'venue_id', v_new_id,
    'slug', v_slug,
    'business_type', v_bt::text,
    'status', 'active'
  );
end;
$$;

revoke execute on function public.pro_create_venue(text, text, text, text, text, text, text, text, double precision, double precision) from public;
grant  execute on function public.pro_create_venue(text, text, text, text, text, text, text, text, double precision, double precision) to authenticated;

comment on function public.pro_create_venue is
  'Activation immédiate : un Pro crée son établissement en status=''active''. Defaults intelligents (horaires + cover) selon businessType. Slug unique. Anti-doublon par (owner, name, address).';
