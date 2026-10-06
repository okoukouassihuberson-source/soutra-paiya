import { LOCALES, PREFIXED_LOCALES } from '@/lib/i18n/config';

export interface TranslatableField { name: string; label: string; multiline?: boolean; list?: boolean }
type I18nContent = Record<string, Record<string, string>>;

const input = 'w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-dark placeholder:text-neutral-600';
const lbl = 'block text-xs font-semibold text-neutral-700';

/**
 * Champs de traduction du contenu éditorial (thème sombre : admin et organisateur).
 * Un bloc repliable par langue active autre que le français (langue d'origine).
 * Champs `list` : une entrée par ligne. Nom des inputs : i18n:<langue>:<champ>.
 */
export function TranslationFields({ fields, defaults, children }: { fields: TranslatableField[]; defaults?: I18nContent | null; children?: React.ReactNode }) {
  return (
    <>
      {PREFIXED_LOCALES.map((l) => (
        <details key={l} className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 sm:col-span-2" open={!!defaults?.[l] && Object.keys(defaults[l]).length > 0}>
          <summary className="cursor-pointer select-none text-sm font-semibold text-neutral-900">🌐 Traduction — {LOCALES[l].label}</summary>
          <p className="mt-2 text-xs text-neutral-600">Champs laissés vides : le texte français est affiché.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {fields.map((f) => (
              <label key={f.name} className={`${lbl} ${f.multiline || f.list ? 'sm:col-span-2' : ''}`}>
                {f.label}{f.list ? ' (une entrée par ligne)' : ''}
                {f.multiline || f.list
                  ? <textarea name={`i18n:${l}:${f.name}`} rows={f.list ? 2 : 3} defaultValue={defaults?.[l]?.[f.name] ?? ''} className={input} />
                  : <input name={`i18n:${l}:${f.name}`} defaultValue={defaults?.[l]?.[f.name] ?? ''} className={input} />}
              </label>
            ))}
            {children}
          </div>
        </details>
      ))}
    </>
  );
}

/**
 * Reconstruit l'objet i18n depuis le formulaire. Les langues absentes du formulaire
 * (désactivées) sont conservées telles quelles depuis `existing`.
 */
export function collectI18n(form: FormData, fields: string[], existing?: I18nContent | null): I18nContent {
  const out: I18nContent = { ...(existing ?? {}) };
  for (const l of PREFIXED_LOCALES) {
    const obj: Record<string, string> = {};
    for (const name of fields) {
      const v = String(form.get(`i18n:${l}:${name}`) ?? '').trim();
      if (v) obj[name] = v;
    }
    if (Object.keys(obj).length > 0) out[l] = obj; else delete out[l];
  }
  return out;
}
