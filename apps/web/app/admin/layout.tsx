import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase-server';
import { AdminShell } from './_components/AdminShell';

/**
 * Numéro du modérateur Pro. Hardcodé : il valide les revendications,
 * contributions, KYC Pro et signalements mais n'a PAS les autres prérogatives
 * admin (settings, monetization, marketing, sécurité). Le matching côté serveur
 * accepte le format avec et sans '+', selon ce que Supabase Auth stocke.
 */
const MODERATOR_PHONES = ['+2250102169280', '2250102169280'] as const;

/**
 * Layout segment-level pour /admin/* :
 *   1. garde-fou auth (redirect /login si pas connecté)
 *   2. garde-fou rôle (role='admin' OU phone ∈ MODERATOR_PHONES → accès,
 *      sinon redirect /pro)
 *   3. récupère le profil pour le footer sidebar
 *   4. wrap les enfants dans AdminShell avec l'accessLevel calculé
 *
 * Le shell est un Client Component (`AdminShell`) car AppShell utilise
 * `usePathname` / `useSearchParams`. On lui passe le user résolu + le niveau
 * d'accès pour filtrer les onglets visibles.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await (supabase as any)
    .from('profiles')
    .select('full_name, avatar_url, role, phone')
    .eq('id', user.id)
    .maybeSingle();

  const isAdmin = profile?.role === 'admin';
  const isModerator = MODERATOR_PHONES.includes(profile?.phone);

  if (!isAdmin && !isModerator) redirect('/pro');

  const accessLevel: 'admin' | 'moderator' = isAdmin ? 'admin' : 'moderator';
  const subtitle = isAdmin ? 'Administrateur' : 'Modérateur Pro';
  const fullName = profile?.full_name || (user.phone ? '+' + user.phone : subtitle);
  const avatarUrl = profile?.avatar_url ?? null;

  return (
    <AdminShell
      user={{ name: fullName, subtitle, avatarUrl }}
      accessLevel={accessLevel}
    >
      {children}
    </AdminShell>
  );
}
