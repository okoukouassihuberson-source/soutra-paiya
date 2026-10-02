# SOUTRA PLAYCE V2 — Audit du système existant et feuille de route

*Règle appliquée : EXISTE → AMÉLIORER · PARTIEL → COMPLÉTER · ABSENT → AJOUTER · FONCTIONNE → NE PAS CASSER.*

## 1. Architecture constatée (conservée telle quelle)
- Monorepo pnpm : `apps/web` (Next.js 14, PWA, landing + espaces Pro/Admin + pages publiques), `apps/mobile` (Expo, application utilisateur principale), `packages/shared` (types, catégories, thème), `supabase/` (81 migrations, 27 Edge Functions).
- Backend : Supabase (Postgres + RLS + RPC `security definer`, Auth OTP, Storage). Paiements : Paystack **et** GeniusPay (Edge Functions `*-pay-booking`, `*-pay-order`, `*-pay-ticket`, webhooks). Cartes : Leaflet (web) / Mapbox (mobile). IA : Edge Functions `chatbot`, `search-nl`.
- Rôles existants : `user, venue_owner, organizer, staff, admin` (+ `moderator`, `is_super_admin`).

## 2. Matrice fonctionnalités (cahier des charges → état réel)
| Domaine | État | Détail / action |
|---|---|---|
| Hébergement (hôtel, villa, résidence, resort, auberge) | **EXISTE** | `venues.category`, `rooms`, `room_bookings` (anti-chevauchement GiST), paiement. Réutilisé. |
| Restauration (restaurant, maquis, bar, lounge…) | **EXISTE** | `reservations` + acompte. |
| Sites touristiques, plages, parcs, musées | **EXISTE** | catégories `parc, musee, monument, attraction, beach` (fiche info). |
| Événements + billets QR + scan | **EXISTE** | `events`, `tickets`, RPC 0077, mobile `scan.tsx`. |
| Avis, modération, note moyenne, signalement | **EXISTE** | migration 0076 (photos d'avis à vérifier). |
| Favoris | **EXISTE** | table `favorites`, mobile `favorites.tsx`. |
| Notifications internes + push | **EXISTE** | 0079/0080, `send-push`, `push_tokens`. Email/WhatsApp : **ABSENT**. |
| Codes promo | **EXISTE** | `promo_codes` (0015/0038). Offres flash/early booking/groupe : **ABSENT**. |
| Abonnements pros, monétisation, mise en avant | **EXISTE/PARTIEL** | `subscriptions`, `monetization_*`. Commission configurable par catégorie : à compléter. |
| Fidélité, Splits, Wallet, Social | **EXISTE** | hors périmètre tourisme, **conservés**. |
| Admin dashboard | **EXISTE/PARTIEL** | `/admin` (onglets). Stats tourisme (voyages, destinations) : **ABSENT**. |
| Espace Pro | **EXISTE** | `/pro`, création d'établissement. Types agence/guide/transporteur : **ABSENT**. |
| IA assistant | **EXISTE** | `chatbot`, `assistant.tsx`. À brancher sur voyages/destinations (jamais d'invention de prix). |
| Page d'accueil touristique | **ABSENT → AJOUTÉ** | voir §3. |
| Destinations | **ABSENT → AJOUTÉ** | |
| Voyages groupés nationaux / internationaux | **ABSENT → AJOUTÉ** | |
| Formules (Essentielle/Confort/Premium/VIP/custom) | **ABSENT → AJOUTÉ** | `trip_packages`. |
| Circuits (jour par jour) | **ABSENT → AJOUTÉ** | `trips.is_circuit` + `trip_itineraries`. |
| Recherche globale + filtres | **AJOUTÉ (phase 2)** | `/explorer` : ville, commune, quartier, catégorie, prix, note, 10 services, ouvert maintenant, paiement en ligne, disponibilité hôtelière (dates), distance (« Près de moi »), tri, pagination serveur, vue carte. « Région » : non modélisé (couvert par ville/commune). |
| SEO (sitemap, robots, JSON-LD, OG) | **PARTIEL → COMPLÉTÉ** | `sitemap.xml`, `robots.txt`, JSON-LD `TouristTrip/TouristDestination`, métadonnées. |
| Marketplace d'activités | **AJOUTÉ (phase 2)** | `/activites`, fiche + créneaux + réservation + paiement + billet QR + avis ; espace organisateur/guide ; admin. Voir §3 sexies. |
| Multilingue FR/EN | **ABSENT** | phase 3 (i18n sur les nouvelles pages). |
| Billet QR des voyages | **AJOUTÉ (phase 2)** | `/mes-voyages/[id]` (QR généré localement) + `/scan-voyage` (caméra ou saisie). Mobile : à faire. |
| Paiement des voyages (acompte/solde/reçu) | **AJOUTÉ (phase 2, GeniusPay)** | Edge Function `geniuspay-pay-trip`, `trip_payments` (reçus). Paystack non étendu (comme les billets 0077). |

## 3. Livré dans cette phase (1)
1. **Migration `0082_tourism_foundation.sql`** (100 % additive, aucune table existante modifiée) : `destinations`, `trips`, `trip_itineraries`, `trip_packages`, `trip_bookings`, rôle `guide`. RLS : lecture publique des voyages publiés ; l'organisateur gère ses voyages en brouillon (la publication, les compteurs de places et la commission sont verrouillés par trigger → modération admin) ; `trip_bookings` sans écriture directe, uniquement via RPC (`create_trip_booking` avec verrou de ligne anti-surbooking et prix calculé côté serveur, `cancel_trip_booking`, `scan_trip_ticket`).
2. **`packages/shared/src/tourism.ts`** : types, catalogue des catégories de l'accueil, formules par défaut, continents, villes.
3. **Web** : accueil touristique (hero + recherche + 12 catégories + destinations + voyages à la une), `/explorer`, `/destinations`, `/destinations/[slug]` (« Explorer une destination » : voyages, hébergements, restaurants, bars, plages, sites, activités, événements, galerie, carte), `/voyages/nationaux`, `/voyages/internationaux`, `/voyages/[slug]` (programme, inclusions, formules, réservation), navigation principale + barre mobile, `sitemap.xml`, `robots.txt`.
4. **Données de démo** : `supabase/seed-dev-tourism.sql` (hors migrations, dev uniquement).

## 3 bis. Livré en phase 2 (paiement + billet QR)
1. **Migration `0083_trip_payments.sql`** (additive) : `trip_payments` (reçus), `get_trip_booking_payment_info` (montant acompte/solde/total calculé côté serveur), `geniuspay_settle_trip_booking` (idempotent, plafonné au total), branche `trip_booking` dans `geniuspay_settle_charge` (version 0077 conservée), expiration des impayés après 24 h (libère les places), annulation client refusée si de l'argent a été encaissé (`REFUND_REQUIRED`), scan QR enrichi (voyageur, solde dû), helpers RLS anti-récursion.
2. **Correctif de sécurité sur 0082** (dans 0083) : le garde `tg_trips_guard` était inopérant (`security definer`) ; un organisateur pouvait publier son voyage ou fixer ses compteurs/commission.
3. **Edge Function `geniuspay-pay-trip`**, branchement du callback web `sp-trp-`.
4. **Web** : `/mes-voyages`, `/mes-voyages/[id]` (billet QR, paiements, reçus, acompte/solde, annulation), `/scan-voyage`.
5. **Tests** : 0082+0083 exécutées sur PostgreSQL 16 (schéma Supabase simulé) : surbooking, falsification des compteurs, RLS, acompte → solde → payé, idempotence, double scan, expiration, annulation. Le webhook/GeniusPay réel n'a pas été testé (pas d'accès aux clés).

## 3 ter. Livré en phase 2 (administration)
1. **Migration `0084_admin_tourism.sql`** : `admin_moderate_trip` (publier / clore / annuler avec transitions contrôlées, commission, mise en avant À LA UNE / POPULAIRE / NOUVEAU / PROMOTION / COUP DE CŒUR / RECOMMANDÉ, trace dans `audit_events`) et `admin_tourism_stats` (voyages, réservations nationales/internationales, places vendues, CA encaissé, reste à encaisser, commissions estimées, encaissements par mois, top destinations). Réservées aux admins.
2. **Admin** (`/admin?tab=trips` et `?tab=destinations`) : tableau de bord tourisme, création de voyages (programme et formules en saisie rapide), modération, création/mise à la une/masquage de destinations. Images par URL (pas encore d'upload).
3. Testé sur PostgreSQL 16 (droits, transitions, valeurs invalides, statistiques, audit).

## 3 quater. Livré en phase 2 (espace organisateur)
1. **Migration `0085_organizer_space.sql`** : `submit_trip_for_review` (couverture et contact requis, trace d'audit), garde `trips` durci (un voyage publié est verrouillé pour son organisateur : seules « clore les ventes » et, sans paiement encaissé, « annuler » sont permises ; modifier un brouillon soumis le retire de la file), `get_organizer_dashboard`, `get_organizer_trip_bookings`.
2. **`/organisateur`** : chiffres (réservations, places vendues, encaissé, reste à encaisser), création/modification de brouillons, soumission à validation, clôture des ventes, liste des voyageurs par voyage, accès au scan de billets. Réservé aux rôles organisateur / propriétaire / guide / admin.
3. **Éditeur de voyage partagé** (`components/tourism/TripEditor.tsx`) : également utilisé dans l'admin (bouton « Modifier », qui lève la limite « pas de modification » de la section précédente). Brouillons soumis affichés en tête de file admin.
4. **Attribution du rôle** : bouton « → Organisateur » dans l'onglet Utilisateurs de l'admin (pas d'auto-inscription : volontaire, pour éviter l'escalade de rôle).
5. Testé sur PostgreSQL 16 : soumission, verrouillage, annulation avec paiements refusée, accès aux voyageurs réservé à l'organisateur, RPC de réservation toujours fonctionnelles. Bug trouvé et corrigé en test : la colonne générée `duration_days` est NULL dans `NEW` pendant un trigger BEFORE.

## 3 quinquies. Livré en phase 2 (recherche avancée + carte)
1. **Migration `0086_explorer_search.sql`** : RPC `search_venues_explorer` (filtres, tri, pagination, `total_count`, distance PostGIS, disponibilité des chambres sur période, services via liste fermée de motifs — aucune expression régulière fournie par le client) + index trigramme sur nom/quartier. `security invoker` : la RLS de `venues` s'applique.
2. **Web** : filtres en formulaire GET (état dans l'URL, partageable, sans JS hormis la géolocalisation), bascule Liste/Carte, carte Leaflet/OpenStreetMap avec fiche rapide (photo, note, prix, « Voir la fiche », « Itinéraire »), distance affichée sur les cartes. Les pages filtrées sont `noindex`.
3. **Tests** : RPC sur PostgreSQL 16 + PostGIS (18 scénarios : services, injection, prix, note, catégories, casse, texte, distance, rayon, tris, disponibilité, dates/coordonnées invalides, pagination) ; 20 000 lieux : recherche texte 20 ms (index trigramme utilisé), recherche par distance 54 ms. Interface vérifiée dans Chromium sur une API simulée (mobile et desktop). Défauts trouvés et corrigés : champs sans bordure (classe `border` manquante, y compris dans les formulaires de réservation et de scan) et barre de navigation qui se cassait sur deux lignes.
4. Limites : tuiles OpenStreetMap non vérifiables depuis le bac à sable ; la carte affiche au plus 100 résultats ; les « services » reposent sur les étiquettes saisies par les professionnels (texte libre).

## 3 sexies. Livré en phase 2 (activités touristiques)
1. **Migration `0087_activities.sql`** : `activities`, `activity_slots` (capacité par créneau), `activity_bookings`, `activity_payments` (reçus), `activity_reviews` + `activity_review_reports`. RPC : `create_activity_booking` (verrou du créneau, anti-surbooking, libération des impayés après 1 h, clôture 1 h avant le départ), `cancel_activity_booking` (jamais d'annulation silencieuse d'un montant payé), paiement (`get_activity_booking_payment_info`, `geniuspay_settle_activity_booking`, branche `activity_booking` dans `geniuspay_settle_charge`), `scan_activity_ticket` (fenêtre horaire), `submit_activity_review` (uniquement après une activité réellement vécue), signalement et modération des avis, `submit_activity_for_review`, `admin_moderate_activity`, tableaux de bord organisateur/admin, `list_activities` (filtres, date, prix, tri, pagination). Note moyenne recalculée automatiquement.
2. **Sécurité** : un voyageur lit ses réservations ; l'organisateur (rôles organisateur, propriétaire, **guide**, admin) gère ses activités ; une activité publiée est verrouillée (seules la pause et la reprise d'une activité déjà approuvée sont permises) ; compteurs, note, commission et mise en avant réservés à l'admin ; aucune écriture directe sur réservations, paiements et avis.
3. **Web** : `/activites` (filtres, catégories, date), `/activites/[slug]` (créneaux groupés par jour, réservation, avis, signalement, JSON-LD), `/mes-activites` (billet QR, paiement, annulation, avis), onglet Activités dans `/organisateur` (éditeur, générateur de créneaux, participants), onglet Activités dans l'admin (publication, commission, mise en avant, avis signalés), accueil et pages destination, sitemap, scanner unifié voyages/activités.
4. **Edge Function** `geniuspay-pay-activity` (préfixe `sp-act-`, retour sur `/mes-activites/[id]`).
5. **Tests** : 17 scénarios sur PostgreSQL 16 (droits, verrouillage, surbooking, expiration, paiement idempotent, scan, avis, modération, liste publique). Interface vérifiée dans Chromium sur une API simulée (liste, fiche, choix de créneau, total, invitation à se connecter).
6. Limites : avis sans photos (champ non prévu pour l'instant) ; images d'activités par URL ; paiement GeniusPay non testé de bout en bout (pas de clés) ; paiement intégral uniquement (pas d'acompte) ; pas encore de notifications ; scan mobile natif non fait.

## 4. Feuille de route
- **Reste de la phase 2 (non fait)** : écran mobile des voyages ; suppression d'un voyage côté admin ; upload d'images (aujourd'hui par URL) ; notifications aux organisateurs (soumission, nouvelle réservation).
- **Phase 3** : i18n FR/EN ; notifications voyages (rappel, solde à payer) + email ; promotions (early booking, groupe) ; commissions configurables ; assistant IA branché sur `trips`/`destinations` (données uniquement) ; app mobile (onglets Voyages/Destinations).

## 5. Déploiement / précautions
- Déployer : `supabase db push` puis `supabase functions deploy geniuspay-pay-trip`. Appliquer 0082 puis 0083 (testée uniquement par relecture statique ici : **à exécuter d'abord sur un environnement de préproduction**). Régénérer les types : `pnpm db:types`.
- Ne jamais exécuter `seed-dev-tourism.sql` en production.
- Variables d'environnement : aucune nouvelle. `NEXT_PUBLIC_SITE_URL` recommandée pour sitemap/OG.
