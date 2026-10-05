# Refonte UX/UI de l'accueil web (Soutra-Playce)

Périmètre : page d'accueil `apps/web` (FR + `/en`), en-tête, barre mobile, pied de page. Les pages métier
(explorer, voyages, activités, réservation, admin…) et leurs règles ne sont pas modifiées.

## Jetons
- Orange marque `primary-500` `#FF6B1A` : **accent** (fonds de CTA, points, traits). Texte dessus : `night` (contraste 6,2:1 ; blanc = 2,85:1, refusé WCAG AA).
- Orange en **texte sur fond clair** : `primary-700` (5,9:1). Sur fond sombre : `primary-300/400`.
- `night` `#101828` (fond sombre, texte sur orange), `light` (fond de page), blanc.
- Typo : `font-display` titres (extrabold, tracking serré), Inter pour le corps. Rayons : `rounded-2xl/3xl` cartes, `rounded-full` boutons.
- Cibles tactiles ≥ 44 px (CTA) / 36 px (sélecteur de langue). Focus clavier : contour orange global (`globals.css`).
- Signature graphique : `PinLine` (point de localisation + trait) dans les intertitres, liseré orange sur les cartes « envies ».

## Composants (`apps/web/components/home/`)
`HomeHero` (diaporama + recherche), `Reveal` (apparition au scroll), `MobileDock` (barre mobile + bouton central Soutra),
`NearMe` (carte autour de moi), `Sections` (`SectionHeading`, `PinLine`, `Stars`), `SiteFooter`.
`components/marketing/LandingNavbar.tsx` (en-tête), `components/tourism/HomeTourism.tsx` (ordre des sections).

## Contenu à remplacer avant lancement
- **Photos** : `lib/home-visuals.ts` (visuels de démonstration Unsplash, génériques) → clichés ivoiriens (Assinie, Bassam, Abidjan, San Pedro, Man).
- **Liens du pied de page** affichés seulement si configurés : `NEXT_PUBLIC_CONTACT_EMAIL`, `NEXT_PUBLIC_APP_STORE_URL`, `NEXT_PUBLIC_PLAY_STORE_URL`, `NEXT_PUBLIC_TERMS_URL`, `NEXT_PUBLIC_PRIVACY_URL`, `NEXT_PUBLIC_SOCIAL_INSTAGRAM|FACEBOOK|X|TIKTOK`. Les pages légales (CGU, confidentialité, À propos) n'existent pas encore.
- Les faux témoignages (« 4,8/5 · 2 400+ avis », noms inventés) ont été retirés : la preuve sociale n'affiche que de **vrais avis publiés** (section masquée s'il n'y en a pas). La carte fidélité est un exemple explicitement étiqueté.

## Écarts assumés par rapport au brief
- Pas de champ « Voyageurs » : aucun filtre serveur ne le gère (un champ sans effet serait trompeur). Les dates arrivée/départ filtrent réellement les hébergements disponibles.
- Barre mobile : Accueil · Explorer · **Soutra** · Carte · Compte (Favoris reste dans Compte).
- La carte de l'accueil est un aperçu léger ; la vraie carte (Leaflet) s'ouvre sur `/explorer?view=map`, centrée sur l'utilisateur (5 km) via « Voir sur la carte ».

## Vérifications faites (Chromium, faux Supabase)
9 largeurs (320 → 1920) × FR/EN : aucun débordement horizontal, aucune erreur console ; axe-core (WCAG 2.2 AA + bonnes pratiques) : 0 violation sur `/`, `/en`, `/voyages/nationaux` ; `prefers-reduced-motion` : diaporama figé, contenus visibles ; scripts e2e existants (réservation + promo, offres organisateur) toujours verts. Non vérifié : rendu avec de vraies photos, performance réseau mobile réelle (Lighthouse), lecteurs d'écran réels.


## Mode sombre (web)

- Thème posé sur `<html data-theme="light|dark">` par un script inline (`app/layout.tsx`) : choix mémorisé (`localStorage soutra.theme`), sinon préférence du système. Bascule : `components/ThemeToggle.tsx`.
- Les échelles Tailwind `neutral`, `dark` (texte) et `light` (fond) lisent des variables CSS (`app/globals.css`, valeurs = `packages/shared/src/theme/tokens.ts`). Écrire `text-neutral-600`, `bg-white`, `border-neutral-200`… suffit : le sombre s'applique seul.
- Les sections volontairement sombres (`.bg-night`) restaurent les valeurs claires pour leur contenu (boutons blancs, etc.).
- Pastilles d'état (`bg-red-50`, `text-emerald-700`…), cartes Leaflet et champs natifs ont des surcharges dédiées en fin de `globals.css`. Ne pas utiliser de couleur hexadécimale en dur dans un composant.
- Contrôle : axe-core (WCAG AA) en clair et en sombre.

### Espaces Compte, Pro, Admin et Organisateur (thème clair/sombre)

- Ces écrans étaient écrits « sombre uniquement » (`bg-neutral-900/50`, `border-neutral-800`, `text-white`…). Ils utilisent désormais les mêmes classes claires que le reste du site (`bg-white`, `border-neutral-200`, `text-dark`, `text-neutral-600`) : l'échelle `neutral` s'inverse toute seule en sombre. **Ne jamais réintroduire de classes réservées au sombre** ni de `dark:` sur les neutres.
- Texte sur fond orange plein : toujours `text-night` (le CSS le force pour `.bg-primary-500`/`.bg-primary-400` et `.btn-primary`).
- Pastilles d'état : `bg-X-100 text-X-700` (ou `bg-X-500/15`), les surcharges sombres sont dans `globals.css`.
- Admin : la navigation est regroupée (Pilotage, À traiter, Catalogue, Communauté, Argent, Système) via `NavItem.group` ; la vue d'ensemble commence par « À traiter » (`AdminTodo`, comptes par file d'attente).
- Compte : page d'accueil du compte (raccourcis selon le rôle, abonnement, apparence), historiques repliés.
