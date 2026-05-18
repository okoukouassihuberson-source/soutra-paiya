/**
 * ============================================================================
 * CONNEXION RAPIDE — MODE DÉVELOPPEMENT UNIQUEMENT
 * ============================================================================
 * Connecte des comptes de test par numéro + mot de passe, sur le Supabase
 * LOCAL. Si un compte n'existe pas encore, il est créé à la volée.
 *
 * Trois verrous rendent ce module inexploitable en production :
 *   1. `IS_DEV` — faux dans le build de production ; le bundler élimine le
 *      code dev du bundle de prod.
 *   2. `assertDevLocal()` — refuse d'agir si la cible Supabase n'est pas locale.
 *   3. Le mot de passe de test n'a de valeur que sur le Supabase local ; aucun
 *      de ces comptes n'existe sur le projet cloud de production.
 * ============================================================================
 */
import { supabaseBrowser, SUPABASE_URL } from './supabase';

/** Vrai uniquement en exécution de développement (figé à la compilation). */
export const IS_DEV = process.env.NODE_ENV === 'development';

/** Mot de passe partagé des comptes de test — pertinent sur le Supabase local
 *  uniquement, sans aucune valeur sur le projet cloud. */
const DEV_PASSWORD = 'soutra-dev-2025';

export interface DevAccount {
  phone: string;
  label: string;
}

export const DEV_ACCOUNTS: DevAccount[] = [
  { phone: '+2250700000001', label: 'Utilisateur test' },
  { phone: '+2250700000002', label: 'Propriétaire test' },
  { phone: '+2250700000099', label: 'Admin test' },
];

/** Lève une erreur hors dev OU si la cible Supabase n'est pas locale. */
function assertDevLocal(): void {
  if (!IS_DEV) {
    throw new Error('[dev-auth] Connexion de développement interdite hors du mode dev.');
  }
  const isLocal =
    SUPABASE_URL.includes('127.0.0.1') ||
    SUPABASE_URL.includes('localhost') ||
    SUPABASE_URL.includes('[::1]');
  if (!isLocal) {
    throw new Error(
      `[dev-auth] Refusé : la cible Supabase (${SUPABASE_URL}) n'est pas locale. ` +
        'La connexion dev ne doit jamais viser un projet cloud.',
    );
  }
}

/**
 * Connexion d'un compte de test (numéro + mot de passe).
 * Auto-bootstrap : crée le compte sur le Supabase local s'il n'existe pas.
 */
export async function devSignIn(account: DevAccount) {
  assertDevLocal();
  const supabase = supabaseBrowser();

  const signIn = await supabase.auth.signInWithPassword({
    phone: account.phone,
    password: DEV_PASSWORD,
  });
  if (!signIn.error) return signIn.data;

  // Compte absent du Supabase local : on le crée puis on se connecte.
  const signUp = await supabase.auth.signUp({
    phone: account.phone,
    password: DEV_PASSWORD,
  });
  if (signUp.error) throw signUp.error;
  if (signUp.data.session) return signUp.data;

  const retry = await supabase.auth.signInWithPassword({
    phone: account.phone,
    password: DEV_PASSWORD,
  });
  if (retry.error) throw retry.error;
  return retry.data;
}
