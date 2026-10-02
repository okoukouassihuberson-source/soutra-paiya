import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { supabaseServer } from '@/lib/supabase-server';
import { TourismNav } from '@/components/tourism/TourismNav';
import { getI18n } from '@/lib/i18n/server';
import { AssistantChat } from './AssistantChat';

export function generateMetadata(): Metadata { return { title: getI18n().t('assistant.metaTitle'), robots: { index: false } }; }
export const dynamic = 'force-dynamic';

export default async function AssistantPage({ searchParams }: { searchParams: { q?: string | string[] } }) {
  const q = (Array.isArray(searchParams.q) ? searchParams.q[0] : searchParams.q) ?? '';
  const { data: { user } } = await supabaseServer().auth.getUser();
  if (!user) redirect('/login');
  return (
    <>
      <TourismNav />
      <main className="mx-auto max-w-2xl px-4 pb-28 pt-8 sm:px-6">
        <AssistantChat initialText={q.slice(0, 500)} />
      </main>
    </>
  );
}
