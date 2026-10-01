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
| Recherche globale + filtres | **PARTIEL → COMPLÉTÉ (base)** | `/explorer` (texte, ville, catégorie, pagination). Filtres prix/note/équipements/distance/carte : phase 2. |
| SEO (sitemap, robots, JSON-LD, OG) | **PARTIEL → COMPLÉTÉ** | `sitemap.xml`, `robots.txt`, JSON-LD `TouristTrip/TouristDestination`, métadonnées. |
| Marketplace d'activités | **ABSENT** | phase 2. |
| Multilingue FR/EN | **ABSENT** | phase 3 (i18n sur les nouvelles pages). |
| Billet QR des voyages | **PARTIEL** | jeton `qr_token` + RPC `scan_trip_ticket` prêts ; écran billet/scan à brancher. |
| Paiement des voyages (acompte/solde/reçu) | **PARTIEL** | réservation + montants prêts ; Edge Function `*-pay-trip` à créer sur le modèle `geniuspay-pay-booking`. |

## 3. Livré dans cette phase (1)
1. **Migration `0082_tourism_foundation.sql`** (100 % additive, aucune table existante modifiée) : `destinations`, `trips`, `trip_itineraries`, `trip_packages`, `trip_bookings`, rôle `guide`. RLS : lecture publique des voyages publiés ; l'organisateur gère ses voyages en brouillon (la publication, les compteurs de places et la commission sont verrouillés par trigger → modération admin) ; `trip_bookings` sans écriture directe, uniquement via RPC (`create_trip_booking` avec verrou de ligne anti-surbooking et prix calculé côté serveur, `cancel_trip_booking`, `scan_trip_ticket`).
2. **`packages/shared/src/tourism.ts`** : types, catalogue des catégories de l'accueil, formules par défaut, continents, villes.
3. **Web** : accueil touristique (hero + recherche + 12 catégories + destinations + voyages à la une), `/explorer`, `/destinations`, `/destinations/[slug]` (« Explorer une destination » : voyages, hébergements, restaurants, bars, plages, sites, activités, événements, galerie, carte), `/voyages/nationaux`, `/voyages/internationaux`, `/voyages/[slug]` (programme, inclusions, formules, réservation), navigation principale + barre mobile, `sitemap.xml`, `robots.txt`.
4. **Données de démo** : `supabase/seed-dev-tourism.sql` (hors migrations, dev uniquement).

## 4. Feuille de route
- **Phase 2** : filtres avancés + carte (Leaflet) sur `/explorer` ; activités (table `activities` + réservation) ; `*-pay-trip` (acompte/solde/reçu) + billet QR + scan organisateur ; écran « Mon espace » (réservations de voyages) ; admin CRUD destinations/voyages + modération + stats ; espace organisateur (création de voyages).
- **Phase 3** : i18n FR/EN ; notifications voyages (rappel, solde à payer) + email ; promotions (early booking, groupe) ; commissions configurables ; assistant IA branché sur `trips`/`destinations` (données uniquement) ; app mobile (onglets Voyages/Destinations).

## 5. Déploiement / précautions
- Appliquer la migration : `supabase db push` (testée uniquement par relecture statique ici : **à exécuter d'abord sur un environnement de préproduction**). Régénérer les types : `pnpm db:types`.
- Ne jamais exécuter `seed-dev-tourism.sql` en production.
- Variables d'environnement : aucune nouvelle. `NEXT_PUBLIC_SITE_URL` recommandée pour sitemap/OG.
