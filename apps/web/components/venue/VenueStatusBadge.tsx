'use client';

import { useEffect, useState } from 'react';

/**
 * VenueStatusBadge — affiche en temps réel l'état d'ouverture d'un venue.
 *
 *   🟢 Ouvert · Ferme à 23h00
 *   🔴 Fermé · Ouvre à 09h00
 *   ⚫ Fermé aujourd'hui
 *
 * Auto-actualise chaque minute (interval 60s) pour traverser correctement
 * les transitions ouverture/fermeture sans reload.
 *
 * Mirror de hoursHelpers.ts côté mobile — algorithme identique pour rester
 * cohérent (gestion overnight 17h→04h + cas matin tôt qui couvre la veille).
 */

type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

const DAY_FROM_JS: Record<number, DayKey> = {
  0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat',
};
const DAY_LABELS_SHORT: Record<DayKey, string> = {
  mon: 'lundi', tue: 'mardi', wed: 'mercredi', thu: 'jeudi',
  fri: 'vendredi', sat: 'samedi', sun: 'dimanche',
};

function parseTimeToMinutes(s: string | undefined | null): number | null {
  if (!s) return null;
  const m = s.trim().match(/^(\d{1,2})\s*[:h]\s*(\d{0,2})$/i);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  if (Number.isNaN(h) || Number.isNaN(min) || h < 0 || h > 47 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

function formatTimeFR(s: string | undefined | null): string {
  if (!s) return '—';
  const m = parseTimeToMinutes(s);
  if (m == null) return s;
  const h = Math.floor(m / 60) % 24;
  const min = m % 60;
  return min === 0 ? `${h}h` : `${h}h${String(min).padStart(2, '0')}`;
}

interface OpenStatus {
  isOpen: boolean;
  hint: string;
  detailLine: string;
}

function computeStatus(
  hours: Record<string, [string, string] | undefined> | null | undefined,
  now: Date,
): OpenStatus {
  if (!hours) return { isOpen: false, hint: 'Horaires non renseignés', detailLine: '' };

  const todayKey = DAY_FROM_JS[now.getDay()];
  const todayRange = hours[todayKey];
  const nowMin = now.getHours() * 60 + now.getMinutes();

  let isOpen = false;
  let hint = 'Fermé aujourd\'hui';

  if (todayRange) {
    const open = parseTimeToMinutes(todayRange[0]);
    const close = parseTimeToMinutes(todayRange[1]);
    if (open != null && close != null) {
      const overnight = close <= open;
      if (!overnight) {
        isOpen = nowMin >= open && nowMin < close;
      } else {
        isOpen = nowMin >= open || nowMin < close;
      }
      hint = isOpen
        ? `Ferme à ${formatTimeFR(todayRange[1])}`
        : nowMin < open
        ? `Ouvre à ${formatTimeFR(todayRange[0])}`
        : `Fermé · Ouvre demain à ${formatTimeFR(todayRange[0])}`;
    }
  }

  // Cas matin tôt : encore ouvert sur le créneau d'hier ?
  if (!isOpen) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yKey = DAY_FROM_JS[yesterday.getDay()];
    const yRange = hours[yKey];
    if (yRange) {
      const yo = parseTimeToMinutes(yRange[0]);
      const yc = parseTimeToMinutes(yRange[1]);
      if (yo != null && yc != null && yc <= yo && nowMin < yc) {
        isOpen = true;
        hint = `Ferme à ${formatTimeFR(yRange[1])}`;
      }
    }
  }

  const detailLine = todayRange
    ? `Aujourd'hui · ${formatTimeFR(todayRange[0])} – ${formatTimeFR(todayRange[1])}`
    : `${DAY_LABELS_SHORT[todayKey]} · fermé`;

  return { isOpen, hint, detailLine };
}

export function VenueStatusBadge({
  hours,
  className = '',
  compact = false,
}: {
  hours: Record<string, [string, string] | undefined> | null | undefined;
  className?: string;
  compact?: boolean;
}) {
  const [now, setNow] = useState(() => new Date());

  // Re-tick chaque minute (le minimum pour traverser correctement les
  // transitions). Ré-instancié chaque mount, pas de fuite mémoire.
  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = window.setInterval(tick, 60_000);
    // Re-sync au focus (utile si l'onglet a été en background)
    const onFocus = () => setNow(new Date());
    window.addEventListener('focus', onFocus);
    return () => { window.clearInterval(id); window.removeEventListener('focus', onFocus); };
  }, []);

  const status = computeStatus(hours, now);

  const dotColor = status.isOpen ? 'bg-emerald-500' : 'bg-red-500';
  const dotRing  = status.isOpen ? 'ring-emerald-500/30' : 'ring-red-500/30';
  const textColor = status.isOpen ? 'text-emerald-700' : 'text-neutral-600';

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${textColor} ${className}`}>
        <span className={`h-2 w-2 rounded-full ring-2 ${dotColor} ${dotRing}`} />
        {status.isOpen ? 'Ouvert' : 'Fermé'} · {status.hint}
      </span>
    );
  }

  return (
    <div className={`rounded-2xl border ${status.isOpen ? 'border-emerald-200 bg-emerald-50' : 'border-neutral-200 bg-neutral-50'} p-4 ${className}`}>
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ring-2 ${dotColor} ${dotRing}`} />
        <span className={`font-display text-base font-bold ${status.isOpen ? 'text-emerald-700' : 'text-neutral-700'}`}>
          {status.isOpen ? 'Ouvert maintenant' : 'Fermé'}
        </span>
      </div>
      <p className={`mt-0.5 text-sm ${status.isOpen ? 'text-emerald-700' : 'text-neutral-600'}`}>
        {status.hint}
      </p>
      {status.detailLine && (
        <p className="mt-2 text-xs text-neutral-500">{status.detailLine}</p>
      )}
    </div>
  );
}
