'use client';

import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase';

export function ReportButton({ reviewId }: { reviewId: string }) {
  const [state, setState] = useState<'idle' | 'done' | 'login'>('idle');
  async function report() {
    const sb = supabaseBrowser() as any;
    const { data: s } = await sb.auth.getSession();
    if (!s.session) { setState('login'); return; }
    const { error } = await sb.rpc('report_activity_review', { p_review_id: reviewId, p_reason: null });
    setState(error ? 'idle' : 'done');
  }
  if (state === 'done') return <span className="text-xs text-neutral-500">Merci, avis signalé.</span>;
  if (state === 'login') return <span className="text-xs text-neutral-500">Connectez-vous pour signaler.</span>;
  return <button onClick={report} className="text-xs text-neutral-500 underline">Signaler</button>;
}
