'use client';

import { useState } from 'react';
import { OrganizerDashboard } from './OrganizerDashboard';
import { ActivityManager } from './ActivityManager';
import { MyCommission } from '@/components/tourism/CommissionsPanel';
import { OffersManager } from '@/components/tourism/OffersManager';

/** Onglets de l'espace organisateur : voyages groupés / activités. */
export function OrganizerHome() {
  const [tab, setTab] = useState<'trips' | 'activities' | 'offers'>('trips');
  const btn = (t: 'trips' | 'activities' | 'offers') =>
    `rounded-full px-5 py-2 text-sm font-bold ${tab === t ? 'bg-primary-500 text-white' : 'border border-neutral-700 text-neutral-300'}`;
  return (
    <div className="space-y-6">
      <MyCommission />
      <div className="flex gap-2" role="tablist">
        <button role="tab" aria-selected={tab === 'trips'} className={btn('trips')} onClick={() => setTab('trips')}>🚌 Voyages</button>
        <button role="tab" aria-selected={tab === 'activities'} className={btn('activities')} onClick={() => setTab('activities')}>🎯 Activités</button>
        <button role="tab" aria-selected={tab === 'offers'} className={btn('offers')} onClick={() => setTab('offers')}>🏷️ Offres</button>
      </div>
      {tab === 'trips' ? <OrganizerDashboard /> : tab === 'activities' ? <ActivityManager /> : <OffersManager />}
    </div>
  );
}
