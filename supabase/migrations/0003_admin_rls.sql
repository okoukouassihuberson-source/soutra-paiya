-- ============================================================================
-- SOUTRA-PAIYA — Migration 0003 : Admin RLS policies
-- ============================================================================
-- Permet aux utilisateurs avec role = 'admin' d'accéder à toutes les données.
-- Utilise une fonction SECURITY DEFINER pour éviter la récursion RLS.
-- ============================================================================

-- Fonction helper : vérifie si l'utilisateur courant est admin
-- SECURITY DEFINER = s'exécute avec les privilèges du créateur (bypasse RLS)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- ═══ PROFILES ═══
-- SELECT déjà public (profiles_select_public). Admin peut UPDATE tout profil.
CREATE POLICY "admin_update_profiles" ON profiles
  FOR UPDATE TO authenticated USING (is_admin());

-- ═══ WALLETS ═══
CREATE POLICY "admin_select_wallets" ON wallets
  FOR SELECT TO authenticated USING (is_admin());

-- ═══ TRANSACTIONS ═══
CREATE POLICY "admin_select_transactions" ON transactions
  FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "admin_update_transactions" ON transactions
  FOR UPDATE TO authenticated USING (is_admin());

-- ═══ VENUES ═══
-- Admin voit TOUS les venues (y compris draft, suspended, closed)
CREATE POLICY "admin_select_all_venues" ON venues
  FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "admin_update_venues" ON venues
  FOR UPDATE TO authenticated USING (is_admin());

-- ═══ RESERVATIONS ═══
CREATE POLICY "admin_select_reservations" ON reservations
  FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "admin_update_reservations" ON reservations
  FOR UPDATE TO authenticated USING (is_admin());

-- ═══ EVENTS ═══
CREATE POLICY "admin_select_events" ON events
  FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "admin_update_events" ON events
  FOR UPDATE TO authenticated USING (is_admin());

-- ═══ TICKETS ═══
CREATE POLICY "admin_select_tickets" ON tickets
  FOR SELECT TO authenticated USING (is_admin());

-- ═══ AUDIT EVENTS ═══
-- Pas de RLS activé sur audit_events, mais on l'active pour être sûr
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_select_audit" ON audit_events
  FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "admin_insert_audit" ON audit_events
  FOR INSERT TO authenticated WITH CHECK (is_admin());

-- ============================================================================
-- POUR ACTIVER UN UTILISATEUR COMME ADMIN :
-- Remplacer le numéro par celui utilisé lors du login OTP.
--
--   UPDATE profiles SET role = 'admin' WHERE phone = '+225XXXXXXXXXX';
--
-- ============================================================================
