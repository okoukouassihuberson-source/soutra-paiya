import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { supabaseServer } from '@/lib/supabase-server';
import { TourismNav } from '@/components/tourism/TourismNav';
import { PreferencesForm } from './PreferencesForm';

export const metadata: Metadata = { title: 'Préférences de notification', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function PreferencesPage() {
  const { data: { user } } = await supabaseServer().auth.getUser();
  if (!user) redirect('/login');
  return (
    <>
      <TourismNav />
      <main className="mx-auto max-w-3xl px-4 pb-28 pt-8 sm:px-6">
        <Link href="/notifications" className="text-sm font-medium text-primary-600">← Notifications</Link>
        <h1 className="mt-2 font-display text-3xl font-bold">Préférences</h1>
        <p className="mt-1 text-sm text-neutral-600">Choisissez comment être prévenu pour chaque type d’événement.</p>
        <PreferencesForm vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''} />
      </main>
    </>
  );
}
