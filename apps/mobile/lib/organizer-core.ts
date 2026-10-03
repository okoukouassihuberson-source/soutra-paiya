// Fonctions pures de l'espace organisateur (testables sous Node, sans Supabase ni React Native).

export const MAX_GENERATED_SLOTS = 120;

/** « a, b\nc » → ['a','b','c'] */
export const splitList = (s: string): string[] => s.split(/\n|,/).map((x) => x.trim()).filter(Boolean);

/** Programme : une ligne par jour « Titre : étape 1, étape 2 ». */
export function parseDays(text: string, tripId: string | undefined) {
  return text.split('\n').map((l) => l.trim()).filter(Boolean).map((l, i) => {
    const [title, stops = ''] = l.split(':');
    return { trip_id: tripId, day_number: i + 1, title: title.trim(), stops: stops.split(',').map((x) => x.trim()).filter(Boolean), i18n: {} };
  });
}

/** Formules : une ligne « Nom | prix XOF | inclus 1, inclus 2 ». */
export function parsePackages(text: string, tripId: string | undefined) {
  return text.split('\n').map((l) => l.trim()).filter(Boolean).map((l, i) => {
    const [name, price, inc = ''] = l.split('|').map((x) => x.trim());
    const code = (['essentielle', 'confort', 'premium', 'vip'] as const).find((c) => name.toLowerCase().includes(c)) ?? 'custom';
    return { trip_id: tripId, code, name, price_xof: Number(price), position: i, includes: inc.split(',').map((x) => x.trim()).filter(Boolean), is_active: true, i18n: {} };
  });
}

/**
 * Créneaux d'une plage de dates (AAAA-MM-JJ) × horaires (HH:MM, heure d'Abidjan = UTC) × jours de la semaine (0 = dimanche ; vide = tous).
 * Seuls les créneaux futurs sont conservés.
 */
export function buildSlotRows(activityId: string, p: { from: string; to: string; times: string[]; days: number[]; capacity: number; price: number | null }, now = new Date()) {
  const rows: { activity_id: string; starts_at: string; capacity: number; price_xof: number | null }[] = [];
  for (let d = new Date(`${p.from}T00:00:00Z`); d <= new Date(`${p.to || p.from}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    if (p.days.length && !p.days.includes(d.getUTCDay())) continue;
    for (const t of p.times) rows.push({ activity_id: activityId, starts_at: `${d.toISOString().slice(0, 10)}T${t}:00Z`, capacity: p.capacity, price_xof: p.price });
  }
  return rows.filter((r) => new Date(r.starts_at) > now);
}

/** Extrait le jeton de 32 caractères d'un QR de billet (préfixes soutra:trip: / soutra:act:). */
export function parseTicket(raw: string): { token: string; kind: 'trip' | 'activity' | 'unknown' } | null {
  const value = raw.trim();
  const kind = value.startsWith('soutra:act:') ? 'activity' : value.startsWith('soutra:trip:') ? 'trip' : 'unknown';
  const token = value.replace('soutra:trip:', '').replace('soutra:act:', '');
  return /^[a-f0-9]{32}$/.test(token) ? { token, kind } : null;
}
