# Tests post-déploiement — soutra-paiya.vercel.app

Procédures de validation à exécuter **après chaque déploiement majeur** sur la prod web. Sert de checklist d'acceptance.

---

## 1. Lighthouse mobile — score ≥ 90

### Procédure (Chrome DevTools)

1. Ouvrir https://soutra-paiya.vercel.app dans **Chrome desktop** (en mode Incognito → évite l'influence des extensions et du cache utilisateur)
2. DevTools (`F12` ou `Ctrl+Shift+I`)
3. Onglet **Lighthouse**
4. Cocher :
   - ☑️ **Performance**
   - ☑️ **Accessibility**
   - ☑️ **Best Practices**
   - ☑️ **SEO**
   - ☑️ **Progressive Web App**
5. Mode : **Mobile** (CPU 4× slowdown + 3G Slow par défaut)
6. **Analyze page load**

### Cibles minimales

| Catégorie | Cible | Si < cible |
|---|---|---|
| Performance | ≥ 90 | voir « Causes possibles » ci-dessous |
| Accessibility | ≥ 95 | contraste, alt-text manquants, labels |
| Best Practices | 100 | CSP, HTTPS, console errors |
| SEO | ≥ 95 | meta description, viewport, lang |
| PWA | « Installable » ✓ | manifest invalide ou SW non-actif |

### Métriques clés à viser

| Métrique | Bon (vert) | Acceptable | Critique |
|---|---|---|---|
| **FCP** (First Contentful Paint) | < 1.8s | < 3.0s | > 3.0s |
| **LCP** (Largest Contentful Paint) | < 2.5s | < 4.0s | > 4.0s |
| **TBT** (Total Blocking Time) | < 200ms | < 600ms | > 600ms |
| **CLS** (Cumulative Layout Shift) | < 0.1 | < 0.25 | > 0.25 |
| **SI** (Speed Index) | < 3.4s | < 5.8s | > 5.8s |

### Causes possibles si Performance < 90

| Symptôme dans le rapport | Cause probable | Fix |
|---|---|---|
| « Reduce JavaScript execution time » > 1s | Recharts encore dans le bundle initial | Vérifier `apps/web/app/admin/_components/AdminCharts.tsx` existe et est dynamic-importé |
| « Properly size images » | Images Supabase non-optimisées | Vérifier `next.config.mjs` → `images.formats: ['image/avif', 'image/webp']` |
| « Eliminate render-blocking resources » | CSS Tailwind non-purgé | Build OK ? `tailwind.config.ts` content paths correctement listés ? |
| « Server response time » > 600ms | Vercel cold-start | Normal au premier visit après déploiement, retry après 30s |
| « Minimize main-thread work » > 4s | JS lourd au boot | Vérifier que `/admin` First Load JS < 200 kB (target post-PR #44) |

### Tester par page

Refaire l'audit sur les 4 routes principales :
- `/` (landing publique)
- `/login`
- `/pro` (nécessite compte propriétaire)
- `/admin` (nécessite compte admin)

Les scores diffèrent : `/admin` sera le plus chargé (graphes, tables), `/login` le plus léger.

---

## 2. Installation PWA — Android & iOS

### Android Chrome

1. Ouvrir https://soutra-paiya.vercel.app sur ton téléphone Android (Chrome ou Edge)
2. **Banner « Installer Soutra-Playce »** doit apparaître dans les 1-2 secondes (depuis la PR #36)
3. Si pas de banner : menu Chrome (`⋮`) → **Ajouter à l'écran d'accueil** ou **Installer l'application**
4. Confirmer → l'icône Soutra-Playce apparaît dans le drawer d'apps
5. Lancer l'app → ouverture en mode **standalone** (pas de barre URL, pas d'onglets)
6. Splash screen orange brand pendant 1-2s

### iPhone Safari

1. Ouvrir https://soutra-paiya.vercel.app dans **Safari** (pas Chrome iOS — il ne supporte pas l'install PWA)
2. **Hint « Touche partager → Sur l'écran d'accueil »** doit apparaître après 1.5s
3. Touche le bouton **Partager** ⏏️ en bas de Safari
4. **Sur l'écran d'accueil** → confirmer
5. L'icône apparaît sur l'écran d'accueil iOS
6. Lancer → mode standalone, status bar orange (theme-color)

### Vérifications post-installation

- [ ] L'icône utilise le visuel SP gradient (pas une capture d'écran de la page)
- [ ] Le nom affiché est « Soutra » (short_name du manifest)
- [ ] Au lancement, fond crème (background_color = `#FAF7F2`)
- [ ] La status bar Android est orange (theme-color = `#FF6B1A`)
- [ ] Ouverture rapide < 2s (cache SW chargé)

### Mode offline

1. Une fois l'app installée, désactiver le wifi + data sur le téléphone
2. Lancer l'app
3. **Page offline stylée** doit s'afficher : logo SP, message « Pas de connexion », bouton « Réessayer »
4. Réactiver le réseau → la page se recharge automatiquement (`window.addEventListener('online')`)

### Mise à jour automatique (test après un nouveau déploiement)

1. Déployer une nouvelle version sur Vercel (par exemple via un commit cosmétique)
2. Lancer l'app installée
3. Au bout de quelques secondes : **banner « Mise à jour disponible · Recharger »** apparaît
4. Tap **Recharger** → app reload avec la nouvelle version (SKIP_WAITING postMessage)

---

## 3. Manifest & Service Worker — vérifications DevTools

### Chrome DevTools desktop

1. Ouvrir https://soutra-paiya.vercel.app
2. F12 → onglet **Application**
3. **Manifest** (menu de gauche) :
   - Identity : `Soutra-Playce` / short_name `Soutra`
   - Presentation : `standalone`, theme #FF6B1A, bg #FAF7F2
   - Icons : 2 icônes (SVG + PNG 1024) listées, pas d'erreur rouge
   - Shortcuts : 2 raccourcis (Pro / Admin)
   - Bouton « Add to home screen » disponible
4. **Service Workers** :
   - Status : `activated and is running` (vert)
   - Source : `sw.js`
   - Scope : `/`
   - Bouton « Update » pour forcer recheck
5. **Storage → Cache Storage** :
   - `soutra-static-v1` : contient `/offline.html`, `/icons/icon.svg`, `/manifest.webmanifest`
   - `soutra-runtime-v1` : pages HTML visitées (`/`, `/login`)
6. **Network** (refresh page) :
   - `sw.js` : status 200, `Cache-Control: public, max-age=0, must-revalidate`
   - `/_next/static/*.js` : `Cache-Control: public, max-age=31536000, immutable`
   - `/icons/icon-1024.png` : `Cache-Control: public, max-age=604800`

---

## 4. Test visuel responsive

### Breakpoints à tester (DevTools → Device Mode)

| Device | Width | Cible test |
|---|---|---|
| iPhone SE (1st gen) | 320 px | Hero typo OK, pas de débordement |
| iPhone 12 / 13 | 390 px | Standard mobile, tout en place |
| iPhone 14 Pro Max | 430 px | Layout reste mobile |
| iPad Mini | 768 px | Premier breakpoint tablet (`md:`) — sidebar /pro et /admin → topbar+drawer |
| iPad Pro 11" | 834 px | Layout tablet |
| Laptop 1024 px | 1024 px | Premier breakpoint `lg:` — sidebar fixe apparaît |
| Desktop 1280 px | 1280 px | Container max-w-7xl actif |

### Pages × états

| Page | Mobile | Tablet | Desktop |
|---|---|---|---|
| `/` | Burger menu fonctionnel, hero stack, footer 2-col | Idem | Navbar liens visibles, hero 2-col, footer 4-col |
| `/login` | Form full-width, glow orbs visibles | Form 28rem centré | Idem |
| `/pro` | Topbar + drawer + bottom-nav 4 items | Idem | Sidebar fixe 256px à gauche |
| `/admin` | Topbar + drawer + bottom-nav 5 items, content dark | Idem | Sidebar fixe + content dark |

### Issues récurrentes à chasser

- [ ] Débordement horizontal (`overflow-x-hidden` partout ?)
- [ ] Texte trop petit sur très petit mobile (320 px)
- [ ] Boutons CTA cachés sous le clavier (mobile) — ajouter `pb-safe`
- [ ] Sidebar mobile drawer ne se ferme pas après navigation
- [ ] Toast notification chevauche la topbar mobile

---

## 5. Reporting

Si un check échoue, ouvre une issue GitHub avec :
- **Route** affectée
- **Device / viewport** utilisé
- **Score Lighthouse** ou **erreur exacte**
- **Screenshot**

Référence cette PR ou commit dans l'issue pour faciliter le bisect.
