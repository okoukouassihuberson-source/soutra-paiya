import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { supabaseServer } from '@/lib/supabase-server';
import { TourismNav } from '@/components/tourism/TourismNav';
import { TripScanner } from './TripScanner';

export const metadata: Metadata = { title: 'Scanner un billet', robots: { index: false } };

export default async function ScanTripPage() {
  const sb = supabaseServer() as any;
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await sb.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (!['organizer', 'venue_owner', 'guide', 'admin'].includes(profile?.role)) redirect('/');
  return (
    <>
      <TourismNav />
      <main className="mx-auto max-w-md px-4 pb-28 pt-8">
        <h1 className="font-display text-2xl font-bold">Scanner un billet</h1>
        <p className="mt-1 text-sm text-neutral-600">Voyages et activités — réservé à l’organisateur concerné (ou à un administrateur).</p>
        <TripScanner />
      </main>
    </>
  );
}
