/**
 * Noms d'utilisateurs affichables publiquement (vue `public_profiles`, migration 0098).
 * La table `profiles` n'est plus lisible par les autres utilisateurs ni par les visiteurs :
 * on n'utilise plus de jointure `profiles(...)`. Ne remonte jamais téléphone, e-mail ni KYC.
 */
export async function publicNames(sb: any, ids: Array<string | null | undefined>): Promise<Map<string, string | null>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  const out = new Map<string, string | null>();
  if (unique.length === 0) return out;
  const { data } = await sb.from('public_profiles').select('id, full_name').in('id', unique);
  for (const p of (data ?? []) as Array<{ id: string; full_name: string | null }>) out.set(p.id, p.full_name);
  return out;
}
