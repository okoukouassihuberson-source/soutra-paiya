-- ============================================================================
-- SOUTRA-PAIYA — Migration 0007 : intégration des paiements Paystack
-- ============================================================================
-- - Ajoute « paystack » comme fournisseur de paiement.
-- - Fonctions de règlement atomiques et idempotentes (crédit / débit wallet).
-- - Durcit la RLS de la table wallets : le client ne peut plus modifier son
--   solde — tout crédit/débit passe par le serveur (service role).
-- ============================================================================

-- 1. Nouveau fournisseur de paiement.
--    ⚠️ Doit rester la 1re instruction du fichier : une valeur d'enum
--    nouvellement ajoutée ne peut pas être utilisée dans la même transaction
--    que son ajout. Aucune instruction ci-dessous ne référence « paystack ».
alter type payment_provider add value if not exists 'paystack';

-- ============================================================================
-- 2. Débit atomique du wallet — appelé à l'initiation d'un retrait.
--    Lève INSUFFICIENT_FUNDS si le solde est insuffisant (aucune ligne mise
--    à jour grâce au prédicat « balance_xof >= p_amount »).
-- ============================================================================
create or replace function wallet_debit(p_user_id uuid, p_amount bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance bigint;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  update wallets
     set balance_xof = balance_xof - p_amount
   where user_id = p_user_id
     and balance_xof >= p_amount
  returning balance_xof into v_balance;

  if not found then
    raise exception 'INSUFFICIENT_FUNDS';
  end if;

  return v_balance;
end;
$$;

-- ============================================================================
-- 3. Règlement idempotent d'un encaissement (recharge ou acompte de
--    réservation). Verrouille la transaction (FOR UPDATE) : webhook et verify
--    peuvent s'exécuter en parallèle sans jamais créditer deux fois.
-- ============================================================================
create or replace function paystack_settle_charge(p_reference text, p_paid_subunit bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx transactions;
begin
  select * into v_tx
    from transactions
   where provider_ref = p_reference
   for update;

  if not found then
    return 'not_found';
  end if;
  if v_tx.status = 'success' then
    return 'already_settled';
  end if;
  if v_tx.status <> 'pending' then
    return 'not_pending';
  end if;
  -- Le montant payé (subunit Paystack) doit couvrir le montant attendu :
  -- en XOF, subunit = FCFA × 100.
  if p_paid_subunit < v_tx.amount_xof * 100 then
    return 'amount_mismatch';
  end if;

  update transactions
     set status = 'success', completed_at = now()
   where id = v_tx.id;

  if v_tx.type = 'topup' then
    update wallets
       set balance_xof = balance_xof + v_tx.amount_xof
     where user_id = v_tx.user_id;
  elsif v_tx.type = 'payment' and v_tx.reservation_id is not null then
    -- L'acompte est encaissé : on lie la transaction d'escrow. Le statut
    -- de la réservation reste « pending » — c'est le restaurant qui la
    -- confirmera depuis son tableau de bord.
    update reservations
       set escrow_tx_id = v_tx.id
     where id = v_tx.reservation_id;
  end if;

  return 'settled';
end;
$$;

-- ============================================================================
-- 4. Règlement idempotent d'un transfert sortant (retrait).
--    En cas d'échec/annulation, le montant débité à l'initiation est rendu.
-- ============================================================================
create or replace function paystack_settle_transfer(p_reference text, p_outcome text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx transactions;
begin
  select * into v_tx
    from transactions
   where provider_ref = p_reference
   for update;

  if not found then
    return 'not_found';
  end if;
  if v_tx.status <> 'pending' then
    return 'already_settled';
  end if;

  if p_outcome = 'success' then
    update transactions
       set status = 'success', completed_at = now()
     where id = v_tx.id;
  else
    update transactions
       set status = 'failed', completed_at = now()
     where id = v_tx.id;
    -- Remboursement du wallet (le retrait avait débité à l'initiation).
    update wallets
       set balance_xof = balance_xof + v_tx.amount_xof
     where user_id = v_tx.user_id;
  end if;

  return 'settled';
end;
$$;

-- ============================================================================
-- 5. Ces fonctions ne doivent être appelables QUE par le service role.
--    Un client authentifié ne doit jamais pouvoir se créditer lui-même.
-- ============================================================================
revoke execute on function wallet_debit(uuid, bigint) from public;
revoke execute on function paystack_settle_charge(text, bigint) from public;
revoke execute on function paystack_settle_transfer(text, text) from public;

grant execute on function wallet_debit(uuid, bigint) to service_role;
grant execute on function paystack_settle_charge(text, bigint) to service_role;
grant execute on function paystack_settle_transfer(text, text) to service_role;

-- ============================================================================
-- 6. Durcissement RLS de la table wallets.
--    L'ancienne policy « wallets_self » (FOR ALL) autorisait un client à
--    modifier son propre solde via un simple UPDATE. On la remplace par un
--    accès SELECT uniquement ; les écritures passent par le service role
--    (Edge Functions) qui contourne la RLS.
-- ============================================================================
drop policy if exists "wallets_self" on wallets;
-- Idempotent : la migration peut être rejouée sans erreur 42710.
drop policy if exists "wallets_select_self" on wallets;

create policy "wallets_select_self" on wallets
  for select using (auth.uid() = user_id);
