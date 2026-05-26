/** Merge de classes Tailwind tolérant null/false/undefined.
 *  Pas de dépendance (clsx/twMerge évités pour rester léger).
 *  En cas de conflit (deux classes Tailwind sur le même attribut),
 *  la DERNIÈRE l'emporte naturellement via l'ordre de génération du CSS. */
export function cn(...inputs: Array<string | false | null | undefined>): string {
  return inputs.filter(Boolean).join(' ');
}
