-- ============================================================================
-- SOUTRA-PAIYA — Migration 0036 : scores de confiance / qualité / activité /
--                                  popularité des venues.
-- ============================================================================
-- Quatre scores 0-100 stockés directement sur `venues` (pour le tri rapide
-- sans jointure) et recalculables à la demande via 2 RPCs :
--
--   recompute_venue_scores(venue_id)   -> un seul venue
--   recompute_all_venue_scores()        -> tous les actifs (admin only)
--
-- Données sources (toutes déjà en place) :
--   • rating_avg / rating_count   (table venues, migration 0001)
--   • venue_reports.status        (migration 0034)
--   • venue_events_log.kind/date  (migration 0035)
--   • completion des champs       (description, logo, cover, gallery, etc.)
--
-- Pas d'index sur les scores pour l'instant : ajout possible plus tard
-- (`btree (popularity_score desc) where status='active'`) si /explore
-- veut trier par popularité scale.
--
-- Non-cassant : aucune table existante n'est modifiée structurellement
-- (uniquement des ADD COLUMN IF NOT EXISTS sur `venues`).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Colonnes sur `venues`
-- ----------------------------------------------------------------------------

alter table public.venues
  add column if not exists trust_score      smallint not null default 50
    check (trust_score between 0 and 100);

alter table public.venues
  add column if not exists quality_score    smallint not null default 50
    check (quality_score between 0 and 100);

alter table public.venues
  add column if not exists activity_score   smallint not null default 0
    check (activity_score between 0 and 100);

alter table public.venues
  add column if not exists popularity_score smallint not null default 0
    check (popularity_score between 0 and 100);

alter table public.venues
  add column if not exists scores_updated_at timestamptz;

-- Index partiel utile pour les listes "top venues" sans aggrégat coûteux.
create index if not exists idx_venues_popularity_active
  on public.venues(popularity_score desc)
  where status = 'active';

-- ----------------------------------------------------------------------------
-- 2) Helpers internes (calcul des composants des scores)
--    Toutes immutables/stable selon dépendances pour permettre l'inlining.
-- ----------------------------------------------------------------------------

-- Clamp générique 0-100 (utilisé partout).
create or replace function public.clamp_score(p_value numeric)
returns smallint
language sql immutable
as $$
  select greatest(0, least(100, coalesce(p_value, 0)))::smallint;
$$;

-- Bonus de completion d'une fiche (0-100). 10 critères pondérés égaux.
create or replace function public.venue_completion_score(p_venue_id uuid)
returns smallint
language plpgsql
stable
set search_path = public
as $$
declare
  v_row public.venues;
  v_pts integer := 0;
begin
  select * into v_row from public.venues where id = p_venue_id;
  if not found then return 0; end if;

  if v_row.logo_url is not null and length(v_row.logo_url) > 0     then v_pts := v_pts + 10; end if;
  if v_row.cover_url is not null and length(v_row.cover_url) > 0   then v_pts := v_pts + 10; end if;
  if v_row.gallery_urls is not null and array_length(v_row.gallery_urls, 1) >= 3 then v_pts := v_pts + 10; end if;
  if v_row.description is not null and length(v_row.description) >= 50 then v_pts := v_pts + 10; end if;
  if v_row.phone is not null and length(v_row.phone) >= 8           then v_pts := v_pts + 10; end if;
  if v_row.whatsapp is not null and length(v_row.whatsapp) >= 8     then v_pts := v_pts + 10; end if;
  if v_row.website is not null and length(v_row.website) >= 5       then v_pts := v_pts + 10; end if;
  if v_row.opening_hours is not null and jsonb_typeof(v_row.opening_hours) = 'object'
     and (select count(*) from jsonb_object_keys(v_row.opening_hours)) >= 5 then v_pts := v_pts + 10; end if;
  if v_row.amenities is not null and array_length(v_row.amenities, 1) >= 3 then v_pts := v_pts + 10; end if;
  if v_row.location is not null                                     then v_pts := v_pts + 10; end if;

  return v_pts; -- déjà compris entre 0 et 100
end;
$$;

-- ----------------------------------------------------------------------------
-- 3) RPC : recompute_venue_scores(venue_id)
--    Calcule et persiste les 4 scores.
--
--    Définitions :
--    - quality   = 0.5 * (rating_avg * 20) * log_weight(rating_count)
--                 + 0.5 * completion
--      où log_weight = min(1, log10(rating_count + 1) / log10(50))
--      -> 0 review = poids 0  •  10 reviews = ~0.6  •  50+ reviews = 1
--    - trust     = 100
--                  - 30 * #reports actifs 'closed' (cap à 3)
--                  - 20 * #reports actifs 'duplicate' (cap à 3)
--                  - 20 * #reports actifs 'inappropriate' (cap à 3)
--                  - 10 * #reports actifs autres (cap à 5)
--                  + 5 si age > 90 jours
--                  - 5 si rating_count = 0
--    - activity  = 25 * log10(1 + score_brut) clampé 0-100
--      où score_brut = vues * 1 + clicks * 3 + reservations_complete * 10
--      sur les 30 derniers jours
--    - popularity = round(0.5 * activity + 0.3 * quality + 0.2 * trust)
-- ----------------------------------------------------------------------------

create or replace function public.recompute_venue_scores(p_venue_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venue       public.venues;
  v_completion  smallint;
  v_rcount      integer;
  v_ravg        numeric;
  v_quality     smallint;
  -- reports actifs (open/reviewing) par kind, capés
  v_r_closed    integer;
  v_r_dup       integer;
  v_r_inap      integer;
  v_r_other     integer;
  v_trust       smallint;
  v_age_days    integer;
  -- événements 30j
  v_views       integer;
  v_clicks      integer;
  v_resa        integer;
  v_act_raw     numeric;
  v_activity    smallint;
  v_popularity  smallint;
  v_log_weight  numeric;
begin
  select * into v_venue from public.venues where id = p_venue_id;
  if not found then
    raise exception 'VENUE_NOT_FOUND';
  end if;

  v_completion := public.venue_completion_score(p_venue_id);
  v_rcount := coalesce(v_venue.rating_count, 0);
  v_ravg   := coalesce(v_venue.rating_avg, 0);

  -- log_weight : 0 à 1 (50+ reviews considère le rating comme robuste)
  v_log_weight := least(1, ln(v_rcount + 1) / ln(50));

  v_quality := public.clamp_score(
    0.5 * (v_ravg * 20.0 * v_log_weight) + 0.5 * v_completion
  );

  -- ---- trust ----
  select least(coalesce(count(*) filter (where kind = 'closed'), 0), 3),
         least(coalesce(count(*) filter (where kind = 'duplicate'), 0), 3),
         least(coalesce(count(*) filter (where kind = 'inappropriate'), 0), 3),
         least(coalesce(count(*) filter (where kind in ('moved','wrong_info','wrong_price','other')), 0), 5)
    into v_r_closed, v_r_dup, v_r_inap, v_r_other
    from public.venue_reports
   where venue_id = p_venue_id
     and status in ('open', 'reviewing');

  v_age_days := greatest(0, extract(epoch from (now() - v_venue.created_at)) / 86400)::integer;

  v_trust := public.clamp_score(
    100
    - (v_r_closed * 30)
    - (v_r_dup * 20)
    - (v_r_inap * 20)
    - (v_r_other * 10)
    + (case when v_age_days > 90 then 5 else 0 end)
    - (case when v_rcount = 0 then 5 else 0 end)
  );

  -- ---- activity (30j) ----
  select
    coalesce(count(*) filter (where kind = 'view'), 0),
    coalesce(count(*) filter (where kind in (
      'click_call','click_whatsapp','click_directions','click_website','click_share','menu_view','gallery_open'
    )), 0),
    coalesce(count(*) filter (where kind = 'reservation_complete'), 0)
    into v_views, v_clicks, v_resa
    from public.venue_events_log
   where venue_id = p_venue_id
     and created_at >= now() - interval '30 days';

  v_act_raw := v_views * 1.0 + v_clicks * 3.0 + v_resa * 10.0;
  -- log10(1 + raw) borné par log10(10001)=4 -> score brut * 25 atteint 100
  -- à ~10 000 (vues équivalent).
  v_activity := public.clamp_score(25.0 * (ln(1 + v_act_raw) / ln(10)));

  -- ---- popularity ----
  v_popularity := public.clamp_score(
    round(0.5 * v_activity + 0.3 * v_quality + 0.2 * v_trust)
  );

  update public.venues
     set quality_score    = v_quality,
         trust_score      = v_trust,
         activity_score   = v_activity,
         popularity_score = v_popularity,
         scores_updated_at = now()
   where id = p_venue_id;

  return jsonb_build_object(
    'venue_id',         p_venue_id,
    'quality_score',    v_quality,
    'trust_score',      v_trust,
    'activity_score',   v_activity,
    'popularity_score', v_popularity,
    'updated_at',       now()
  );
end;
$$;

revoke execute on function public.recompute_venue_scores(uuid) from public;
grant  execute on function public.recompute_venue_scores(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 4) RPC : recompute_all_venue_scores()
--    Boucle sur tous les venues `active`. Réservé admin.
--    Retourne le nombre de venues mis à jour.
-- ----------------------------------------------------------------------------

create or replace function public.recompute_all_venue_scores()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_count integer := 0;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  for v_row in
    select id from public.venues where status = 'active'
  loop
    perform public.recompute_venue_scores(v_row.id);
    v_count := v_count + 1;
  end loop;
  return jsonb_build_object(
    'updated', v_count,
    'finished_at', now()
  );
end;
$$;

revoke execute on function public.recompute_all_venue_scores() from public;
grant  execute on function public.recompute_all_venue_scores() to authenticated;

-- ----------------------------------------------------------------------------
-- 5) Trigger automatique : recompute à chaque transition de venue_reports.
--    Fire-and-forget : le commit du report ne dépend pas du succès du
--    recompute. Le calcul est rapide (< 50 ms pour un venue moyen).
-- ----------------------------------------------------------------------------

create or replace function public.tg_venue_reports_recompute()
returns trigger
language plpgsql
as $$
begin
  -- On déclenche sur INSERT (nouveau signalement) ET UPDATE de status
  -- (résolution / rejet -> change le compteur des actifs).
  begin
    perform public.recompute_venue_scores(coalesce(new.venue_id, old.venue_id));
  exception when others then
    null; -- best-effort, on ne casse pas le report
  end;
  return new;
end;
$$;

drop trigger if exists trg_venue_reports_recompute_ins on public.venue_reports;
create trigger trg_venue_reports_recompute_ins
  after insert on public.venue_reports
  for each row execute function public.tg_venue_reports_recompute();

drop trigger if exists trg_venue_reports_recompute_upd on public.venue_reports;
create trigger trg_venue_reports_recompute_upd
  after update of status on public.venue_reports
  for each row execute function public.tg_venue_reports_recompute();

-- ----------------------------------------------------------------------------
-- 6) Mise à jour de la vue `venues_public` (migration 0020) pour exposer
--    popularity_score. Permet aux clients mobile/web de trier par popularité
--    sans seconde requête.
--    On garde la même signature/ordre que 0020 et on ajoute les 4 scores.
-- ----------------------------------------------------------------------------

create or replace view public.venues_public as
  select
    v.id,
    v.owner_id,
    v.name,
    v.slug,
    v.category,
    v.description,
    v.cover_url,
    v.logo_url,
    v.gallery_urls,
    v.address,
    v.city,
    v.district,
    v.phone,
    v.whatsapp,
    v.email,
    v.opening_hours,
    v.avg_price_xof,
    v.amenities,
    v.ambiance,
    v.socials,
    v.rating_avg,
    v.rating_count,
    v.status,
    v.created_at,
    st_x(v.location::geometry) as lng,
    st_y(v.location::geometry) as lat,
    -- Migration 0036 — scores exposés pour le tri par popularité.
    v.trust_score,
    v.quality_score,
    v.activity_score,
    v.popularity_score
  from public.venues v
  where v.status = 'active';

grant select on public.venues_public to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 7) Commentaires
-- ----------------------------------------------------------------------------

comment on column public.venues.trust_score is
  'Score de confiance 0-100. Pénalisé par les venue_reports actifs, bonifié par ancienneté.';
comment on column public.venues.quality_score is
  'Score de qualité 0-100. Combine rating ponderé par log(rating_count) et complétude de fiche.';
comment on column public.venues.activity_score is
  'Score d''activité 0-100. Basé sur vues+clics+réservations des 30 derniers jours (log10).';
comment on column public.venues.popularity_score is
  'Score de popularité 0-100. Moyenne pondérée 0.5×activity + 0.3×quality + 0.2×trust.';
comment on function public.recompute_venue_scores is
  'Recalcule les 4 scores d''un venue. Appelée à la demande ou via trigger sur venue_reports.';
comment on function public.recompute_all_venue_scores is
  'Refresh batch admin de tous les venues actifs. Retourne le compteur.';
