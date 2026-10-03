// Point d'entrée : diagnostic de démarrage (dev uniquement) puis expo-router.
// Si un module de route échoue à l'évaluation, Metro avale l'erreur ("missing
// the required default export"). On liste ici les modules en erreur, avec leur
// nom de fichier, dans le terminal Metro (préfixe [DIAG]).
if (__DEV__) {
  const report = () => {
    try {
      const mods = typeof __r.getModules === 'function' ? __r.getModules() : null;
      if (!mods) return;
      let n = 0;
      mods.forEach((m, id) => {
        if (m && m.hasError && n < 8) {
          n += 1;
          const err = m.error;
          console.log(
            '[DIAG] module en erreur:',
            m.verboseName || id,
            '|',
            String(err && err.message),
            '|',
            String(err && err.stack).split('\n').slice(0, 6).join(' // '),
          );
        }
      });
      if (n === 0) console.log('[DIAG] aucun module marqué en erreur');
    } catch (e) {
      console.log('[DIAG] échec du diagnostic', String(e));
    }
  };
  setTimeout(report, 4000);
  setTimeout(report, 12000);
}

require('expo-router/entry');
