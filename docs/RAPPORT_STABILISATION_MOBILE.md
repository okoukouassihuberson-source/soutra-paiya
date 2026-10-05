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
