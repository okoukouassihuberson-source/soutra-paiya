import { CI_CITIES } from '@soutra/shared';
import { getI18n } from '@/lib/i18n/server';

/** Formulaire GET (sans JS) : fonctionne en SSR, indexable, léger sur mobile. */
export function SearchBar({ q = '', city = '', cat = '', dark = false }: { q?: string; city?: string; cat?: string; dark?: boolean }) {
  const { t, lp } = getI18n();
  return (
    <form action={lp('/explorer')} method="get" role="search" className={`grid gap-2 rounded-2xl p-2 shadow-xl sm:grid-cols-[1.4fr_1fr_auto] ${dark ? 'bg-white' : 'bg-white ring-1 ring-neutral-200'}`}>
      {cat && <input type="hidden" name="cat" value={cat} />}
      <label className="block">
        <span className="sr-only">{t('search.q')}</span>
        <input name="q" defaultValue={q} list="search-suggestions" placeholder={t('search.qPlaceholder')} className="w-full rounded-xl border-0 bg-neutral-50 px-4 py-3 text-base text-dark placeholder:text-neutral-400 focus:ring-2 focus:ring-primary-500" />
      </label>
      <label className="block">
        <span className="sr-only">{t('search.where')}</span>
        <input name="city" defaultValue={city} list="search-cities" placeholder={t('search.wherePlaceholder')} className="w-full rounded-xl border-0 bg-neutral-50 px-4 py-3 text-base text-dark placeholder:text-neutral-400 focus:ring-2 focus:ring-primary-500" />
      </label>
      <button type="submit" className="rounded-xl bg-primary-500 px-6 py-3 font-semibold text-night transition hover:bg-primary-400">{t('common.search')}</button>
      <datalist id="search-suggestions">
        {t('search.suggestions').split('|').map((s) => <option key={s} value={s} />)}
      </datalist>
      <datalist id="search-cities">{CI_CITIES.map((c) => <option key={c} value={c} />)}</datalist>
    </form>
  );
}
