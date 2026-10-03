# Pages légales (CGU, confidentialité, À propos)

Pages : `/cgu`, `/confidentialite`, `/a-propos` (et `/en/…`). Textes dans `apps/web/lib/legal/content.ts` (FR + EN), informations de l'éditeur dans `lib/legal/config.ts`.

## ⚠️ Ce ne sont que des squelettes
Rédigés d'après le fonctionnement réel de la plateforme (réservations, promotions non cumulables, paiements Mobile Money/carte/portefeuille, KYC, assistant IA, prestataires utilisés), **mais non relus par un juriste**. Un bandeau « Version provisoire » s'affiche sur les CGU et la politique de confidentialité tant que `NEXT_PUBLIC_LEGAL_REVIEWED` n'est pas à `true`.

## À faire avant publication
1. **Renseigner l'éditeur** (variables Vercel, puis redéployer) :
   `NEXT_PUBLIC_LEGAL_COMPANY`, `_LEGAL_FORM`, `_LEGAL_ADDRESS`, `_LEGAL_RCCM`, `_LEGAL_NCC` (optionnel), `_LEGAL_DIRECTOR`, `_LEGAL_PHONE` (optionnel), `NEXT_PUBLIC_CONTACT_EMAIL`, `NEXT_PUBLIC_PRIVACY_EMAIL` (sinon le contact général).
   Tant qu'une valeur manque, la page affiche « [à compléter] ».
2. **Faire relire par un juriste ivoirien** tous les passages marqués `[à valider]` / `[à définir]` :
   - rôle de la plateforme (intermédiaire vs vendeur) et responsabilité ;
   - politique d'annulation et de remboursement (délais, pourcentages) ;
   - durées de conservation des données et des pièces KYC ;
   - références légales (loi n° 2013-450 du 19 juin 2013, autorité ARTCI) et formalités de déclaration/autorisation de l'autorité de protection des données ;
   - transferts de données hors Côte d'Ivoire (Supabase, Vercel, Anthropic, Mapbox…) ;
   - droit applicable et tribunaux compétents, mineurs, cookies/mesure d'audience.
3. Vérifier que les textes reflètent la réalité (commissions, prestataires de paiement, sous-traitants) et les mettre à jour à chaque évolution (champ `updated`).
4. Passer `NEXT_PUBLIC_LEGAL_REVIEWED=true` pour retirer le bandeau.

## Ce qui n'est pas couvert
Mentions légales dédiées (partiellement dans les CGU, à compléter), conditions spécifiques Partenaires/Organisateurs, politique de cookies détaillée, conditions de la carte de fidélité et de Premium, procédure de signalement de contenus illicites.
