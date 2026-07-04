-- ============================================================================
-- SOUTRA-PAIYA — Migration 0072 : admin Wallets
-- ============================================================================
-- Phase 3 du master prompt "Soutra-Pay V2" (extension back-office admin) :
--   1. Enum tx_type + 'adjustment' pour tracer les corrections manuelles admin.
--   2. RPC admin_search_wallets / admin_adjust_wallet — vue + correction
--      manuelle de solde, systématiquement auditée (audit_events).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Nouvelle valeur d'enum — doit être la 1re instruction du fichier.
-- ----------------------------------------------------------------------------

alter type tx_type add value if not exists 'adjustment';

-- ----------------------------------------------------------------------------
-- 2) RPC : recherche de wallets (nom/téléphone) pour l'onglet admin Wallets
-- ----------------------------------------------------------------------------

create or replace function public.admin_search_wallets(
  p_search text default null,
  p_limit  integer default 50
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_limit  integer := greatest(1, least(coalesce(p_limit, 50), 200));
begin
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', p.id,
      'full_name', p.full_name,
      'phone', p.phone,
      'kyc_status', p.kyc_status,
      'balance_xof', w.balance_xof,
      'locked_xof', w.locked_xof,
      'daily_limit_xof', w.daily_limit_xof,
      'monthly_limit_xof', w.monthly_limit_xof
    ) order by w.balance_xof desc)
    from public.wallets w
    join public.profiles p on p.id = w.user_id
    where v_search is null
       or p.full_name ilike '%' || v_search || '%'
       or p.phone ilike '%' || v_search || '%'
    limit v_limit
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.admin_search_wallets(text, integer) from public;
grant execute on function public.admin_search_wallets(text, integer) to authenticated;

-- ----------------------------------------------------------------------------
-- 3) RPC : ajustement manuel de solde — toujours audité, jamais silencieux.
--    Refuse de faire passer un solde sous zéro (même contrainte que tous les
--    autres débits du wallet) : une correction qui rendrait le solde négatif
--    doit être requalifiée (ex: créance), pas forcée ici.
-- ----------------------------------------------------------------------------

create or replace function public.admin_adjust_wallet(
  p_user_id    uuid,
  p_amount_xof bigint,
  p_reason     text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_balance  bigint;
  v_tx_id    uuid;
begin
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_amount_xof is null or p_amount_xof = 0 then
    raise exception 'INVALID_AMOUNT';
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'REASON_REQUIRED';
  end if;

  select balance_xof into v_balance
    from public.wallets
   where user_id = p_user_id
   for update;
  if v_balance is null then
    raise exception 'WALLET_NOT_FOUND';
  end if;
  if v_balance + p_amount_xof < 0 then
    raise exception 'INSUFFICIENT_FUNDS';
  end if;

  update public.wallets
     set balance_xof = balance_xof + p_amount_xof
   where user_id = p_user_id;

  insert into public.transactions (
    user_id, type, amount_xof, status, provider, description, metadata, completed_at
  ) values (
    p_user_id, 'adjustment', abs(p_amount_xof), 'success', 'wallet',
    (case when p_amount_xof > 0 then 'Crédit admin : ' else 'Débit admin : ' end) || trim(p_reason),
    jsonb_build_object('admin_id', v_admin_id, 'signed_amount_xof', p_amount_xof, 'reason', trim(p_reason)),
    now()
  )
  returning id into v_tx_id;

  -- Trace obligatoire — c'est la raison d'être de cette RPC plutôt qu'un
  -- simple UPDATE direct sur wallets.
  insert into public.audit_events (actor_id, action, resource_type, resource_id, metadata)
  values (
    v_admin_id, 'wallet_adjustment', 'wallet', p_user_id,
    jsonb_build_object('amount_xof', p_amount_xof, 'reason', trim(p_reason), 'transaction_id', v_tx_id)
  );

  return jsonb_build_object(
    'ok', true,
    'transaction_id', v_tx_id,
    'new_balance_xof', v_balance + p_amount_xof
  );
end;
$$;

revoke execute on function public.admin_adjust_wallet(uuid, bigint, text) from public;
grant execute on function public.admin_adjust_wallet(uuid, bigint, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 4) Commentaires
-- ----------------------------------------------------------------------------
-- NB : pas de RPC "commissions perçues" ici — en explorant MonetizationTab.tsx
-- pour la construire, il s'est avéré qu'un dashboard complet existe déjà
-- (DashboardSection, RPC revenue_dashboard/revenue_summary de la migration
-- 0041) : KPIs, répartition par kind/catégorie/ville, top 10 établissements.
-- L'audit initial affirmait le contraire à tort — vérifié par lecture directe
-- du composant avant d'écrire du code redondant.

comment on function public.admin_search_wallets is
  'Recherche de wallets par nom/téléphone pour le back-office admin. Réservée is_admin().';
comment on function public.admin_adjust_wallet is
  'Ajustement manuel de solde par un admin (crédit ou débit signé), toujours tracé dans audit_events et transactions(type=adjustment). Refuse un solde négatif résultant.';
