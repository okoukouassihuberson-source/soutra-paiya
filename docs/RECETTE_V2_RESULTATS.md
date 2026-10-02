# SOUTRA PLAYCE V2 — Résultats de la pré-recette automatisée

**Ce document n'est PAS la recette en préproduction.** Aucun accès à un projet Supabase, à GeniusPay, Resend, Expo, VAPID ni à l'API Anthropic n'était disponible dans l'environnement où le code a été écrit (réseau sortant bloqué, aucun secret, pas de CLI Supabase). J'ai donc exécuté **tout ce qui est vérifiable localement**, sur le code final (commit `7872a83` et suivants), et marqué le reste comme **à faire par une personne** avec `docs/RECETTE_V2.md`.

Légende : ✅ vérifié automatiquement en local · ⬜ non vérifiable ici, à faire en préproduction · ⚠️ vérifié en partie.

## 1. Ce qui a été exécuté
| Contrôle | Résultat |
|---|---|
| Chaîne de migrations 0082 → 0095 sur PostgreSQL 16 vierge, **une transaction par migration** (comme `supabase db push`) | ✅ aucune erreur (0093 testée avec un schéma `storage` simulé) |
| Scénarios SQL de bout en bout (réservation, acompte, solde, reçus, annulation, expiration, activité, avis, verrous organisateur, scan, accès) | ✅ voir § 2 |
| Scénarios SQL des modules (offres 20 scénarios, anti-devinette, commissions, plafond assistant, suppression admin, notifications, activités, recherche) | ✅ passés au moment de leur livraison ; offres, activités, commissions, assistant et suppression rejoués sur la chaîne finale |
| Tests Deno (notifications + outils de l'assistant) | ✅ 12 / 12 |
| Fonction `tourism-assistant` réelle contre faux Supabase + faux Anthropic | ✅ authentification, limite, outil → réponse + fiches, panne remboursée, boucle bornée, langue |
| Tests i18n (parité FR/EN, routage, pluriels, middleware anti-falsification) | ✅ 10 / 10 |
| `tsc` web et mobile | ✅ 0 erreur |
| `next build` | ✅ compilé |
| **Navigateur réel (Chromium) — espace organisateur** (`organizer-offers.js`) : bandeau de commission, création d'une offre « couple » (participants fixés à 2, propriétaire = utilisateur), messages d'erreur (95 %, code en double), date de fin obligatoire pour la vente flash, désactivation, suppression confirmée | ✅ 12 / 12 |
| **Navigateur réel (Chromium, 390 px) contre faux Supabase** — `scripts/e2e-smoke/` : fiche voyage, offres, aperçu et total remisé (offre auto, code valide/inconnu, formule), réservation, erreur de limitation de codes, `/en` traduit, assistant (réponse, fiche cliquable, limite), pas de défilement horizontal, aucune erreur console | ✅ 25 / 25 |
| Application web démarrée (`next start`) contre un faux Supabase : accueil, `/en`, explorer, voyages, activités, destinations, promotions FR/EN, sitemap (alternates `hreflang`), robots, 404 sur fiche inconnue, redirection vers `/login` pour `/assistant` et `/notifications`, en-tête `x-locale` falsifié sans effet | ✅ |

## 2. Résultats par scénario de `RECETTE_V2.md`
### A. Parcours voyageur
- ✅ Réserver sans code : total = prix × places, places retenues (SQL).
- ✅ Acompte 30 % → « confirmé » + billet ; solde → « payé » ; 2 reçus ; **rejeu du même paiement ignoré** (idempotence).
- ✅ Annuler : payée → `REFUND_REQUIRED` ; impayée → places libérées.
- ✅ Expiration : une réservation impayée expirée libère ses places (voyage « complet » redevient « publié »).
- ✅ Participants négatifs ou > 50 refusés ; voyage brouillon non réservable.
- ✅ Activité : réservation, paiement, billet ; avis refusé avant l'activité, accepté après, second refusé.
- ⚠️ Pages publiques : rendues sans erreur avec données vides ou une offre simulée ; **rendu avec de vraies fiches, filtres, carte, « autour de moi » : ⬜**.
- ⬜ Paiement GeniusPay réel (sandbox) et page de retour ; reçu et notification reçus.

### B. Promotions
- ✅ Offre automatique, code valide (casse ignorée), erreurs (inconnu, hors périmètre, épuisé, déjà utilisé), plafond de réduction, plancher de 200 FCFA, libération à l'annulation, **10 essais ratés → limitation** sans réservation créée.
- ✅ Parcours dans l'interface web (Chromium, faux serveur) : champ code, offre automatique, prix avant/après, formule, message de limitation. ⬜ Même parcours contre le vrai serveur ; ⬜ mobile.

### C. Organisateur
- ✅ Voyage publié : prix et commission verrouillés (`TRIP_LOCKED`) ; voyage d'un autre invisible ; contraintes de forme des offres (% > 90, couple ≠ 2, flash sans fin…) ; scan : refusé pour un organisateur étranger (sans révéler l'existence du billet), accepté une fois, refusé la seconde (`ALREADY_USED`).
- ✅ Gestion des offres dans l'interface (Chromium, faux serveur). ⬜ Création de voyage / activité dans l'interface, téléversement d'image réel, soumission, publication.

### D. Administration
- ✅ Commissions : défaut 0 %, taux défaut, taux négocié, priorité élément > partenaire > défaut, **historique figé**, rapport, audit ; suppression : refusée avec réservation, acceptée sans, cascade, audit ; vue d'ensemble des offres.
- ⬜ Interface des onglets Commissions, Offres, Voyages, Activités.

### E. Notifications
- ✅ Préférences, file d'envoi avec reprise, rappels idempotents (SQL) ; échec d'un fournisseur (Deno).
- ⬜ Email Resend, push navigateur, push mobile réellement reçus ; planification pg_cron / pg_net ; rappel J-3 / J-1 de bout en bout.

### F. Multilingue
- ✅ `/en` rendu en anglais, titres localisés, contenu éditorial traduit (offre de test), `hreflang` dans le sitemap, `x-locale` non falsifiable.
- ⬜ **Relecture humaine des traductions anglaises** (obligatoire avant publication).

### G. Assistant voyage
- ✅ Tout ce qui se teste avec un faux moteur (voir § 1).
- ✅ Interface de l'assistant (Chromium, faux serveur) : réponse, fiche cliquable, message de limite.
- ⬜ Qualité des réponses avec le vrai modèle, exactitude des prix cités, refus hors sujet, **résistance à une consigne cachée dans un résumé de voyage**, coût réel.

### H. Mobile
- ⚠️ `tsc` seulement. ⬜ **Tout le reste** : aucun lancement sur appareil ou émulateur, aucun paiement, aucun QR scanné.

### I. Sécurité
- ✅ Un voyageur ne lit rien des réservations d'autrui ; `update` direct de `paid_xof` / `status` sans effet ; aucun paiement visible d'autrui ; organisateur : commission et prix verrouillés, ciblage d'offre limité à ses propres éléments ; stockage d'images : dossier propre accepté, dossier d'autrui / autre bucket / racine / simple utilisateur / anonyme refusés (schéma simulé) ; table des essais de codes illisible par les clients.
- ⬜ Mêmes contrôles contre la vraie API Supabase (politiques de stockage réelles, JWT réels).

## 3. Écarts trouvés pendant cette passe
**Aucun défaut dans le code livré.** Une **observation sur du code existant** (non modifié, à vérifier en recette) : le service worker `public/sw.js` laisse passer sans cache uniquement les hôtes `*.supabase.co` / `*.supabase.in` ; toute autre requête GET non HTML ni statique (dont les requêtes de données des pages Next.js lors d'une navigation, et un Supabase sur domaine personnalisé ou auto-hébergé) suit une stratégie « stale-while-revalidate » et peut donc servir une réponse périodiquement périmée (constaté avec le faux serveur sur 127.0.0.1 : la liste d'offres ne se rafraîchissait pas après l'enregistrement). Si la préproduction utilise un domaine Supabase personnalisé, ou si des pages semblent « en retard » après une action, élargir `shouldBypass` (ou exclure les réponses JSON). (Défauts trouvés et corrigés plus tôt au fil des modules : voir `docs/V2_AUDIT.md`.) Une réserve d'honnêteté : ces tests valident la logique et les garde-fous que j'ai moi-même écrits ; ils ne remplacent pas un regard extérieur ni un test avec de vrais fournisseurs.

## 4. Pour terminer la recette
1. Suivre `docs/RECETTE_V2.md` en préproduction en cochant les lignes ⬜ ci-dessus.
2. Me transmettre les écarts (message d'erreur, capture, ligne de la recette) : je corrige.
3. Ne pas passer en production avant : un paiement réel remboursé de bout en bout, la relecture anglaise et le test de l'assistant avec le vrai modèle.
