/**
 * ============================================================================
 * CONFIRMATION DE NUMÉRO — MODE DÉVELOPPEMENT UNIQUEMENT
 * ============================================================================
 * Permet de valider un numéro / se connecter SANS fournisseur SMS, en
 * s'appuyant sur les numéros de test du Supabase LOCAL
 * (cf. supabase/config.toml → [auth.sms.test_otp]).
 *
 * Trois verrous rendent ce module inexploitable en production :
 *   1. `IS_DEV` — faux dans le build de production (process.env.NODE_ENV) ;
 *      le bundler élimine le code dev du bundle de prod.
 *   2. `assertDevLocal()` — refuse d'agir si la cible Supabase n'est pas locale.
 *   3. Les numéros de test n'existent que dans le Supabase local : même appelés,
 *      ils ne fonctionnent pas contre le projet cloud de production.
 * ============================================================================
 */
import { supabaseBrowser, SUPABASE_URL } from './supabase';

/**
 * Vrai uniquement en exécution de développement.
 * `process.env.NODE_ENV` est figé à la compilation : en production il vaut
 * "production", donc `IS_DEV` est la constante `false` et tout le code gardé
 * par cette constante est supprimé du bundle par le compilateur.
 */
export const IS_DEV = process.env.NODE_ENV === 'development';

export interface DevAccount {
  phone: string;
  code: string;
  label: string;
}

/**
 * Comptes de test. Ces couples numéro→code doivent être déclarés à l'identique
 * dans supabase/config.toml → [auth.sms.test_otp]. Ils ne fonctionnent QUE
 * sur le Supabase local et n'ont aucun effet sur le projet de production.
 */
export const DEV_ACCOUNTS: DevAccount[] = [
  { phone: '+2250700000001', code: '424242', label: 'Utilisateur test' },
  { phone: '+2250700000002', code: '424242', label: 'Propriétaire test' },
  { phone: '+2250700000099', code: '424242', label: 'Admin test' },
];

/** Lève une erreur si l'on n'est pas en dev OU si la cible Supabase n'est pas locale. */
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
        'La connexion dev ne doit jamais viser un projet cloud. ' +
        'Lance `supabase start` et pointe NEXT_PUBLIC_SUPABASE_URL sur http://127.0.0.1:54321.',
    );
  }
}

/**
 * Confirme le numéro d'un compte de test et ouvre une session — sans SMS.
 * Utilise le flux OTP standard de Supabase ; le code est accepté grâce aux
 * numéros de test du Supabase local.
 */
export async function devSignIn(account: DevAccount) {
  assertDevLocal();

  const supabase = supabaseBrowser();

  const sent = await supabase.auth.signInWithOtp({ phone: account.phone });
  if (sent.error) throw sent.error;

  const verified = await supabase.auth.verifyOtp({
    phone: account.phone,
    token: account.code,
    type: 'sms',
  });
  if (verified.error) throw verified.error;

  return verified.data;
}
