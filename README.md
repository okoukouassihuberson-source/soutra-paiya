# Soutra-Playce

> Plateforme fintech & loisirs pour la Côte d'Ivoire.
> Sortir, réserver, payer — sans la galère.
>
> Module de paiement intégré : **Soutra-Pay** (wallet + Paystack).

---

## 📦 Structure du monorepo

```
soutra-paiya/
├── apps/
│   ├── web/        Next.js 14 — landing publique + dashboard B2B Pro
│   └── mobile/     Expo (React Native) — app utilisateur iOS + Android
├── packages/
│   └── shared/     Types DB, design tokens, schémas Zod, client Supabase
└── supabase/
    └── migrations/ Schéma SQL (à appliquer sur le projet Supabase)
```

## 🚀 Quickstart

### Prérequis
- Node.js ≥ 20 (testé sur 24)
- pnpm ≥ 10
- Supabase CLI (`npm i -g supabase`) — pour migrations & types
- Expo Go sur ton téléphone (Android/iOS) **ou** simulateur

### Installation
```bash
pnpm install
```

### Lancer le web
```bash
pnpm web
# → http://localhost:3000      (landing publique)
# → http://localhost:3000/pro  (dashboard B2B)
# → http://localhost:3000/login (auth OTP)
```

### Lancer le mobile
```bash
pnpm mobile
# Scanner le QR avec Expo Go (Android) ou Caméra (iOS)
```

> ⚠️ **Expo Go ne supporte pas Mapbox** (code natif requis). En Expo Go, l'écran
> Explore affiche un fallback élégant. Pour voir la vraie carte → dev build (voir plus bas).

### Activer Mapbox (carte interactive)

**1.** Crée un compte gratuit sur https://account.mapbox.com (50K loads/mois offerts).

**2.** Récupère 2 tokens :
- **Public token** (`pk.xxx`) — utilisé au runtime, OK dans le code
- **Secret token avec scope `DOWNLOADS:READ`** (`sk.xxx`) — uniquement pour le build natif

**3.** Édite `apps/mobile/app.json` :
```jsonc
{
  "plugins": [
    ["@rnmapbox/maps", {
      "RNMapboxMapsImpl": "mapbox",
      "RNMapboxMapsDownloadToken": "sk.ey...VOTRE_SECRET_TOKEN"
    }]
  ],
  "extra": {
    "mapboxPublicToken": "pk.ey...VOTRE_PUBLIC_TOKEN"
  }
}
```

**4.** Génère et lance un dev build (ne fonctionne plus dans Expo Go après cette étape) :
```bash
cd apps/mobile
npx expo prebuild --clean      # génère les dossiers ios/ et android/
npx expo run:android           # ou run:ios sur Mac
```

**5.** À partir de là, `pnpm mobile` se connectera à ton dev build, pas à Expo Go.

### Appliquer le schéma à Supabase
```bash
# Option 1 — Supabase CLI (recommandé)
supabase link --project-ref pjtmmzxcitbcwbbgtpdj
supabase db push

# Option 2 — Coller manuellement le SQL
# Ouvrir https://supabase.com/dashboard/project/pjtmmzxcitbcwbbgtpdj/sql
# → Coller le contenu de supabase/migrations/0001_initial_schema.sql
# → Run
```

### Régénérer les types DB après modification du schéma
```bash
pnpm db:types
```

---

## 🔧 Configuration Supabase requise

Dans le dashboard Supabase de ton projet `pjtmmzxcitbcwbbgtpdj` :

### 1. Auth → Providers → Phone
- Activer **Phone Auth**
- Configurer un fournisseur SMS :
  - **Production** : Twilio (recommandé pour la CI) ou MessageBird
  - **Dev** : Le mode "Test OTP" de Supabase ou Twilio Trial

### 2. Auth → URL Configuration
- Site URL : `http://localhost:3000` (dev) puis ton domaine
- Redirect URLs : ajouter `soutrapaiya://` pour le deep linking mobile

### 3. Database → Extensions
- Activer `postgis` (déjà inclus dans le script de migration)

### 4. Storage (à créer)
- Bucket `avatars` (public)
- Bucket `venues` (public)
- Bucket `stories` (public)
- Bucket `kyc` (privé — accès via RLS uniquement)

---

## 🔐 Variables d'environnement

Toutes les vars publiques sont déjà câblées :
- Web : `apps/web/.env.local`
- Mobile : `apps/mobile/app.json` → `extra.supabaseUrl` / `extra.supabaseAnonKey`

Pour les **secrets server-side** (Mobile Money, Twilio…), copier `.env.example` → `.env` à la racine et remplir. Ne jamais commit.

---

## 💳 Paiements (Paystack)

Recharge du wallet, retrait et acompte de réservation passent par **Paystack**
via des Edge Functions Supabase. Le secret key ne vit que côté serveur.

### Déployer

```bash
# 1. Migration : ajoute le fournisseur paystack, les fonctions de règlement
#    atomiques, et durcit la RLS de la table wallets.
supabase db push

# 2. Edge Functions
supabase functions deploy paystack-initialize
supabase functions deploy paystack-verify
supabase functions deploy paystack-withdraw
supabase functions deploy paystack-webhook   # verify_jwt=false (cf. config.toml)

# 3. Secrets (clés de TEST pour démarrer)
supabase secrets set \
  PAYSTACK_SECRET_KEY=sk_test_xxx \
  PAYSTACK_CALLBACK_URL=https://soutra-paiya.vercel.app/paystack/callback
```

### Configurer le webhook

Dashboard Paystack → **Settings → API Keys & Webhooks** → URL du webhook :
`https://pjtmmzxcitbcwbbgtpdj.supabase.co/functions/v1/paystack-webhook`

### Tester la clé en local

```bash
# Prouve que la clé fonctionne et que le montant XOF est bien converti.
PAYSTACK_SECRET_KEY=sk_test_xxx node scripts/test-paystack.mjs 1000
```

> ⚠️ Les **retraits** (Paystack Transfers) nécessitent en plus, côté compte
> Paystack : Transfers activés, solde approvisionné et OTP des transferts
> désactivé. En mode test, les transferts sont simulés.

## 🗺️ Roadmap (cf. plan détaillé)

- **Sprint 0** (en cours) : foundation, schéma DB, screens placeholder ✅
- **Sprint 1-2** : auth OTP fonctionnelle + profil + KYC
- **Sprint 3-4** : Soutra-Pay (recharge / retrait / acompte via Paystack)
- **Sprint 5-6** : Découverte (carte Mapbox) + réservations + séquestre
- **Sprint 7-8** : Billetterie + scanner QR
- **Sprint 9-10** : Polish + beta privée + stores

---

## 🧪 Tests
```bash
pnpm typecheck   # vérifie tous les workspaces
pnpm lint        # à venir
```

---

## 👥 Conventions

- **Commits** : `type(scope): message` — types : `feat`, `fix`, `chore`, `docs`, `refactor`, `test`
- **Branches** : `feat/`, `fix/`, `chore/` + ticket
- **Code** : TypeScript strict partout, Zod pour la validation au runtime
- **Couleurs/typo** : utiliser uniquement les tokens de `@soutra/shared/theme`

---

## 📚 Stack

| Couche | Choix |
|---|---|
| Mobile | Expo SDK 52 + expo-router 4 |
| Web | Next.js 14 (App Router) + Tailwind 3 |
| Backend | Supabase (Postgres 15 + Auth + Storage + Realtime + Edge Functions) |
| Paiement | Paystack (Carte / Orange / MTN / Wave / Moov) |
| Maps | Mapbox |
| Notifs | Expo Push + Twilio SMS |
| Analytics | PostHog |
| Monitoring | Sentry |

---

🇨🇮 Fait à Abidjan, pour Abidjan.
