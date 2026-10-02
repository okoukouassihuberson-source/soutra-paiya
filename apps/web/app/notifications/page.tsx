import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { supabaseServer } from '@/lib/supabase-server';
import { TourismNav } from '@/components/tourism/TourismNav';
import { NotificationList } from './NotificationList';

export const metadata: Metadata = { title: 'Notifications', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const { data: { user } } = await supabaseServer().auth.getUser();
  if (!user) redirect('/login');
  return (
    <>
      <TourismNav />
      <main className="mx-auto max-w-2xl px-4 pb-28 pt-8 sm:px-6">
        <NotificationList />
      </main>
    </>
  );
}
