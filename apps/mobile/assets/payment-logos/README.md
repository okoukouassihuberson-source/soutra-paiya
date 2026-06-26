# Logos paiement — assets mobile

Ce dossier contient les images PNG des logos des moyens de paiement utilisés
dans l'app mobile (composant `components/PaymentLogo.tsx`).

## Remplacer un logo par le PNG officiel

1. Télécharge le PNG/JPG officiel depuis le site de la marque
   (par ex. `https://www.wave.com/` pour Wave)
2. Renomme-le exactement comme le fichier existant (ex : `wave.png`)
3. Écrase le fichier dans ce dossier
4. **Important** : sur Expo, les assets sont bundlés au build. Après remplacement :
   - En dev : `npx expo start --clear` (vide le cache Metro)
   - En prod : rebuild EAS (`eas build`)

Aucun code à modifier — `require('@/assets/payment-logos/wave.png')` pointera
automatiquement sur le nouveau fichier.

## Logos actuellement gérés via `<Image>`

| Slug | Fichier | Statut |
|---|---|---|
| `wave` | `wave.png` | ⚠️ Placeholder 1×1 transparent — à remplacer par le PNG officiel Wave |

Les autres logos (`visa`, `mastercard`, `orange-money`, `mtn-money`,
`moov-money`, `paiya-pay`) sont encore rendus en SVG inline via
`react-native-svg`. Pour les passer en `<Image>`, suivre le même pattern
que `WaveSvg` dans `components/PaymentLogo.tsx`.

## Format recommandé pour le PNG

- **Dimensions** : largeur ≥ 480 px (pour rester net en HD)
- **Ratio** : ~3.2:1 (paysage, format wide) — peu importe car `resizeMode="contain"`
- **Background** : transparent si possible (le `<View>` parent applique le
  fond cyan `#1DC8FB` pour Wave). Si le PNG inclut son propre fond, ce
  fond officiel sera visible — c'est OK.
- **Poids** : < 50 Ko (optimiser via TinyPNG ou squoosh.app)
