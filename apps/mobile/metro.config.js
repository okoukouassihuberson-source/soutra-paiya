// Configuration Metro : valeurs par défaut d'Expo. Depuis le SDK 52, Expo détecte seul le monorepo pnpm
// (watchFolders, nodeModulesPaths). Ne pas surcharger resolver.disableHierarchicalLookup : cela empêche
// un paquet de retrouver sa propre copie imbriquée d'une dépendance et peut charger la mauvaise version.
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
