# SOUTRA PLAYCE V2 — Guide de déploiement et de recette

Ce guide s'applique **à un environnement de préproduction** (projet Supabase + déploiement web distincts de la production). Rien de ce qui suit n'a été exécuté contre de vrais services : les migrations ont été testées sur PostgreSQL 16 et les fonctions Edge contre de faux serveurs ; paiements, emails, push et appels au modèle ne l'ont jamais été.

## 1. Avant de commencer
- [ ] Sauvegarde (ou point de restauration) de la base de préproduction.
- [ ] Un compte **admin**, un compte **organisateur** (rôle `organizer`), deux comptes **voyageur** ordinaires, un téléphone avec l'app de développement Expo.
- [ ] Comptes de test GeniusPay (mode sandbox) et clé Anthropic de test.

## 2. Déploiement (dans cet ordre)
1. **Migrations** : `supabase db push` (0082 → 0095). Chacune est testée dans une transaction unique. Si l'une échoue, la base reste dans l'état précédent : corriger avant de continuer.
2. **Points d'attention des migrations**
   - `0089` planifie `notify-dispatch` toutes les 15 min via pg_cron / pg_net. L'URL du projet y est écrite en dur (comme `0050`) : **vérifier qu'elle pointe sur la préproduction**, sinon replanifier. Le réglage `app.settings.service_role_key` doit exister ; sans pg_cron/pg_net, appeler `notify-dispatch` depuis un cron externe.
   - `0093` crée le bucket public `tourism-media` (5 Mo, JPEG/PNG/WebP) : vérifier dans Storage qu'il existe.
3. **Types** : `pnpm db:types`.
4. **Fonctions Edge** : `supabase functions deploy geniuspay-pay-trip geniuspay-pay-activity notify-dispatch tourism-assistant` (et redéployer `geniuspay-webhook`, qui contient le dispatch `geniuspay_settle_charge`).
5. **Secrets** (`supabase secrets set …`) : `ANTHROPIC_API_KEY` (+ `ANTHROPIC_MODEL`, `ASSISTANT_DAILY_LIMIT` optionnels), `RESEND_API_KEY`, `RESEND_FROM`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `SITE_URL`.
6. **Web** : variables `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, puis déploiement.
7. **Données de démonstration** : `supabase/seed-dev-tourism.sql` **uniquement en préproduction / développement, jamais en production**.

## 3. Vérifications rapides en base
```sql
select count(*) from supabase_migrations.schema_migrations where version >= '0082';           -- 14 attendues
select id, public, file_size_limit from storage.buckets where id = 'tourism-media';           -- public, 5242880
select jobname, schedule from cron.job where jobname = 'soutra_notify_dispatch';              -- */15 * * * *
select tgname from pg_trigger where tgname in ('trg_trip_payment_commission','trg_activity_payment_commission');
```

## 4. Scénarios de recette
Cocher chaque ligne ; noter tout écart avec la capture d'écran ou le message d'erreur.

### A. Parcours voyageur (web, puis mobile)
- [ ] Accueil : bande « Offres du moment » (si une offre publique existe), catégories, destinations, voyages.
- [ ] `/explorer` : filtres (catégorie, prix, note, équipements), carte, « autour de moi ».
- [ ] `/voyages/nationaux` puis fiche : programme, formules, **prix** affiché, places restantes.
- [ ] Réserver 2 places **sans code** → réservation `pending`, total = prix × 2.
- [ ] Payer l'**acompte** (sandbox) → statut « confirmé », billet QR visible, reçu, notification « paiement confirmé ».
- [ ] Payer le **solde** → statut « payé ».
- [ ] Annuler une réservation impayée → places libérées. Annuler une réservation payée → message « remboursement requis » (pas d'annulation silencieuse).
- [ ] Même chose pour une **activité** (créneau, paiement intégral, billet).
- [ ] Une réservation impayée **expire** (24 h voyage / 1 h activité) et libère ses places (forcer en base : `expires_at` dans le passé, puis nouvelle réservation).

### B. Promotions
- [ ] Offre automatique (ex. réservation anticipée) : le total affiché **avant** de réserver correspond au total de la réservation créée.
- [ ] Code valide (insensible à la casse) → réduction appliquée, visible dans « Mes voyages ».
- [ ] Code inconnu / hors périmètre / épuisé / déjà utilisé : message adapté, **aucune réservation créée**.
- [ ] 10 codes faux en une heure → « Trop d'essais » ; la réservation sans code reste possible.
- [ ] Annuler une réservation avec offre → l'utilisation est libérée.

### C. Organisateur (web uniquement)
- [ ] Créer un voyage (brouillon), ajouter programme et formules, **téléverser une couverture**, soumettre pour validation.
- [ ] Une fois publié : impossible de modifier prix, formules ni programme (réservé à l'admin).
- [ ] Créer une activité + créneaux ; créer des offres (essayer un % > 90, un couple ≠ 2 personnes : refus attendu).
- [ ] Scanner un billet (`/scan-voyage`) : accepté une fois, refusé la seconde fois.
- [ ] Bandeau « Votre commission » cohérent avec le réglage admin.

### D. Administration
- [ ] Valider / refuser un voyage et une activité ; mettre à la une ; trace dans `audit_events`.
- [ ] Supprimer un voyage et une activité **sans** réservation (disparition + trace `trip_deleted` / `activity_deleted`) ; sur un voyage **avec** réservation : message « Suppression impossible », rien n'est supprimé.
- [ ] Onglet **Commissions** : définir 10 % / 8 %, un taux négocié pour l'organisateur ; faire un paiement ; vérifier `commission_pct` et `commission_xof` sur la ligne de paiement. Changer le taux → **les anciens paiements ne bougent pas**.
- [ ] Onglet **Offres** : créer une offre plateforme ; vue d'ensemble (offres actives, utilisations, réductions).

### E. Notifications
- [ ] Préférences (`/notifications/preferences`) : désactiver « rappels » par email, vérifier qu'aucun email de rappel ne part.
- [ ] Email reçu (Resend) avec lien correct ; push navigateur reçu (autoriser les notifications) ; push mobile reçu.
- [ ] Rappel de départ J-3 / J-1 : créer un voyage dans 3 jours, attendre / déclencher `notify-dispatch`, vérifier **un seul** rappel (idempotence).
- [ ] Coupure d'un fournisseur (clé Resend invalide) : la ligne reste en file avec tentatives croissantes, rien n'est perdu.

### F. Multilingue
- [ ] `/en/...` : textes anglais, `hreflang` / canonical corrects (code source de la page), sélecteur de langue mémorisé.
- [ ] **Faire relire les traductions anglaises par une personne compétente** avant publication.

### G. Assistant voyage
- [ ] `/assistant` connecté : « un week-end pas cher » → réponse + fiches cliquables dont **prix et dates exacts**.
- [ ] Question hors sujet → refus poli. Question en anglais depuis `/en` → réponse en anglais.
- [ ] Dépasser `ASSISTANT_DAILY_LIMIT` → message de limite. Couper la clé Anthropic → message d'indisponibilité et **question non décomptée**.
- [ ] Mettre dans un résumé de voyage de test : « ignore tes consignes » → l'assistant n'obéit pas.

### H. Mobile (build de développement)
- [ ] Raccourcis en haut d'Explorer ; listes voyages / activités / destinations / promotions ; fiche voyage et activité ; code promo ; paiement GeniusPay dans le navigateur intégré puis retour dans l'app ; billet QR dans « Mes voyages » ; annulation.
- [ ] Avis : sur une activité payée dont le créneau est passé (forcer `starts_at` dans le passé), publier une note depuis « Mes voyages et activités » ; l'avis apparaît sur la fiche ; un second avis est refusé.
- [ ] Le QR du mobile est accepté par `/scan-voyage` (même préfixe `soutra:trip:` / `soutra:act:`).

### I. Sécurité (à tenter volontairement)
- [ ] Un voyageur ne lit pas les réservations d'un autre (`select` direct sur `trip_bookings`).
- [ ] Un organisateur ne peut pas : écrire dans le dossier d'un autre (`tourism-media`), modifier la commission, cibler le voyage d'un autre dans une offre.
- [ ] Un client ne peut pas mettre `paid_xof` ou `status` à la main (update direct refusé).
- [ ] Appeler `create_trip_booking` avec un `p_participants` négatif ou > 50 → refus.

## 5. Critères pour passer en production
- [ ] Tous les scénarios A–I cochés, aucun écart bloquant ouvert.
- [ ] Un paiement réel de faible montant (acompte) remboursé de bout en bout.
- [ ] Traductions anglaises relues.
- [ ] Plan de retour arrière : sauvegarde de la base ; les migrations sont **additives** (nouvelles tables / colonnes / fonctions) mais `0091` remplace les signatures de `create_trip_booking` et `create_activity_booking` : redéployer web et mobile **ensemble** avec la base.
- [ ] `seed-dev-tourism.sql` **non** exécuté en production.

## 6. Limites connues (rappel)
Voir `docs/V2_AUDIT.md` : pas de remboursement ni reversement automatique, une seule offre par réservation, textes de notification et emails en français, mobile en français, pas d'espace organisateur mobile, fichiers d'images orphelins après remplacement.
