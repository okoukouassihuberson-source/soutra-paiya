'use client';

import { useRef, useState } from 'react';
import { CI_CITIES } from '@soutra/shared';
import { EXPLORER_AMENITIES, EXPLORER_SORTS } from '@/lib/explorer-options';
import { useI18n } from '@/lib/i18n/client';

export interface FilterValues {
  q: string; city: string; commune: string; district: string; cat: string;
  minPrice: string; maxPrice: string; minRating: string; amenities: string[];
  openNow: boolean; onlinePayment: boolean; checkIn: string; checkOut: string;
  lat: string; lng: string; radius: string; sort: string; view: string;
}

const field = 'w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm';

/**
 * Formulaire GET : l'URL porte tout l'état (partageable, indexable pour la
 * page sans filtre, fonctionne sans JS). Seul « Près de moi » utilise du JS
 * (géolocalisation navigateur → lat/lng/rayon dans le formulaire).
 */
export function ExplorerFilters({ v }: { v: FilterValues }) {
  const { t, lp } = useI18n();
  const form = useRef<HTMLFormElement>(null);
  const [geo, setGeo] = useState<{ lat: string; lng: string }>({ lat: v.lat, lng: v.lng });
  const [geoMsg, setGeoMsg] = useState<string | null>(null);

  function locate() {
    if (!navigator.geolocation) { setGeoMsg(t('filters.geoUnsupported')); return; }
    setGeoMsg(t('filters.geoLocating'));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({ lat: pos.coords.latitude.toFixed(5), lng: pos.coords.longitude.toFixed(5) });
        setGeoMsg(t('filters.geoFound'));
        const r = form.current?.elements.namedItem('radius') as HTMLSelectElement | null;
        if (r && !r.value) r.value = '10';
        const s = form.current?.elements.namedItem('sort') as HTMLSelectElement | null;
        if (s) s.value = 'distance';
      },
      () => setGeoMsg(t('filters.geoDenied')),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
    );
  }

  const active = Number(!!(v.commune || v.district || v.minPrice || v.maxPrice || v.minRating || v.amenities.length || v.openNow || v.onlinePayment || v.checkIn || v.lat));

  return (
    <form ref={form} action={lp('/explorer')} method="get" role="search" className="space-y-3">
      {v.cat && <input type="hidden" name="cat" value={v.cat} />}
      {v.view === 'map' && <input type="hidden" name="view" value="map" />}
      <input type="hidden" name="lat" value={geo.lat} />
      <input type="hidden" name="lng" value={geo.lng} />

      <div className="grid gap-2 rounded-2xl bg-white p-2 shadow-lg ring-1 ring-neutral-200 sm:grid-cols-[1.4fr_1fr_auto]">
        <label className="block"><span className="sr-only">{t('search.q')}</span>
          <input name="q" defaultValue={v.q} maxLength={80} placeholder={t('search.qPlaceholder')} className="w-full rounded-xl border-0 bg-neutral-50 px-4 py-3 text-base" /></label>
        <label className="block"><span className="sr-only">{t('search.where')}</span>
          <input name="city" defaultValue={v.city} list="ex-cities" maxLength={60} placeholder={t('search.wherePlaceholder')} className="w-full rounded-xl border-0 bg-neutral-50 px-4 py-3 text-base" /></label>
        <button type="submit" className="rounded-xl bg-primary-500 px-6 py-3 font-semibold text-white hover:bg-primary-600">{t('common.search')}</button>
        <datalist id="ex-cities">{CI_CITIES.map((c) => <option key={c} value={c} />)}</datalist>
      </div>

      <details className="rounded-2xl border border-neutral-200 bg-white p-4" open={active > 0}>
        <summary className="cursor-pointer select-none text-sm font-semibold text-dark">
          {t('filters.advanced')}{active ? <span className="ml-2 rounded-full bg-primary-500 px-2 py-0.5 text-xs text-white">{t('filters.active')}</span> : null}
        </summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-semibold text-neutral-600">{t('filters.commune')}<input name="commune" defaultValue={v.commune} maxLength={60} className={field} /></label>
          <label className="text-xs font-semibold text-neutral-600">{t('filters.district')}<input name="district" defaultValue={v.district} maxLength={60} className={field} /></label>
          <label className="text-xs font-semibold text-neutral-600">{t('filters.minPrice')}<input name="min_price" type="number" min={0} step={500} defaultValue={v.minPrice} className={field} /></label>
          <label className="text-xs font-semibold text-neutral-600">{t('filters.maxPrice')}<input name="max_price" type="number" min={0} step={500} defaultValue={v.maxPrice} className={field} /></label>
          <label className="text-xs font-semibold text-neutral-600">{t('filters.minRating')}
            <select name="min_rating" defaultValue={v.minRating} className={field}>
              <option value="">{t('filters.ratingAll')}</option><option value="3">{t('filters.rating3')}</option><option value="4">{t('filters.rating4')}</option><option value="4.5">{t('filters.rating45')}</option>
            </select></label>
          <label className="text-xs font-semibold text-neutral-600">{t('filters.checkIn')}<input name="check_in" type="date" defaultValue={v.checkIn} className={field} /></label>
          <label className="text-xs font-semibold text-neutral-600">{t('filters.checkOut')}<input name="check_out" type="date" defaultValue={v.checkOut} className={field} /></label>
          <div className="text-xs font-semibold text-neutral-600">{t('filters.distance')}
            <div className="mt-1 flex gap-2">
              <select name="radius" defaultValue={v.radius} className={field} aria-label={t('filters.radius')}>
                <option value="">{t('filters.noLimit')}</option>
                {[2, 5, 10, 25, 50, 100].map((r) => <option key={r} value={r}>{t('filters.km', { n: r })}</option>)}
              </select>
              <button type="button" onClick={locate} className="shrink-0 rounded-xl border border-neutral-300 px-3 text-sm">{t('filters.nearMe')}</button>
            </div>
            {geoMsg && <p className="mt-1 font-normal text-neutral-500">{geoMsg}</p>}
          </div>
        </div>

        <fieldset className="mt-4">
          <legend className="text-xs font-semibold text-neutral-600">{t('filters.services')}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {EXPLORER_AMENITIES.map((a) => (
              <label key={a.key} className="cursor-pointer">
                <input type="checkbox" name="am" value={a.key} defaultChecked={v.amenities.includes(a.key)} className="peer sr-only" />
                <span className="inline-block rounded-full border border-neutral-300 px-3 py-1.5 text-sm peer-checked:border-primary-500 peer-checked:bg-primary-500 peer-checked:text-white peer-focus-visible:ring-2">{t(`amenity.${a.key}` as 'amenity.wifi')}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-4 flex flex-wrap items-center gap-5 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" name="open" value="1" defaultChecked={v.openNow} /> {t('filters.openNow')}</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="pay" value="1" defaultChecked={v.onlinePayment} /> {t('filters.onlinePayment')}</label>
          <label className="ml-auto flex items-center gap-2 text-xs font-semibold text-neutral-600">{t('filters.sortBy')}
            <select name="sort" defaultValue={v.sort} className="rounded-xl border border-neutral-300 py-1.5 text-sm">
              {EXPLORER_SORTS.map((s) => <option key={s.key} value={s.key}>{t(`sort.${s.key}` as 'sort.rating')}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-4 flex gap-3">
          <button type="submit" className="rounded-xl bg-dark px-5 py-2 text-sm font-semibold text-white">{t('filters.apply')}</button>
          <a href={lp(`/explorer${v.cat ? `?cat=${v.cat}` : ''}`)} className="rounded-xl border border-neutral-300 px-5 py-2 text-sm font-medium">{t('common.reset')}</a>
        </div>
      </details>
    </form>
  );
}
