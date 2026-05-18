import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Soutra-Paiya — Sors, réserve, paie. Zéro galère.',
  description:
    "Découvre les meilleurs maquis, restos et événements à Abidjan. Paie avec Orange Money, Wave, MTN MoMo. Réservation garantie.",
  keywords: ['Abidjan', 'réservation', 'restaurant', 'maquis', 'paiement mobile', 'Orange Money', 'Wave', "Côte d'Ivoire"],
  openGraph: {
    title: 'Soutra-Paiya',
    description: 'Sors, réserve, paie — zéro galère.',
    locale: 'fr_CI',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
