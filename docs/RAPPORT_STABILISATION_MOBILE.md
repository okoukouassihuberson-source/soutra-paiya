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

**RLS — point à traiter (NON corrigé volontairement)** : `profiles_select_public` (`using (true)`, 0001) rend **toute la table `profiles` lisible, y compris sans connexion** avec la clé anon : `phone`, `email`, `kyc_id_number`, `kyc_id_type`, `kyc_doc_url`, `role`. Les PIN ont été déplacés dans `payment_pins` (privé), mais les données KYC et téléphones restent exposées.
Pourquoi pas corrigé ici : un `revoke select (colonnes)` fait échouer tout `select('*')` sur `profiles`, et l'app lit ces colonnes pour l'utilisateur lui-même (`kyc.tsx`) et pour l'admin web. Correctif proposé, à faire avec une base de test :
1. vue `public_profiles (id, full_name, avatar_url, bio, city)` pour l'affichage des auteurs, avis, etc. ;
2. policy `select` limitée à `id = auth.uid() or is_admin() or is_moderator()` sur `profiles` ;
3. RPC `security definer` pour la recherche par téléphone (déjà couverte par `search_my_universe`) ;
4. migrer les requêtes de l'app qui joignent `profiles` (`author:user_id(...)`, wallet, chat) vers la vue.

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
