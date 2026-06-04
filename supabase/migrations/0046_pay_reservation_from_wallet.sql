-- ============================================================================
-- SOUTRA-PAIYA — Migration 0046 : pay_reservation_from_wallet
-- ============================================================================
-- Permet à l'utilisateur de payer l'acompte d'une réservation directement
-- depuis son wallet Soutra-Pay, sans passer par Paystack.
--
-- Cas d'usage principal : Phase 4 du roadmap assistant vocal (Sia). L'utilisateur
-- a créé une résa par la voix (Phase 3) et veut maintenant la régler à la voix
-- aussi — Paystack mobile money obligerait un redirect navigateur cassant
-- l'UX vocale, alors que le wallet est instant.
--
-- Sécurité :
--   • SECURITY DEFINER (bypass RLS pour le debit wallet)
--   • Le PIN bcrypt-hashé est vérifié inline (même logique que
--     verify_payment_pin de la 0011)
--   • Le caller doit être le propriétaire de la résa (auth.uid())
--   • Tout est atomique dans la function : si une étape échoue, rollback total
--   • Verrous FOR UPDATE sur reservations + wallets contre les race conditions
--
-- Non-cassant : aucune table modifiée. Réutilise reservations, wallets,
-- transactions, payment_pins (existants).
-- ============================================================================

create or replace function public.pay_reservation_from_wallet(
  p_reservation_id uuid,
  p_pin            text
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid           uuid := auth.uid();
  v_pin_hash      text;
  v_resa          record;
  v_wallet_balance bigint;
  v_tx_id         uuid;
begin
  -- ── Auth ──
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- ── PIN check (même logique que verify_payment_pin, inlinée) ──
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    raise exception 'INVALID_PIN_FORMAT';
  end if;
  select pin_hash into v_pin_hash from public.payment_pins where user_id = v_uid;
  if v_pin_hash is null then
    raise exception 'PIN_NOT_SET';
  end if;
  if v_pin_hash <> crypt(p_pin, v_pin_hash) then
    raise exception 'PIN_WRONG';
  end if;

  -- ── Lock + valide la résa ──
  select id, user_id, venue_id, deposit_xof, status, escrow_tx_id, date_time, party_size
    into v_resa
    from public.reservations
   where id = p_reservation_id
   for update;

  if not found then
    raise exception 'RESERVATION_NOT_FOUND';
  end if;
  if v_resa.user_id <> v_uid then
    raise exception 'NOT_OWNER';
  end if;
  if v_resa.escrow_tx_id is not null then
    raise exception 'ALREADY_PAID';
  end if;
  if v_resa.status not in ('pending', 'confirmed') then
    raise exception 'INVALID_RESERVATION_STATUS';
  end if;
  if v_resa.deposit_xof is null or v_resa.deposit_xof <= 0 then
    raise exception 'NO_DEPOSIT_REQUIRED';
  end if;

  -- ── Lock + debit atomique du wallet (même pattern que wallet_debit 0007) ──
  update public.wallets
     set balance_xof = balance_xof - v_resa.deposit_xof
   where user_id = v_uid
     and balance_xof >= v_resa.deposit_xof
  returning balance_xof into v_wallet_balance;

  if not found then
    raise exception 'INSUFFICIENT_FUNDS';
  end if;

  -- ── Crée la transaction de paiement ──
  insert into public.transactions (
    user_id, type, amount_xof, status, provider, description,
    reservation_id, completed_at
  )
  values (
    v_uid, 'payment', v_resa.deposit_xof, 'success', 'wallet',
    'Acompte réservation (paiement vocal Sia)',
    v_resa.id, now()
  )
  returning id into v_tx_id;

  -- ── Lie la résa au paiement via escrow_tx_id ──
  update public.reservations
     set escrow_tx_id = v_tx_id
   where id = v_resa.id;

  -- Le trigger tg_transaction_revenue (migration 0042) va automatiquement
  -- déclencher payment_commission dans monetization_revenue_log côté Soutra.

  return jsonb_build_object(
    'ok',                   true,
    'reservation_id',       v_resa.id,
    'transaction_id',       v_tx_id,
    'amount_paid_xof',      v_resa.deposit_xof,
    'new_balance_xof',      v_wallet_balance,
    'reservation_status',   v_resa.status
  );
end;
$$;

revoke execute on function public.pay_reservation_from_wallet(uuid, text) from public;
grant execute on function public.pay_reservation_from_wallet(uuid, text) to authenticated;

comment on function public.pay_reservation_from_wallet is
  'Paie l''acompte d''une réservation depuis le wallet Soutra-Pay. Valide PIN + ownership + solde + statut. Atomique. Utilisée par l''Edge function pay-reservation (paiement vocal Sia, Phase 4).';
