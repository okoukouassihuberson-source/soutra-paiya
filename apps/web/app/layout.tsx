import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Soutra-Paiya — Sortir, réserver, payer en toute sécurité',
  description:
    "La plateforme tout-en-un pour découvrir, réserver et payer vos sorties en Côte d'Ivoire. Mobile Money intégré (Orange, MTN, Wave).",
  keywords: ['Abidjan', 'sortie', 'réservation', 'Mobile Money', 'maquis', 'événement', 'Côte d\'Ivoire'],
  openGraph: {
    title: 'Soutra-Paiya',
    description: 'Sortir, réserver, payer.',
    locale: 'fr_CI',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
