// Helpers partagés entre HoursCompact et HoursSheet : calcul de l'état
// ouvert/fermé d'un établissement à partir de son `opening_hours` JSONB
// (Record<dayKey, [open, close]>).

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export const DAY_ORDER: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export const DAY_LABELS: Record<DayKey, string> = {
  mon: 'Lundi',
  tue: 'Mardi',
  wed: 'Mercredi',
  thu: 'Jeudi',
  fri: 'Vendredi',
  sat: 'Samedi',
  sun: 'Dimanche',
};

export const DAY_SHORT: Record<DayKey, string> = {
  mon: 'Lun', tue: 'Mar', wed: 'Mer', thu: 'Jeu', fri: 'Ven', sat: 'Sam', sun: 'Dim',
};

/** Convertit le Date.getDay() (0=dim, 1=lun…) en DayKey ISO. */
export function dayKeyFromDate(d: Date): DayKey {
  const jsToIso: Record<number, DayKey> = {
    0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat',
  };
  return jsToIso[d.getDay()];
}

/** Parse "17:30" ou "17h30" ou "17h" → minutes depuis minuit. */
export function parseTimeToMinutes(s: string | undefined | null): number | null {
  if (!s) return null;
  const m = s.trim().match(/^(\d{1,2})\s*[:h]\s*(\d{0,2})$/i);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  if (Number.isNaN(h) || Number.isNaN(min) || h < 0 || h > 47 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** Formate "17:30" → "17h30" ; "17:00" → "17h". */
export function formatTimeFR(s: string | undefined | null): string {
  if (!s) return '—';
  const m = parseTimeToMinutes(s);
  if (m == null) return s;
  const h = Math.floor(m / 60) % 24;
  const min = m % 60;
  return min === 0 ? `${h}h` : `${h}h${String(min).padStart(2, '0')}`;
}

/** Seuil en minutes pour considérer qu'un établissement "ferme bientôt". */
export const CLOSING_SOON_THRESHOLD_MIN = 30;

export interface OpenStatus {
  isOpen: boolean;
  todayOpen: string | null;
  todayClose: string | null;
  todayKey: DayKey;
  /** true si isOpen et fermeture dans moins de CLOSING_SOON_THRESHOLD_MIN. */
  isClosingSoon: boolean;
  /** Phrase courte type "Ouvre à 17h" / "Ferme à 04h" / "Ferme bientôt (23h30)" / "Fermé aujourd'hui". */
  hint: string;
}

/**
 * Évalue l'état d'ouverture à `now` à partir d'un mapping `hours`.
 * Gère les horaires « overnight » (close < open, ex. 17h → 04h).
 * Considère aussi que l'établissement peut être encore dans la veille
 * (ex. il est 02h, hier ouvrait 17h→04h → toujours ouvert).
 */
export function computeOpenStatus(
  hours: Record<string, [string, string] | undefined> | null | undefined,
  now: Date = new Date(),
): OpenStatus {
  const todayKey = dayKeyFromDate(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const todayRange = hours?.[todayKey];
  const todayOpen = todayRange?.[0] ?? null;
  const todayClose = todayRange?.[1] ?? null;

  let isOpen = false;
  let isClosingSoon = false;
  let hint = 'Fermé aujourd\'hui';

  if (todayOpen && todayClose) {
    const o = parseTimeToMinutes(todayOpen);
    const c = parseTimeToMinutes(todayClose);
    if (o != null && c != null) {
      const overnight = c <= o;
      let minutesUntilClose: number | null = null;
      if (!overnight) {
        isOpen = nowMin >= o && nowMin < c;
        if (isOpen) minutesUntilClose = c - nowMin;
      } else {
        // Cas overnight (ex. 17h-04h) : ouvert si `now >= open` aujourd'hui
        // OU `now < close` (encore dans la fenêtre nocturne).
        isOpen = nowMin >= o || nowMin < c;
        if (isOpen) {
          minutesUntilClose = nowMin >= o
            ? (1440 - nowMin) + c // segment soirée : fermeture le lendemain
            : c - nowMin; // segment petit matin : fermeture aujourd'hui
        }
      }
      isClosingSoon = minutesUntilClose != null && minutesUntilClose <= CLOSING_SOON_THRESHOLD_MIN;
      hint = isOpen
        ? (isClosingSoon ? `Ferme bientôt (${formatTimeFR(todayClose)})` : `Ferme à ${formatTimeFR(todayClose)}`)
        : `Ouvre à ${formatTimeFR(todayOpen)}`;
    }
  }

  // Cas particulier : ce matin tôt, peut-être encore ouvert sur le créneau d'hier.
  if (!isOpen) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yKey = dayKeyFromDate(yesterday);
    const yRange = hours?.[yKey];
    if (yRange) {
      const yo = parseTimeToMinutes(yRange[0]);
      const yc = parseTimeToMinutes(yRange[1]);
      if (yo != null && yc != null && yc <= yo && nowMin < yc) {
        // overnight d'hier qui couvre encore l'heure courante
        isOpen = true;
        const minutesUntilClose = yc - nowMin;
        isClosingSoon = minutesUntilClose <= CLOSING_SOON_THRESHOLD_MIN;
        hint = isClosingSoon ? `Ferme bientôt (${formatTimeFR(yRange[1])})` : `Ferme à ${formatTimeFR(yRange[1])}`;
      }
    }
  }

  return { isOpen, todayOpen, todayClose, todayKey, isClosingSoon, hint };
}
