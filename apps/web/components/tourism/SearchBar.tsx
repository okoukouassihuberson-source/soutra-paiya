import { CI_CITIES } from '@soutra/shared';

/** Formulaire GET (sans JS) : fonctionne en SSR, indexable, léger sur mobile. */
export function SearchBar({ q = '', city = '', cat = '', dark = false }: { q?: string; city?: string; cat?: string; dark?: boolean }) {
  return (
    <form action="/explorer" method="get" role="search" className={`grid gap-2 rounded-2xl p-2 shadow-xl sm:grid-cols-[1.4fr_1fr_auto] ${dark ? 'bg-white' : 'bg-white ring-1 ring-neutral-200'}`}>
      {cat && <input type="hidden" name="cat" value={cat} />}
      <label className="block">
        <span className="sr-only">Que recherchez-vous ?</span>
        <input name="q" defaultValue={q} list="search-suggestions" placeholder="Que recherchez-vous ? Hôtel, maquis, plage, voyage…" className="w-full rounded-xl border-0 bg-neutral-50 px-4 py-3 text-base text-dark placeholder:text-neutral-400 focus:ring-2 focus:ring-primary-500" />
      </label>
      <label className="block">
        <span className="sr-only">Où ?</span>
        <input name="city" defaultValue={city} list="search-cities" placeholder="Où ? Assinie, Grand-Bassam…" className="w-full rounded-xl border-0 bg-neutral-50 px-4 py-3 text-base text-dark placeholder:text-neutral-400 focus:ring-2 focus:ring-primary-500" />
      </label>
      <button type="submit" className="rounded-xl bg-primary-500 px-6 py-3 font-semibold text-white transition hover:bg-primary-600">Rechercher</button>
      <datalist id="search-suggestions">
        {['Hôtel', 'Résidence', 'Restaurant', 'Maquis', 'Site touristique', 'Activité', 'Voyage', 'Excursion'].map((s) => <option key={s} value={s} />)}
      </datalist>
      <datalist id="search-cities">{CI_CITIES.map((c) => <option key={c} value={c} />)}</datalist>
    </form>
  );
}
