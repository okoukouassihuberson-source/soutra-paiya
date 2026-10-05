'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabase';

interface Todo { id: string; label: string; hint: string; tab: string; count: number | null }

/**
 * « À traiter » : ce qui attend une décision de l'équipe, trié par volume. Une seule requête de comptage par
 * file (aucune ligne chargée). Tout à zéro = message rassurant, pas de tableau vide.
 */
export function AdminTodo({ pendingTx = 0 }: { pendingTx?: number }) {
  const [todos, setTodos] = useState<Todo[] | null>(null);

  useEffect(() => {
    let alive = true;
    const sb = supabaseBrowser() as any;
    const count = async (q: any): Promise<number | null> => { const { count: n, error } = await q; return error ? null : (n ?? 0); };
    const head = (t: string) => sb.from(t).select('id', { count: 'exact', head: true });
    (async () => {
      const [trips, acts, subs, claims, kyc, reports] = await Promise.all([
        count(head('trips').eq('status', 'draft').not('submitted_at', 'is', null)),
        count(head('activities').eq('status', 'draft').not('submitted_at', 'is', null)),
        count(head('venue_submissions').in('status', ['pending', 'reviewing'])),
        count(head('venue_claims').in('status', ['pending', 'reviewing'])),
        count(head('profiles').eq('role', 'venue_owner').eq('kyc_status', 'pending')),
        count(head('venue_reports').eq('status', 'open')),
      ]);
      if (!alive) return;
      setTodos([
        { id: 'trips', label: 'Voyages à valider', hint: 'Soumis par un organisateur', tab: 'trips', count: trips },
        { id: 'acts', label: 'Activités à valider', hint: 'Soumises par un organisateur', tab: 'activities', count: acts },
        { id: 'kyc', label: 'Vérifications Pro', hint: 'Pièces d’identité en attente', tab: 'moderation', count: kyc },
        { id: 'subs', label: 'Contributions', hint: 'Nouveaux lieux proposés', tab: 'submissions', count: subs },
        { id: 'claims', label: 'Revendications', hint: 'Propriétaires de lieux', tab: 'claims', count: claims },
        { id: 'reports', label: 'Signalements', hint: 'Ouverts par la communauté', tab: 'reports', count: reports },
        { id: 'tx', label: 'Paiements en cours', hint: 'Transactions non finalisées', tab: 'transactions', count: pendingTx },
      ]);
    })();
    return () => { alive = false; };
  }, [pendingTx]);

  const failed = !!todos && todos.every((t) => t.count === null);
  const open = (todos ?? []).filter((t) => (t.count ?? 0) > 0).sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
  const total = open.reduce((n, t) => n + (t.count ?? 0), 0);

  return (
    <section aria-labelledby="todo-title" className="rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="todo-title" className="font-display text-lg font-bold">À traiter</h2>
        {todos && total > 0 && <span className="rounded-full bg-primary-500 px-2.5 py-0.5 text-xs font-bold text-night">{total}</span>}
      </div>
      {!todos ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-hidden>
          {[0, 1, 2].map((i) => <div key={i} className="h-[72px] animate-pulse rounded-xl bg-neutral-100" />)}
        </div>
      ) : failed ? (
        <p className="mt-3 text-sm text-neutral-700" role="status">Impossible de charger les files de traitement pour le moment. Utilisez le menu pour ouvrir chaque section.</p>
      ) : open.length === 0 ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-neutral-700" role="status"><span aria-hidden className="text-lg">✅</span> Tout est à jour. Rien n’attend de décision pour le moment.</p>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {open.map((t) => (
            <li key={t.id}>
              <Link href={`/admin?tab=${t.tab}`} className="group flex items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3 transition hover:border-primary-500 hover:bg-primary-500/5">
                <span className="flex h-11 min-w-[2.75rem] items-center justify-center rounded-xl bg-primary-500/15 px-2 font-display text-xl font-extrabold text-primary-700">{t.count}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-dark">{t.label}</span>
                  <span className="block truncate text-xs text-neutral-600">{t.hint}</span>
                </span>
                <span aria-hidden className="text-neutral-500 transition group-hover:translate-x-0.5 group-hover:text-primary-700">→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
