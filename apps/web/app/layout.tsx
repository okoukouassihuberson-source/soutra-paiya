import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { ServiceWorkerRegistrar } from '@/components/ServiceWorkerRegistrar';
import { PWAInstallPrompt } from '@/components/PWAInstallPrompt';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FF6B1A' },
    { media: '(prefers-color-scheme: dark)', color: '#0E1116' },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://soutra-paiya.vercel.app'),
  title: {
    default: 'Soutra-Playce — Sors, réserve, paie. Zéro galère.',
    template: '%s · Soutra-Playce',
  },
  description:
    "Découvre les meilleurs maquis, restos et événements à Abidjan. Paie avec Orange Money, Wave, MTN MoMo. Réservation garantie.",
  keywords: ['Abidjan', 'réservation', 'restaurant', 'maquis', 'paiement mobile', 'Orange Money', 'Wave', "Côte d'Ivoire"],
  manifest: '/manifest.webmanifest',
  applicationName: 'Soutra-Playce',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Soutra',
  },
  formatDetection: { telephone: false },
  icons: {
    // /logo.png est la source unique du logo (marker bleu/orange Soutra-Paiya).
    // Les anciens icons/icon.svg + icons/icon-1024.png restent en fallback PWA.
    icon: [
      { url: '/logo.png', type: 'image/png' },
      { url: '/icons/icon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-1024.png', type: 'image/png', sizes: '1024x1024' },
    ],
    apple: [{ url: '/logo.png', type: 'image/png' }],
    shortcut: '/logo.png',
  },
  openGraph: {
    title: 'Soutra-Playce',
    description: 'Sors, réserve, paie — zéro galère.',
    locale: 'fr_CI',
    type: 'website',
    siteName: 'Soutra-Playce',
    images: [{ url: '/logo.png', width: 1024, height: 1024, alt: 'Soutra-Playce' }],
  },
  twitter: { card: 'summary_large_image', title: 'Soutra-Playce', images: ['/logo.png'] },
};

// Hôte Supabase pré-connecté pour économiser le handshake DNS/TLS au premier
// appel réseau (auth, RPCs, storage). Extrait l'origine de NEXT_PUBLIC_SUPABASE_URL
// au build-time pour ne pas embarquer du runtime.
const SUPABASE_ORIGIN = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://pjtmmzxcitbcwbbgtpdj.supabase.co').origin;
  } catch {
    return 'https://pjtmmzxcitbcwbbgtpdj.supabase.co';
  }
})();

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={inter.variable}>
      <head>
        {/* Preconnect réseau pour Supabase : économise ~100-200ms au premier appel. */}
        <link rel="preconnect" href={SUPABASE_ORIGIN} crossOrigin="anonymous" />
        <link rel="dns-prefetch" href={SUPABASE_ORIGIN} />
        {/* DNS-prefetch pour fonts.googleapis.com / fonts.gstatic.com (Inter). */}
        <link rel="dns-prefetch" href="https://fonts.gstatic.com" />
      </head>
      <body>
        {children}
        <ServiceWorkerRegistrar />
        <PWAInstallPrompt />
      </body>
    </html>
  );
}
