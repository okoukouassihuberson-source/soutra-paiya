-- ============================================================================
-- SOUTRA-PAIYA — Migration 0063 : moyens de paiement acceptés par établissement
-- ============================================================================
-- Spec PO : un établissement Pro peut activer/désactiver/réorganiser les
-- moyens de paiement qu'il accepte. Le client voit ces méthodes sur la
-- fiche venue mobile pour décider avant de réserver.
--
-- Liste des méthodes supportées (alignée avec PaymentLogo.tsx côté web) :
--   - visa, mastercard          (cartes internationales via Paystack)
--   - orange-money, mtn-money,
--     moov-money, wave          (mobile money via Paystack channels)
--   - paiya-pay                 (wallet interne Soutra-Paiya)
--
-- Non-cassant : nouvelle colonne avec default basé sur le businessType
-- (mig 0057). Un venue créé avant cette migration recevra la liste par
-- défaut à la première update (ou au prochain INSERT via pro_create_venue).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Colonne venues.payment_methods text[]
--    Stocke les slugs des méthodes activées, dans l'ordre choisi par le Pro.
-- ----------------------------------------------------------------------------

alter table public.venues
  add column if not exists payment_methods text[] not null default array[
    'paiya-pay',
    'orange-money',
    'mtn-money',
    'moov-money',
    'wave',
    'visa',
    'mastercard'
  ]::text[];

-- ----------------------------------------------------------------------------
-- 2) Helper : liste canonique des slugs valides
--    Doit rester strictement aligné avec PaymentMethodName du composant
--    apps/web/components/marketing/PaymentLogo.tsx.
-- ----------------------------------------------------------------------------

create or replace function public.payment_method_slugs()
returns text[]
language sql
immutable
as $$
  select array[
    'visa', 'mastercard',
    'orange-money', 'mtn-money', 'moov-money', 'wave',
    'paiya-pay'
  ]::text[];
$$;

grant execute on function public.payment_method_slugs() to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3) RPC update_venue_payment_methods : Pro met à jour la liste de son venue
--    Valide les slugs, dédoublonne, préserve l'ordre fourni.
-- ----------------------------------------------------------------------------

create or replace function public.update_venue_payment_methods(
  p_venue_id uuid,
  p_methods  text[]
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_known  text[] := public.payment_method_slugs();
  v_owner  uuid;
  v_clean  text[];
  v_method text;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select owner_id into v_owner
    from public.venues
   where id = p_venue_id
   limit 1;
  if v_owner is null then raise exception 'VENUE_NOT_FOUND'; end if;
  if v_owner <> v_uid and not public.is_admin() then
    raise exception 'NOT_AUTHORIZED';
  end if;

  -- Nettoyage : trim + lowercase + filter valides + dédoublonnage en
  -- préservant l'ordre d'apparition.
  v_clean := array[]::text[];
  foreach v_method in array coalesce(p_methods, '{}'::text[]) loop
    v_method := lower(trim(v_method));
    if v_method = any(v_known) and not (v_method = any(v_clean)) then
      v_clean := array_append(v_clean, v_method);
    end if;
  end loop;

  if array_length(v_clean, 1) is null then
    raise exception 'AT_LEAST_ONE_METHOD_REQUIRED';
  end if;

  update public.venues
     set payment_methods = v_clean,
         updated_at = now()
   where id = p_venue_id;

  return jsonb_build_object('ok', true, 'methods', v_clean);
end;
$$;

revoke execute on function public.update_venue_payment_methods(uuid, text[]) from public;
grant  execute on function public.update_venue_payment_methods(uuid, text[]) to authenticated;

-- ----------------------------------------------------------------------------
-- 4) Étend pro_create_venue (migration 0061) avec defaults métier :
--    - Hôtels / restaurants → cartes + mobile money + paiya-pay
--    - Boutiques / pharmacies → mobile money + cartes + paiya-pay
--    - Services pro / VTC / fiche info → mobile money + paiya-pay
--    Defaults sont en miroir du default de la colonne, suffisants partout.
-- ----------------------------------------------------------------------------

create or replace function public.default_payment_methods(p_business_type venue_business_type)
returns text[]
language sql
immutable
set search_path = public
as $$
  select case p_business_type
    -- Restauration + nightlife : tout est utile (cartes étrangères pour
    -- les voyageurs, mobile money local, wallet)
    when 'reservation_table' then array[
      'paiya-pay','orange-money','mtn-money','moov-money','wave','visa','mastercard'
    ]
    -- Hôtels : priorité cartes (clients internationaux) + mobile money
    when 'hotel_rooms' then array[
      'visa','mastercard','paiya-pay','orange-money','mtn-money','moov-money','wave'
    ]
    -- Commerce : mobile money en tête (transactions du quotidien)
    when 'product_catalog' then array[
      'paiya-pay','orange-money','mtn-money','moov-money','wave','visa','mastercard'
    ]
    -- Événementiel : tickets souvent achetés en cash → mobile money + cartes
    when 'event_tickets' then array[
      'paiya-pay','orange-money','mtn-money','moov-money','wave','visa','mastercard'
    ]
    -- Time slot (cinéma, sport...) : pareil que commerce
    when 'time_slot' then array[
      'paiya-pay','orange-money','mtn-money','moov-money','wave','visa','mastercard'
    ]
    -- Services pro : devis donc moyens classiques + wallet
    when 'service_quote' then array[
      'paiya-pay','orange-money','mtn-money','moov-money','wave','visa','mastercard'
    ]
    -- VTC : mobile money dominant
    when 'vtc_ride' then array[
      'paiya-pay','orange-money','mtn-money','moov-money','wave','visa','mastercard'
    ]
    -- Fiche info / visite : minimum vital
    else array[
      'paiya-pay','orange-money','mtn-money','moov-money','wave','visa','mastercard'
    ]
  end;
$$;

grant execute on function public.default_payment_methods(venue_business_type) to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5) Backfill safety : venues existants sans payment_methods (NULL) reçoivent
--    le default (les nouveaux INSERTs sont déjà couverts par le DEFAULT colonne).
--    No-op si la colonne a déjà été remplie.
-- ----------------------------------------------------------------------------

update public.venues
   set payment_methods = public.default_payment_methods(public.get_venue_business_type(category))
 where payment_methods is null
    or array_length(payment_methods, 1) is null;

-- ----------------------------------------------------------------------------
-- 6) Commentaires
-- ----------------------------------------------------------------------------

comment on column public.venues.payment_methods is
  'Méthodes de paiement acceptées par le venue, dans l''ordre de présentation choisi par le Pro. Slugs alignés avec PaymentLogo.tsx (web).';
comment on function public.update_venue_payment_methods is
  'RPC pour le Pro : valide + dédoublonne + préserve l''ordre. Au moins 1 méthode requise.';
comment on function public.default_payment_methods is
  'Defaults métier selon businessType. Hôtels privilégient cartes (clients internationaux), reste = mobile money first.';
