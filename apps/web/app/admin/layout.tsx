import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase-server';
import { AdminShell } from './_components/AdminShell';

/**
 * Layout segment-level pour /admin/* :
 *   1. garde-fou auth (redirect /login si pas connecté)
 *   2. garde-fou rôle (redirect /pro si pas admin)
 *   3. récupère le profil pour le footer sidebar
 *   4. wrap les enfants dans AdminShell avec les navItems Admin
 *
 * Le shell est un Client Component (`AdminShell`) car AppShell utilise
 * `usePathname` / `useSearchParams`. On lui passe juste le user résolu.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await (supabase as any)
    .from('profiles')
    .select('full_name, avatar_url, role')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.role !== 'admin') redirect('/pro');

  const fullName = profile?.full_name || (user.phone ? '+' + user.phone : 'Admin');
  const avatarUrl = profile?.avatar_url ?? null;

  return (
    <AdminShell user={{ name: fullName, subtitle: 'Administrateur', avatarUrl }}>
      {children}
    </AdminShell>
  );
}
