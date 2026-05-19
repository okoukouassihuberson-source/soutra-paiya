-- ============================================================================
-- SOUTRA-PAIYA — Migration 0008 : transfert P2P (bouton « Envoyer »)
-- ============================================================================
-- Fonction de transfert d'argent entre deux wallets, atomique et idempotente
-- au niveau ligne. Une seule transaction est enregistrée (type 'transfer',
-- user_id = expéditeur, counterparty_id = destinataire) : la policy RLS
-- tx_self la rend visible des deux côtés.
-- ============================================================================

create or replace function wallet_transfer(
  p_sender uuid,
  p_recipient uuid,
  p_amount bigint,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender_balance bigint;
  v_recipient_balance bigint;
  v_tx_id uuid;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;
  if p_sender = p_recipient then
    raise exception 'SELF_TRANSFER';
  end if;

  -- Verrouille les deux wallets dans un ordre déterministe (user_id) : évite
  -- les interblocages si deux transferts croisés (A->B et B->A) ont lieu en
  -- même temps.
  perform 1 from wallets
   where user_id in (p_sender, p_recipient)
   order by user_id
   for update;

  select balance_xof into v_sender_balance
    from wallets where user_id = p_sender;
  if v_sender_balance is null then
    raise exception 'SENDER_WALLET_MISSING';
  end if;

  select balance_xof into v_recipient_balance
    from wallets where user_id = p_recipient;
  if v_recipient_balance is null then
    raise exception 'RECIPIENT_WALLET_MISSING';
  end if;

  if v_sender_balance < p_amount then
    raise exception 'INSUFFICIENT_FUNDS';
  end if;

  update wallets set balance_xof = balance_xof - p_amount
   where user_id = p_sender;
  update wallets set balance_xof = balance_xof + p_amount
   where user_id = p_recipient;

  insert into transactions (
    user_id, counterparty_id, type, amount_xof, status,
    provider, description, completed_at
  )
  values (
    p_sender, p_recipient, 'transfer', p_amount, 'success',
    'wallet', nullif(trim(coalesce(p_note, '')), ''), now()
  )
  returning id into v_tx_id;

  return jsonb_build_object(
    'transaction_id', v_tx_id,
    'sender_balance', v_sender_balance - p_amount
  );
end;
$$;

-- Réservé au service role (les Edge Functions) — jamais appelable par un
-- client authentifié, qui pourrait sinon se créditer.
revoke execute on function wallet_transfer(uuid, uuid, bigint, text) from public;
grant execute on function wallet_transfer(uuid, uuid, bigint, text) to service_role;
