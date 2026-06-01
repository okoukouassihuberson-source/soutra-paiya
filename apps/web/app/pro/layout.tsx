import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase-server';
import { ProShell } from './_components/ProShell';

/**
 * Layout segment-level pour /pro/* :
 *   1. garde-fou auth (redirect /login si pas connecté)
 *   2. récupère le profil pour le footer sidebar
 *   3. wrap les enfants dans AppShell avec les 7 navItems Pro
 *
 * Le shell est un Client Component (`ProShell`) car AppShell utilise
 * `usePathname` / `useSearchParams`. On lui passe juste le user déjà résolu.
 */
export default async function ProLayout({ children }: { children: React.ReactNode }) {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await (supabase as any)
    .from('profiles')
    .select('full_name, avatar_url')
    .eq('id', user.id)
    .maybeSingle();

  const fullName = profile?.full_name || (user.phone ? '+' + user.phone : 'Mon compte');
  const avatarUrl = profile?.avatar_url ?? null;

  return (
    <ProShell user={{ name: fullName, subtitle: 'Propriétaire', avatarUrl }}>
      {children}
    </ProShell>
  );
}
