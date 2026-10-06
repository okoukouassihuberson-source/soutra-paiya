# Mobile — compatibilité Expo Go, builds EAS, commandes

## Classement des modules natifs (SDK 52)
| Module | Expo Go | Remarque |
|---|---|---|
| expo-router, expo-image-picker, expo-image-manipulator, expo-file-system, expo-camera, expo-location, expo-notifications (locales), expo-linking, expo-constants, @react-native-async-storage, @react-native-community/netinfo, react-native-svg, reanimated, gesture-handler, datetimepicker | OUI | |
| expo-notifications (push distant) | NON (SDK 53+) / limité | Dev build |
| @rnmapbox/maps | NON | **Dev build / EAS** (code natif Mapbox + token de téléchargement) |
| expo-speech-recognition | NON | **Dev build / EAS** (la recherche vocale doit rester optionnelle) |
| expo-updates (OTA) | inactif | Actif uniquement en build EAS |
| expo-build-properties | plugin seulement | Build natif |

## Commandes (depuis `apps/mobile`)
- Expo Go (sans carte Mapbox ni micro) : `npx expo start --clear`
- Dev build : `eas build --profile development --platform android` puis `npx expo start --dev-client --clear`
- APK de test : `eas build --profile preview --platform android`
- AAB production : `eas build --profile production --platform android`
- Vérifs : `npx tsc --noEmit`, `pnpm test:organizer`, `pnpm test:lib`, `pnpm test:i18n`, `npx expo-doctor`, `npx expo export --platform android`

## Variables
Voir `.env.example`. Aucun secret serveur dans le mobile (anon key publique uniquement ; `MAPBOX_DOWNLOAD_TOKEN` n'est utilisé qu'au build EAS).
