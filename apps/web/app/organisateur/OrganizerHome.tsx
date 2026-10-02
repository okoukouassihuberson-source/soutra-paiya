'use client';

import { useState } from 'react';
import { OrganizerDashboard } from './OrganizerDashboard';
import { ActivityManager } from './ActivityManager';

/** Onglets de l'espace organisateur : voyages groupés / activités. */
export function OrganizerHome() {
  const [tab, setTab] = useState<'trips' | 'activities'>('trips');
  const btn = (t: 'trips' | 'activities') =>
    `rounded-full px-5 py-2 text-sm font-bold ${tab === t ? 'bg-primary-500 text-white' : 'border border-neutral-700 text-neutral-300'}`;
  return (
    <div className="space-y-6">
      <div className="flex gap-2" role="tablist">
        <button role="tab" aria-selected={tab === 'trips'} className={btn('trips')} onClick={() => setTab('trips')}>🚌 Voyages</button>
        <button role="tab" aria-selected={tab === 'activities'} className={btn('activities')} onClick={() => setTab('activities')}>🎯 Activités</button>
      </div>
      {tab === 'trips' ? <OrganizerDashboard /> : <ActivityManager />}
    </div>
  );
}
