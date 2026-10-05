# Rapport de stabilisation — apps/mobile

Branche `claude/eloquent-bohr-clzpgf` (commits 1eff99c, c490209, cf74bb6). Aucun test sur appareil, aucun build EAS : voir §F.

## A. Problèmes
| # | Problème | Cause | Impact |
|---|---|---|---|
| 1 | Crash au démarrage (`Cannot read property 'prototype' of undefined`) | Versions JS/natives désalignées (@rnmapbox/maps, expo-speech-recognition, react-native-screens, expo-updates, datetimepicker), Metro avec `disableHierarchicalLookup` | App inutilisable. **Correction non confirmée** |
| 2 | `lib/supabase.ts` levait à l'import | Variables absentes → exception avant tout écran | Écran blanc |
| 3 | Pas d'état d'auth explicite | Booléens `loading`/`user` | Boucles de redirection, écran blanc |
| 4 | Réseau sans timeout, ni cache, ni déduplication | `fetch` brut | Requêtes bloquées, doublons, rien hors ligne |
| 5 | `select('*')`, listes non paginées | Écrans explore / destinations / venue | Données mobiles et mémoire |
| 6 | Photos envoyées en pleine taille + base64 complet | Options du picker | 4–6 Mo par photo, mémoire |
| 7 | Listes longues en `ScrollView` | Tout monté d'un coup | Lenteur sur Android d'entrée de gamme |
| 8 | Placeholders iOS dans `eas.json`, permissions Android non bloquées | Config incomplète | Soumission cassée, permissions superflues |
| 9 | Logs du scanner QR affichant le contenu du QR | `console.log` | Fuite de données de paiement |

## B. Corrections
1. Versions alignées sur `bundledNativeModules.json` (Expo 52) ; pins `@react-navigation/*` et `@supabase/supabase-js` à la racine ; Metro par défaut.
2. Supabase : plus d'exception, `supabaseConfigured`, `fetch` avec timeout.
3. Auth : machine à 4 états (vérification / connecté / déconnecté / erreur) + écran d'erreur avec réessai.
4. `ErrorBoundary` de route, handler global en production, écran de démarrage.
5. `lib/net.ts` (NetInfo), `lib/query-cache.ts` (déduplication, TTL mémoire, persistance AsyncStorage, données périmées en cas d'erreur) + test.
6. `OfflineBanner` (« Hors connexion », « Connexion faible »), `StateView` (chargement/vide/erreur/réessai), `RemoteImage`.
7. Colonnes explicites et cache : explore, destinations, venue, `lib/tourism.ts`.
8. `compressAsset` (1280 px, 512 px pour l'avatar, JPEG 0,7) branché sur 10 points d'upload.
9. `FlatList` : fil social, commandes, réservations hôtel, réservations voyages/activités, splits, chat.
10. `eas.json` / `app.json` : bloc iOS placeholder retiré, `blockedPermissions` Android.
11. `console.log` du scanner retirés ; `zod` retiré du mobile.

## C. Optimisations
Moins de données (colonnes, compression), moins de requêtes (déduplication, cache), moins de mémoire (virtualisation, plus de base64 pleine taille).

## D. Compatibilité
| Cible | État |
|---|---|
| Expo Go | OK sauf carte Mapbox, recherche vocale, push distant |
| Dev build | Requis pour `@rnmapbox/maps`, `expo-speech-recognition` — à reconstruire |
| EAS Preview / Production | NON TESTÉ — nécessite exécution dans l'environnement du projet. |

Détail par module : `docs/MOBILE_BUILD.md`.

## E. Commandes (depuis `apps/mobile`)
```
git pull && pnpm install
npx expo-doctor
npx expo start --clear                                   # Expo Go
eas build --profile development --platform android      # dev build
npx expo start --dev-client --clear
eas build --profile preview --platform android           # APK
eas build --profile production --platform android        # AAB
```

## F. Vérifié / non vérifié
Vérifié dans le sandbox : `tsc --noEmit` (mobile, web, shared), tests organizer 12/12, lib 4/4, i18n 7/7, `expo export --platform android` (bundle Hermes généré).

NON TESTÉ — nécessite exécution dans l'environnement du projet :
- démarrage sur appareil (le crash est-il résolu ?), navigation, auth, réseau coupé/lent, cycle de vie, images, uploads ;
- `npx expo-doctor`, `eas build` (development, preview, production) ;
- index et RLS Supabase ; `select('*')` restants (lib/organizer.ts ×2, lib/tourism.ts ×5, lignes uniques, laissés volontairement) ;
- `ScrollView` conservés volontairement : wallet (15 transactions max), trending (20 à 50 éléments), search (résultats groupés plafonnés) ; tickets est passé en FlatList.

À faire côté utilisateur : reconstruire le dev client, envoyer les lignes `[DIAG]` si le crash persiste, redéployer Vercel, appliquer la migration 0096. Retirer les logs `[DIAG]` de `index.js` une fois le crash réglé.

## G. Audit Supabase — index et RLS (analyse statique des migrations 0001 → 0096)
Méthode : lecture des migrations, pas d'accès à la base de production. Les tables créées hors historique de migrations (ex. `orders`, certaines colonnes) n'ont pas pu être vérifiées. **NON TESTÉ sur la base réelle** : exécuter la requête de contrôle ci-dessous.

**Index (corrigé — `0097_fk_indexes.sql`)** : 11 index ajoutés sur des clés étrangères/filtres utilisés par l'app (`transactions.counterparty_id`, `chat_members.user_id`, `favorites.venue_id`, `events/activities.venue_id`, `reviews.user_id`, `follows.followed_id`, `sos_alerts.user_id`, `loyalty_reward_redemptions.user_id`, `tourism_offers.trip_id/activity_id`). Migration rejouée deux fois sur un Postgres 16 de test (tables factices) : syntaxe et idempotence OK. Les autres FK sans index sont de faible volume (colonnes `created_by`, `decided_by`, `resolved_by`…) et laissées.

**RLS — vérifié OK** : les 85 tables ont la RLS activée (les 16 signalées par une première analyse l'activent bien dans 0022, 0041, 0050, 0082, 0087) ; aucune policy d'écriture en `using (true)` ; aucune fonction `security definer` sans `search_path` ; les 7 tables sans policy (`payment_pins`, `push_tokens`, `notification_outbox`…) ne sont lues par aucun client, donc « tout refusé sauf service_role » est le comportement voulu ; wallets/transactions n'ont plus de policy d'écriture client.

**RLS `profiles` — corrigé dans `supabase/pending/0098_profiles_rls.sql` (à appliquer EN DERNIER : le déplacer dans `supabase/migrations/` puis `supabase db push`)** : `profiles_select_public` (`using (true)`) rendait toute la table lisible sans connexion (téléphone, e-mail, KYC, rôle). Désormais :
- `profiles` n'est lisible que par soi-même, les admins et les modérateurs (`anon` : rien) ;
- vues `public_profiles` (nom, avatar, bio, ville…) et `discoverable_profiles` (profils ayant activé la découverte) pour tout ce qui est public ;
- RPC `find_profile_by_phone` (envoi P2P) et `reservation_contacts` (un gérant ne voit que les coordonnées de SES clients) ;
- `discover_profiles`, `list_my_matches`, `list_my_chats`, `list_active_stories`, `get_event_detail` lisent les vues (restent `security invoker`, pas d'élévation de privilège) ;
- clients adaptés : plus de jointure `profiles(...)` (avis, demandes d'argent, splits, transactions) ni de lecture directe des autres profils ; le téléphone n'est plus affiché comme nom de repli (fil social, commentaires, chat, stories).

Testé : sur un Postgres 16 avec schéma factice (tables, `auth.uid()`, rôles anon/authenticated) — un utilisateur ne voit que sa ligne dans `profiles` mais les 4 noms dans `public_profiles`, ne peut pas lire le téléphone d'un autre, `discover_profiles` renvoie les profils découvrables, un gérant voit les coordonnées de son client et pas celles d'un inconnu, l'admin voit tout, `anon` ne voit rien dans `profiles` et ne peut pas appeler les RPC. **NON TESTÉ** : sur la vraie base (les 5 fonctions et les tables hors historique de migrations), ni via PostgREST/l'app.

**Ordre de déploiement obligatoire** : (1) déployer le web (Vercel) et publier l'app mobile ; (2) appliquer `0097` puis `0098`. Les anciennes versions de l'app afficheraient des noms vides (auteurs, destinataires, avis) dès que 0098 est appliquée. Retour arrière : `create policy "profiles_select_public" on public.profiles for select using (true);`.

Contrôle à lancer sur la base réelle (SQL editor Supabase) :
```sql
-- tables sans RLS
select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' and not c.relrowsecurity;
-- FK sans index couvrant
select conrelid::regclass, a.attname from pg_constraint k
join pg_attribute a on a.attrelid=k.conrelid and a.attnum=k.conkey[1]
where k.contype='f' and not exists (select 1 from pg_index i where i.indrelid=k.conrelid and i.indkey[0]=k.conkey[1]);
```
