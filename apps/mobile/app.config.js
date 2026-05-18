// ============================================================================
// Configuration Expo dynamique.
//
// Les tokens Mapbox sont injectés depuis l'ENVIRONNEMENT — ils ne figurent
// jamais dans le dépôt (app.json les garde vides).
//   - MAPBOX_DOWNLOAD_TOKEN : token secret « sk. » — téléchargement du SDK
//     Mapbox au moment du build natif.
//   - MAPBOX_PUBLIC_TOKEN   : token public « pk. » — rendu de la carte au
//     runtime (exposé via expo-constants > extra).
//
// Source des variables :
//   - EAS Build : variables d'environnement EAS (`eas env:create`).
//   - En local  : fichier apps/mobile/.env (ignoré par git).
// ============================================================================

module.exports = ({ config }) => {
  const downloadToken = process.env.MAPBOX_DOWNLOAD_TOKEN || '';
  const publicToken = process.env.MAPBOX_PUBLIC_TOKEN || '';

  // Réinjecte le token de téléchargement dans le plugin @rnmapbox/maps.
  const plugins = (config.plugins || []).map((plugin) => {
    if (Array.isArray(plugin) && plugin[0] === '@rnmapbox/maps') {
      return [
        '@rnmapbox/maps',
        { ...plugin[1], RNMapboxMapsDownloadToken: downloadToken },
      ];
    }
    return plugin;
  });

  return {
    ...config,
    plugins,
    extra: {
      ...config.extra,
      mapboxPublicToken:
        publicToken || (config.extra && config.extra.mapboxPublicToken) || '',
    },
  };
};
