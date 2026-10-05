import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { supabaseServer } from '@/lib/supabase-server';
import { OrganizerHome } from './OrganizerHome';

export const metadata: Metadata = { title: 'Espace organisateur', robots: { index: false } };
export const dynamic = 'force-dynamic';

const ALLOWED = ['organizer', 'venue_owner', 'guide', 'admin'];

export default async function OrganizerPage() {
  const sb = supabaseServer() as any;
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await sb.from('profiles').select('role, full_name').eq('id', user.id).maybeSingle();

  if (!ALLOWED.includes(profile?.role)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-light px-6 text-dark">
        <div className="max-w-md text-center">
          <h1 className="font-display text-2xl font-bold">Espace organisateur</h1>
          <p className="mt-3 text-neutral-700">
            Cet espace est réservé aux organisateurs de voyages, guides et partenaires.
            Contactez l’équipe Soutra-Playce pour faire activer ce statut sur votre compte.
          </p>
          <Link href="/" className="mt-6 inline-block font-semibold text-primary-700 underline">Retour à l’accueil</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-light px-4 pb-20 pt-6 text-dark sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link href="/" className="text-xs text-neutral-700 hover:text-neutral-900">← Soutra-Playce</Link>
            <h1 className="font-display text-2xl font-bold">Espace organisateur</h1>
            {profile?.full_name && <p className="text-sm text-neutral-700">{profile.full_name}</p>}
          </div>
          <Link href="/scan-voyage" className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-semibold hover:border-primary-500">📷 Scanner un billet</Link>
        </div>
        <OrganizerHome />
      </div>
    </main>
  );
}
