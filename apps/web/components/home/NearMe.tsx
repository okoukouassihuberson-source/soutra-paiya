'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n/client';

/** Ouvre la carte de l'Explorateur centrée sur l'utilisateur (rayon 5 km) ; repli : carte générale. */
export function NearMeButton({ className = '' }: { className?: string }) {
  const { t, lp } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  function go() {
    setNote('');
    if (!('geolocation' in navigator)) { router.push(lp('/explorer?view=map')); return; }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => router.push(lp(`/explorer?view=map&lat=${p.coords.latitude.toFixed(5)}&lng=${p.coords.longitude.toFixed(5)}&radius=5`)),
      () => { setBusy(false); setNote(t('home2.mapDenied')); router.push(lp('/explorer?view=map')); },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 120000 },
    );
  }
  return (
    <div>
      <button type="button" onClick={go} disabled={busy} className={className}>
        {busy ? t('home2.mapLocating') : t('home2.mapCta')}
      </button>
      <p role="status" aria-live="polite" className="mt-2 min-h-[1rem] text-xs text-white/70">{note}</p>
    </div>
  );
}
