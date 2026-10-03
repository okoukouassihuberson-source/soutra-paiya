// Informations légales de l'éditeur. À RENSEIGNER avant publication (variables d'environnement Vercel).
// Tant qu'une valeur manque, la page affiche « [à compléter] » : aucune donnée n'est inventée.
const v = (x: string | undefined) => (x && x.trim() ? x.trim() : '');

export const LEGAL = {
  company: v(process.env.NEXT_PUBLIC_LEGAL_COMPANY),         // dénomination sociale
  form: v(process.env.NEXT_PUBLIC_LEGAL_FORM),               // forme juridique (SARL, SAS…)
  address: v(process.env.NEXT_PUBLIC_LEGAL_ADDRESS),         // siège social
  registration: v(process.env.NEXT_PUBLIC_LEGAL_RCCM),       // RCCM / numéro d'immatriculation
  taxId: v(process.env.NEXT_PUBLIC_LEGAL_NCC),               // N° de compte contribuable (optionnel)
  director: v(process.env.NEXT_PUBLIC_LEGAL_DIRECTOR),       // directeur de la publication
  email: v(process.env.NEXT_PUBLIC_CONTACT_EMAIL),           // contact général
  privacyEmail: v(process.env.NEXT_PUBLIC_PRIVACY_EMAIL) || v(process.env.NEXT_PUBLIC_CONTACT_EMAIL), // données personnelles
  phone: v(process.env.NEXT_PUBLIC_LEGAL_PHONE),
  /** Passer à « true » UNIQUEMENT après relecture par un juriste : masque le bandeau « version provisoire ». */
  reviewed: process.env.NEXT_PUBLIC_LEGAL_REVIEWED === 'true',
  updated: '2026-10-03',
} as const;

export const TBD = { fr: '[à compléter]', en: '[to be completed]' } as const;
