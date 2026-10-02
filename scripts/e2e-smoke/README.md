# Test de fumée navigateur (faux Supabase)

Vérifie dans un vrai Chromium, sans aucun service externe : fiche voyage, offres, code promo, aperçu et total remisé,
réservation, erreur `PROMO_RATE_LIMITED`, page `/en`, assistant (réponse, fiches, limite), absence de défilement
horizontal à 390 px et d'erreurs console. **Ne remplace pas la recette en préproduction** (`docs/RECETTE_V2.md`).

```bash
node scripts/e2e-smoke/mock-supabase.js &                       # faux Supabase sur :9201
cd apps/web
export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9201 NEXT_PUBLIC_SUPABASE_ANON_KEY=anon
pnpm exec next build && pnpm exec next start -p 3100 &          # l'URL est figée au build : rebuild nécessaire
PLAYWRIGHT_PATH=/chemin/vers/playwright CHROMIUM_PATH=/chemin/vers/chromium node ../../scripts/e2e-smoke/booking-promo.js
```
La session est simulée par un cookie `sb-127-auth-token` (nom dérivé de l'hôte `127.0.0.1`).
