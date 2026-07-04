-- ============================================================================
-- SOUTRA-PAIYA — Migration 0073 : fix get_my_loyalty_stats (next_level à zéro)
-- ============================================================================
-- Bug découvert en test manuel réel (compte "Gisèle", 0 point) : la branche
-- "compte fidélité pas encore créé" de get_my_loyalty_stats (migration 0068)
-- renvoyait next_level=null en dur, donc l'UI affichait "Niveau maximum
-- atteint 🎉" pour un utilisateur au niveau Bronze le plus bas — alors que
-- c'est le cas de TOUT nouvel utilisateur avant son premier paiement.
-- ============================================================================

create or replace function public.get_my_loyalty_stats(p_window_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid           uuid := auth.uid();
  v_window        integer := greatest(1, least(coalesce(p_window_days, 30), 365));
  v_since         timestamptz := now() - (v_window || ' days')::interval;
  v_account       record;
  v_level         record;
  v_next          record;
  v_period_points bigint;
  v_period_count  integer;
  v_rank          bigint;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'NOT_AUTHENTICATED');
  end if;

  select * into v_account from public.loyalty_accounts where user_id = v_uid;

  if not found then
    select code, label, min_points, color, emoji into v_level
      from public.loyalty_levels order by min_points asc limit 1;

    -- Fix : calculer le vrai prochain niveau (0 point n'est presque jamais
    -- le niveau max) au lieu de renvoyer next_level=null en dur.
    select code, label, min_points into v_next
      from public.loyalty_levels
     where min_points > 0
     order by min_points asc limit 1;

    return jsonb_build_object(
      'ok', true,
      'window_days', v_window,
      'points_balance', 0,
      'points_lifetime', 0,
      'level', jsonb_build_object(
        'code', v_level.code, 'label', v_level.label,
        'min_points', v_level.min_points, 'color', v_level.color, 'emoji', v_level.emoji
      ),
      'next_level', case when v_next.code is null then null else jsonb_build_object(
        'code', v_next.code, 'label', v_next.label, 'min_points', v_next.min_points,
        'points_remaining', v_next.min_points
      ) end,
      'period_points', 0,
      'period_count', 0,
      'rank', null
    );
  end if;

  select code, label, min_points, color, emoji into v_level
    from public.loyalty_levels where code = v_account.level_code;

  select code, label, min_points into v_next
    from public.loyalty_levels
   where min_points > v_account.points_lifetime
   order by min_points asc limit 1;

  select coalesce(sum(points), 0), count(*) into v_period_points, v_period_count
    from public.loyalty_transactions
   where user_id = v_uid and kind in ('earn', 'bonus') and created_at >= v_since;

  select ranked.rank into v_rank from (
    select user_id, rank() over (order by points_lifetime desc) as rank
      from public.loyalty_accounts
  ) ranked where ranked.user_id = v_uid;

  return jsonb_build_object(
    'ok', true,
    'window_days', v_window,
    'points_balance', v_account.points_balance,
    'points_lifetime', v_account.points_lifetime,
    'level', jsonb_build_object(
      'code', v_level.code, 'label', v_level.label,
      'min_points', v_level.min_points, 'color', v_level.color, 'emoji', v_level.emoji
    ),
    'next_level', case when v_next.code is null then null else jsonb_build_object(
      'code', v_next.code, 'label', v_next.label, 'min_points', v_next.min_points,
      'points_remaining', v_next.min_points - v_account.points_lifetime
    ) end,
    'period_points', v_period_points,
    'period_count', v_period_count,
    'rank', v_rank
  );
end;
$$;

comment on function public.get_my_loyalty_stats is
  'Stats fidélité du user courant : solde, cumul lifetime, niveau + prochain niveau, gains sur la fenêtre, rang. (0073 : corrige next_level toujours null quand aucun point encore gagné.)';
