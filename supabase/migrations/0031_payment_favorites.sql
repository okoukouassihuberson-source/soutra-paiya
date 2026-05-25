-- ============================================================================
-- SOUTRA-PAIYA — Migration 0031 : Favoris de paiement (bénéficiaires)
-- ============================================================================
-- Permet à un utilisateur d'enregistrer ses bénéficiaires de transfert
-- récurrents et de les retrouver en un tap depuis l'écran « Envoyer ».
--
--   • La clé composite (user_id, favorite_user_id) empêche les doublons
--   • `label` est un alias optionnel pour personnaliser l'affichage
--     (ex. « Maman », « Pizza Bro », « Loyer »)
--   • `position` permet de réordonner manuellement (NULLS LAST → tri stable
--     par created_at en repli)
--   • Self-favorite interdit par CHECK
--
-- RLS : full self (lecture/écriture/suppression réservées au propriétaire
-- de la ligne). La RPC `add_payment_favorite` est fournie pour pouvoir
-- ajouter par numéro de téléphone sans révéler d'autres uuid au client.
-- ============================================================================

create table if not exists payment_favorites (
  user_id uuid not null references profiles(id) on delete cascade,
  favorite_user_id uuid not null references profiles(id) on delete cascade,
  label text,
  position integer,
  created_at timestamptz not null default now(),
  primary key (user_id, favorite_user_id),
  check (user_id <> favorite_user_id),
  check (label is null or length(trim(label)) between 1 and 60)
);

create index if not exists idx_payment_favorites_user
  on payment_favorites(user_id, position nulls last, created_at);

alter table payment_favorites enable row level security;

drop policy if exists payment_favorites_self on payment_favorites;
create policy payment_favorites_self on payment_favorites
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- RPC : ajouter par numéro de téléphone (résout favorite_user_id côté serveur)
-- ----------------------------------------------------------------------------
-- Retourne la ligne créée ou existante (idempotent : si déjà favori, met juste
-- à jour le label si fourni). Évite au client de devoir interroger profiles
-- séparément avant l'insert.
-- ----------------------------------------------------------------------------
create or replace function add_payment_favorite(p_phone text, p_label text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_target uuid;
  v_label text;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if p_phone is null or length(trim(p_phone)) < 4 then
    raise exception 'INVALID_PHONE';
  end if;

  -- Tolère le numéro avec ou sans préfixe « + » (Supabase Auth stocke parfois sans).
  select id into v_target
    from profiles
   where phone = p_phone
      or phone = regexp_replace(p_phone, '^\+', '')
   limit 1;

  if v_target is null then
    raise exception 'RECIPIENT_NOT_FOUND';
  end if;
  if v_target = v_uid then
    raise exception 'SELF_FAVORITE';
  end if;

  v_label := nullif(trim(coalesce(p_label, '')), '');
  if v_label is not null and length(v_label) > 60 then
    v_label := substr(v_label, 1, 60);
  end if;

  insert into payment_favorites (user_id, favorite_user_id, label)
  values (v_uid, v_target, v_label)
  on conflict (user_id, favorite_user_id)
    do update set label = coalesce(excluded.label, payment_favorites.label);

  return jsonb_build_object(
    'favorite_user_id', v_target,
    'label', coalesce(v_label, '')
  );
end;
$$;

revoke execute on function add_payment_favorite(text, text) from public;
grant execute on function add_payment_favorite(text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- RPC : renommer / supprimer (le client peut aussi le faire en direct via RLS,
-- mais l'API explicite simplifie l'écriture côté front et garde la validation
-- centralisée).
-- ----------------------------------------------------------------------------
create or replace function rename_payment_favorite(p_favorite_user_id uuid, p_label text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label text;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  v_label := nullif(trim(coalesce(p_label, '')), '');
  if v_label is not null and length(v_label) > 60 then
    v_label := substr(v_label, 1, 60);
  end if;
  update payment_favorites
     set label = v_label
   where user_id = auth.uid()
     and favorite_user_id = p_favorite_user_id;
end;
$$;

revoke execute on function rename_payment_favorite(uuid, text) from public;
grant execute on function rename_payment_favorite(uuid, text) to authenticated;

comment on table payment_favorites is
  'Bénéficiaires favoris pour les transferts P2P. Clé (user_id, favorite_user_id) — RLS strictement self.';
