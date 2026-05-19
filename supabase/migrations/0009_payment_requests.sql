-- ============================================================================
-- SOUTRA-PAIYA — Migration 0009 : demandes d'argent (bouton « Demander »)
-- ============================================================================
-- Une demande : le « requester » demande un montant au « payer ». Le payer
-- accepte (-> transfert payer->requester) ou refuse. Le requester peut annuler.
-- Migration idempotente : ré-exécutable sans erreur.
-- ============================================================================

create table if not exists payment_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references profiles(id) on delete cascade,
  payer_id uuid not null references profiles(id) on delete cascade,
  amount_xof bigint not null check (amount_xof > 0),
  note text,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  transaction_id uuid references transactions(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (requester_id <> payer_id)
);
create index if not exists idx_payreq_payer
  on payment_requests(payer_id, created_at desc);
create index if not exists idx_payreq_requester
  on payment_requests(requester_id, created_at desc);

alter table payment_requests enable row level security;

-- Les deux parties voient la demande.
drop policy if exists "payreq_select_party" on payment_requests;
create policy "payreq_select_party" on payment_requests for select
  using (auth.uid() = requester_id or auth.uid() = payer_id);

-- Seul le demandeur peut créer une demande, et à son propre nom. Toute autre
-- écriture (accepter / refuser / annuler) passe par le serveur.
drop policy if exists "payreq_insert_requester" on payment_requests;
create policy "payreq_insert_requester" on payment_requests for insert
  with check (auth.uid() = requester_id);

-- ============================================================================
-- Résolution atomique d'une demande. Verrouille la demande (FOR UPDATE) :
-- impossible de l'accepter deux fois. L'acceptation réutilise wallet_transfer
-- (migration 0008) — atomique, lève une exception si solde insuffisant.
-- ============================================================================
create or replace function resolve_payment_request(
  p_request_id uuid,
  p_actor uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req payment_requests;
  v_transfer jsonb;
  v_tx_id uuid;
begin
  select * into v_req from payment_requests
   where id = p_request_id
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_req.status <> 'pending' then
    return jsonb_build_object('ok', false, 'reason', 'not_pending');
  end if;

  if p_action = 'cancel' then
    if p_actor <> v_req.requester_id then
      return jsonb_build_object('ok', false, 'reason', 'forbidden');
    end if;
    update payment_requests set status = 'cancelled', resolved_at = now()
     where id = p_request_id;
    return jsonb_build_object('ok', true, 'status', 'cancelled');

  elsif p_action = 'decline' then
    if p_actor <> v_req.payer_id then
      return jsonb_build_object('ok', false, 'reason', 'forbidden');
    end if;
    update payment_requests set status = 'declined', resolved_at = now()
     where id = p_request_id;
    return jsonb_build_object('ok', true, 'status', 'declined');

  elsif p_action = 'accept' then
    if p_actor <> v_req.payer_id then
      return jsonb_build_object('ok', false, 'reason', 'forbidden');
    end if;
    -- Le payeur règle le demandeur.
    begin
      v_transfer := wallet_transfer(
        v_req.payer_id, v_req.requester_id, v_req.amount_xof, v_req.note
      );
    exception when others then
      return jsonb_build_object('ok', false, 'reason', lower(sqlerrm));
    end;
    v_tx_id := (v_transfer ->> 'transaction_id')::uuid;
    update payment_requests
       set status = 'accepted', transaction_id = v_tx_id, resolved_at = now()
     where id = p_request_id;
    return jsonb_build_object(
      'ok', true, 'status', 'accepted', 'transaction_id', v_tx_id
    );

  else
    return jsonb_build_object('ok', false, 'reason', 'bad_action');
  end if;
end;
$$;

revoke execute on function resolve_payment_request(uuid, uuid, text) from public;
grant execute on function resolve_payment_request(uuid, uuid, text) to service_role;

-- Temps réel : les deux parties sont notifiées des changements de demande.
do $$
begin
  alter publication supabase_realtime add table payment_requests;
exception when others then
  null; -- déjà membre de la publication
end $$;
