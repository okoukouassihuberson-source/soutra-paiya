# Test de fumée navigateur (faux Supabase)

Deux scripts : `booking-promo.js` (voyageur) et `organizer-offers.js` (espace organisateur : bandeau de commission, création / désactivation / suppression d'offres, messages d'erreur). Vérifient dans un vrai Chromium, sans aucun service externe : fiche voyage, offres, code promo, aperçu et total remisé,
réservation, erreur `PROMO_RATE_LIMITED`, page `/en`, assistant (réponse, fiches, limite), absence de défilement
horizontal à 390 px et d'erreurs console. **Ne remplace pas la recette en préproduction** (`docs/RECETTE_V2.md`).

```bash
node scripts/e2e-smoke/mock-supabase.js &                       # faux Supabase sur :9201
cd apps/web
export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9201 NEXT_PUBLIC_SUPABASE_ANON_KEY=anon
pnpm exec next build && pnpm exec next start -p 3100 &          # l'URL est figée au build : rebuild nécessaire
PLAYWRIGHT_PATH=/chemin/vers/playwright CHROMIUM_PATH=/chemin/vers/chromium node ../../scripts/e2e-smoke/booking-promo.js
```
Redémarrer le faux serveur entre deux exécutions (il garde les offres créées). Les scripts bloquent le service worker : celui-ci met en cache les requêtes GET qui ne sont pas sur `*.supabase.co` (voir `docs/RECETTE_V2_RESULTATS.md`).
La session est simulée par un cookie `sb-127-auth-token` (nom dérivé de l'hôte `127.0.0.1`).
