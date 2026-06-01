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
    icon: [
      { url: '/icons/icon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-1024.png', type: 'image/png', sizes: '1024x1024' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  openGraph: {
    title: 'Soutra-Playce',
    description: 'Sors, réserve, paie — zéro galère.',
    locale: 'fr_CI',
    type: 'website',
    siteName: 'Soutra-Playce',
  },
  twitter: { card: 'summary_large_image', title: 'Soutra-Playce' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={inter.variable}>
      <body>
        {children}
        <ServiceWorkerRegistrar />
        <PWAInstallPrompt />
      </body>
    </html>
  );
}
