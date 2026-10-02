-- ============================================================================
-- 0095 — Suppression d'un voyage / d'une activité par l'administration
-- ============================================================================
-- Suppression définitive possible UNIQUEMENT s'il n'existe aucune réservation (quel qu'en
-- soit le statut) : l'historique financier (réservations, paiements, reçus) n'est jamais détruit.
-- Sinon : refus HAS_BOOKINGS, et l'administrateur utilise l'annulation / l'archivage existants.
-- Programme, formules, créneaux et offres ciblées sont supprimés en cascade. Trace d'audit.
-- ============================================================================

create or replace function public.admin_delete_trip(p_trip_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare t public.trips%rowtype;
begin
  if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  select * into t from public.trips where id = p_trip_id for update;
  if not found then raise exception 'TRIP_NOT_FOUND'; end if;
  if exists (select 1 from public.trip_bookings where trip_id = p_trip_id) then raise exception 'HAS_BOOKINGS'; end if;
  delete from public.trips where id = p_trip_id;
  insert into public.audit_events (actor_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'trip_deleted', 'trip', p_trip_id,
          jsonb_build_object('title', t.title, 'slug', t.slug, 'status', t.status, 'organizer_id', t.organizer_id));
  return jsonb_build_object('ok', true);
end; $$;

create or replace function public.admin_delete_activity(p_activity_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare a public.activities%rowtype;
begin
  if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  select * into a from public.activities where id = p_activity_id for update;
  if not found then raise exception 'ACTIVITY_NOT_FOUND'; end if;
  if exists (select 1 from public.activity_bookings where activity_id = p_activity_id) then raise exception 'HAS_BOOKINGS'; end if;
  delete from public.activities where id = p_activity_id;
  insert into public.audit_events (actor_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'activity_deleted', 'activity', p_activity_id,
          jsonb_build_object('title', a.title, 'slug', a.slug, 'status', a.status, 'organizer_id', a.organizer_id));
  return jsonb_build_object('ok', true);
end; $$;

revoke execute on function public.admin_delete_trip(uuid) from public, anon;
revoke execute on function public.admin_delete_activity(uuid) from public, anon;
grant execute on function public.admin_delete_trip(uuid) to authenticated;
grant execute on function public.admin_delete_activity(uuid) to authenticated;
