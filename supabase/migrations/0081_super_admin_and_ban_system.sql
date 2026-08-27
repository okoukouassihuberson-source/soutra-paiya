-- ============================================================================
-- SOUTRA-PAIYA — Migration 0081 : SUPER_ADMIN & Système de Bannissement
-- ============================================================================
-- Ajoute le SUPER_ADMIN automatique pour +2250501871198.
-- Ajoute le système de bannissement/suspension des comptes utilisateurs
-- (profiles) — distinct de la suspension d'établissement (venues.status,
-- migration 0062) : ici on bloque un COMPTE, quel que soit son rôle.
-- Protège le SUPER_ADMIN contre suppression, bannissement, rétrogradation.
-- ============================================================================

-- ═══ AJOUT CHAMPS DANS PROFILES ═══
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ban_reason TEXT,
  ADD COLUMN IF NOT EXISTS suspension_reason TEXT,
  ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ;

-- ═══ TRIGGER : AUTO-ASSIGNER SUPER_ADMIN ═══
-- Le numéro +2250501871198 est automatiquement SUPER_ADMIN.
CREATE OR REPLACE FUNCTION public.tg_auto_assign_super_admin()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.phone = '+2250501871198' THEN
    NEW.is_super_admin := TRUE;
    NEW.role := 'admin';
    NEW.is_banned := FALSE;
    NEW.is_suspended := FALSE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_assign_super_admin ON profiles;
CREATE TRIGGER trigger_auto_assign_super_admin
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_auto_assign_super_admin();

-- ═══ FONCTION : VÉRIFIER SI SUPER_ADMIN ═══
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_super_admin = TRUE
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

-- ═══ FONCTION : VÉRIFIER SI UTILISATEUR EST BANNI/SUSPENDU ═══
CREATE OR REPLACE FUNCTION public.is_user_banned_or_suspended(user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    is_banned = TRUE
    OR (is_suspended = TRUE AND suspended_until > NOW())
  FROM public.profiles
  WHERE id = user_id;
$$;

GRANT EXECUTE ON FUNCTION public.is_user_banned_or_suspended(UUID) TO authenticated;

-- ═══ PROTECTION CONTRE L'AUTO-MODIFICATION DES CHAMPS DE MODÉRATION ═══
-- Faille du même type que celle corrigée en migration 0004 pour `role` :
-- `profiles_update_self` (0001) n'a pas de WITH CHECK, donc sans ce trigger
-- un compte banni pourrait exécuter
--     update profiles set is_banned = false where id = auth.uid()
-- et se débannir lui-même. Un utilisateur normal pourrait aussi s'auto-
-- déclarer is_super_admin. On étend donc la protection à ces colonnes, en
-- réutilisant exactement le pattern de `tg_protect_profile_role`.
CREATE OR REPLACE FUNCTION public.tg_protect_profile_moderation_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    IF NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin
      OR NEW.is_banned IS DISTINCT FROM OLD.is_banned
      OR NEW.is_suspended IS DISTINCT FROM OLD.is_suspended
      OR NEW.ban_reason IS DISTINCT FROM OLD.ban_reason
      OR NEW.suspension_reason IS DISTINCT FROM OLD.suspension_reason
      OR NEW.suspended_until IS DISTINCT FROM OLD.suspended_until
    THEN
      RAISE EXCEPTION 'Modification des champs de modération non autorisée.'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_moderation_fields ON profiles;
CREATE TRIGGER protect_profile_moderation_fields
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_protect_profile_moderation_fields();

-- ═══ MISE À JOUR RLS POLICIES ═══
-- Empêcher la modification du SUPER_ADMIN par les admins normaux (un admin
-- classique ne doit pas pouvoir rétrograder/bannir le SUPER_ADMIN).
DROP POLICY IF EXISTS admin_update_profiles ON profiles;

CREATE POLICY "admin_update_profiles" ON profiles
  FOR UPDATE TO authenticated
  USING (
    is_admin()
    AND profiles.is_super_admin IS NOT TRUE
  );

-- Empêcher la suppression du SUPER_ADMIN par un admin classique.
-- (Comparaison directe sur la colonne de la ligne ciblée — pas besoin de
-- sous-requête, `profiles.is_super_admin` EST déjà cette colonne ici.)
DROP POLICY IF EXISTS protect_super_admin_delete ON profiles;
CREATE POLICY "protect_super_admin_delete" ON profiles
  FOR DELETE TO authenticated
  USING (
    is_admin()
    AND profiles.is_super_admin IS NOT TRUE
  );

-- ═══ ACTIVER SUPER_ADMIN EXISTANT ═══
-- Si le numéro existe déjà, le promouvoir SUPER_ADMIN.
UPDATE profiles
SET
  is_super_admin = TRUE,
  role = 'admin',
  is_banned = FALSE,
  is_suspended = FALSE
WHERE phone = '+2250501871198';

-- ═══ RPCs ADMIN : BAN / SUSPEND ═══
-- Même convention que admin_adjust_wallet (migration 0072) : action
-- sensible passée par une RPC SECURITY DEFINER plutôt qu'un UPDATE direct
-- depuis le client, avec raison obligatoire et trace dans audit_events.

CREATE OR REPLACE FUNCTION public.admin_ban_user(
  p_user_id UUID,
  p_reason  TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_target_super_admin BOOLEAN;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'REASON_REQUIRED';
  END IF;

  SELECT is_super_admin INTO v_target_super_admin FROM public.profiles WHERE id = p_user_id;
  IF v_target_super_admin IS NULL THEN
    RAISE EXCEPTION 'USER_NOT_FOUND';
  END IF;
  IF v_target_super_admin THEN
    RAISE EXCEPTION 'CANNOT_BAN_SUPER_ADMIN';
  END IF;

  UPDATE public.profiles
     SET is_banned = TRUE, is_suspended = FALSE,
         banned_at = now(), ban_reason = trim(p_reason)
   WHERE id = p_user_id;

  INSERT INTO public.audit_events (actor_id, action, resource_type, resource_id, metadata)
  VALUES (v_admin_id, 'user_banned', 'profile', p_user_id, jsonb_build_object('reason', trim(p_reason)));

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_unban_user(
  p_user_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  UPDATE public.profiles
     SET is_banned = FALSE, banned_at = NULL, ban_reason = NULL
   WHERE id = p_user_id;

  INSERT INTO public.audit_events (actor_id, action, resource_type, resource_id, metadata)
  VALUES (v_admin_id, 'user_unbanned', 'profile', p_user_id, '{}'::jsonb);

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_suspend_user(
  p_user_id UUID,
  p_reason  TEXT,
  p_days    INT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_target_super_admin BOOLEAN;
  v_until TIMESTAMPTZ;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'REASON_REQUIRED';
  END IF;
  IF p_days IS NULL OR p_days < 1 OR p_days > 365 THEN
    RAISE EXCEPTION 'INVALID_DURATION';
  END IF;

  SELECT is_super_admin INTO v_target_super_admin FROM public.profiles WHERE id = p_user_id;
  IF v_target_super_admin IS NULL THEN
    RAISE EXCEPTION 'USER_NOT_FOUND';
  END IF;
  IF v_target_super_admin THEN
    RAISE EXCEPTION 'CANNOT_SUSPEND_SUPER_ADMIN';
  END IF;

  v_until := now() + (p_days || ' days')::interval;

  UPDATE public.profiles
     SET is_suspended = TRUE, is_banned = FALSE,
         suspended_at = now(), suspended_until = v_until, suspension_reason = trim(p_reason)
   WHERE id = p_user_id;

  INSERT INTO public.audit_events (actor_id, action, resource_type, resource_id, metadata)
  VALUES (v_admin_id, 'user_suspended', 'profile', p_user_id,
          jsonb_build_object('reason', trim(p_reason), 'days', p_days, 'until', v_until));

  RETURN jsonb_build_object('ok', true, 'suspended_until', v_until);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_unsuspend_user(
  p_user_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  UPDATE public.profiles
     SET is_suspended = FALSE, suspended_at = NULL, suspended_until = NULL, suspension_reason = NULL
   WHERE id = p_user_id;

  INSERT INTO public.audit_events (actor_id, action, resource_type, resource_id, metadata)
  VALUES (v_admin_id, 'user_unsuspended', 'profile', p_user_id, '{}'::jsonb);

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_ban_user(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_unban_user(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_suspend_user(UUID, TEXT, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_unsuspend_user(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_ban_user(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unban_user(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_suspend_user(UUID, TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unsuspend_user(UUID) TO authenticated;

COMMENT ON FUNCTION public.admin_ban_user IS 'Bannit un compte définitivement. Raison obligatoire, tracée dans audit_events. Refuse de bannir le SUPER_ADMIN.';
COMMENT ON FUNCTION public.admin_suspend_user IS 'Suspend un compte pour N jours (1-365). Raison obligatoire, tracée dans audit_events. Refuse de suspendre le SUPER_ADMIN.';

-- ═══ COMMENTAIRES ═══
COMMENT ON COLUMN profiles.is_super_admin IS 'SUPER_ADMIN — automatique pour +2250501871198, protégé contre modification/suppression par un admin classique ou par lui-même.';
COMMENT ON COLUMN profiles.is_banned IS 'Compte utilisateur banni définitivement (tous rôles confondus).';
COMMENT ON COLUMN profiles.is_suspended IS 'Compte utilisateur suspendu temporairement.';
COMMENT ON COLUMN profiles.banned_at IS 'Date de bannissement.';
COMMENT ON COLUMN profiles.suspended_at IS 'Date de suspension.';
COMMENT ON COLUMN profiles.ban_reason IS 'Raison du bannissement.';
COMMENT ON COLUMN profiles.suspension_reason IS 'Raison de la suspension.';
COMMENT ON COLUMN profiles.suspended_until IS 'Date de fin de suspension.';
