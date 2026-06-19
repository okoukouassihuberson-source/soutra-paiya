/**
 * PaymentLogo — logos officiels stylisés des moyens de paiement supportés.
 *
 * SVG inline (zéro asset HTTP, dark mode adaptable, accessible, optimisé).
 * Chaque logo respecte les couleurs officielles de marque pour un effet
 * confiance immédiat sans risquer un mismatch de cache PNG.
 *
 * Utilisé dans la section « Paiement 100% sécurisé » de la landing publique.
 * Réutilisable plus tard pour la fiche venue mobile + Pro Web (PRs B/C/D).
 */
import type { SVGProps } from 'react';

export type PaymentMethodName =
  | 'visa'
  | 'mastercard'
  | 'orange-money'
  | 'mtn-money'
  | 'moov-money'
  | 'wave'
  | 'paiya-pay';

const LABELS: Record<PaymentMethodName, string> = {
  'visa':         'Visa',
  'mastercard':   'Mastercard',
  'orange-money': 'Orange Money',
  'mtn-money':    'MTN Mobile Money',
  'moov-money':   'Moov Money',
  'wave':         'Wave',
  'paiya-pay':    'Paiya-Pay',
};

interface PaymentLogoProps {
  name: PaymentMethodName;
  className?: string;
  title?: string;
}

/**
 * Rend le logo SVG pour le moyen de paiement demandé.
 * Le ratio est ≈ 1.6:1 (paysage) sauf paiya-pay (1:1).
 * className contrôle la taille via Tailwind (ex: "h-10 w-auto").
 */
export function PaymentLogo({ name, className = 'h-10 w-auto', title }: PaymentLogoProps) {
  const ariaLabel = title ?? LABELS[name];
  switch (name) {
    case 'visa':         return <VisaLogo className={className} aria-label={ariaLabel} />;
    case 'mastercard':   return <MastercardLogo className={className} aria-label={ariaLabel} />;
    case 'orange-money': return <OrangeMoneyLogo className={className} aria-label={ariaLabel} />;
    case 'mtn-money':    return <MtnMoneyLogo className={className} aria-label={ariaLabel} />;
    case 'moov-money':   return <MoovMoneyLogo className={className} aria-label={ariaLabel} />;
    case 'wave':         return <WaveLogo className={className} aria-label={ariaLabel} />;
    case 'paiya-pay':    return <PaiyaPayLogo className={className} aria-label={ariaLabel} />;
  }
}

/* ─────────────────────────────────────────────────── *
 *  LOGOS                                              *
 * ─────────────────────────────────────────────────── */

const SvgBase = (props: SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" role="img" focusable="false" {...props} />
);

// Visa — bleu marine #1A1F71 + jaune #F7B600 (couleurs officielles)
function VisaLogo({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <SvgBase viewBox="0 0 160 50" className={className} {...props}>
      <title>Visa</title>
      <rect width="160" height="50" rx="8" fill="#FFFFFF" />
      <rect y="36" width="160" height="6" fill="#F7B600" />
      <rect y="42" width="160" height="8" rx="0" fill="#1A1F71" />
      <text
        x="80" y="30"
        textAnchor="middle"
        fontFamily="Arial, Helvetica, sans-serif"
        fontWeight="900"
        fontSize="24"
        fontStyle="italic"
        letterSpacing="2"
        fill="#1A1F71"
      >
        VISA
      </text>
    </SvgBase>
  );
}

// Mastercard — 2 cercles imbriqués rouge #EB001B + jaune #F79E1B, overlap orange
function MastercardLogo({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <SvgBase viewBox="0 0 160 50" className={className} {...props}>
      <title>Mastercard</title>
      <rect width="160" height="50" rx="8" fill="#FFFFFF" />
      <circle cx="68" cy="25" r="14" fill="#EB001B" />
      <circle cx="92" cy="25" r="14" fill="#F79E1B" />
      {/* Overlap orange (intersection des deux cercles) */}
      <path
        d="M80 13.5a14 14 0 0 1 0 23a14 14 0 0 1 0-23Z"
        fill="#FF5F00"
      />
      <text
        x="80" y="46"
        textAnchor="middle"
        fontFamily="Arial, Helvetica, sans-serif"
        fontWeight="700"
        fontSize="6"
        letterSpacing="1"
        fill="#1A1F71"
      >
        mastercard
      </text>
    </SvgBase>
  );
}

// Orange Money — fond noir, flèches blanc + orange #FF7900
function OrangeMoneyLogo({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <SvgBase viewBox="0 0 160 50" className={className} {...props}>
      <title>Orange Money</title>
      <rect width="160" height="50" rx="8" fill="#000000" />
      {/* Flèche blanche montante */}
      <g transform="translate(20, 10)">
        <rect x="0" y="14" width="4" height="14" rx="1.5" fill="#FFFFFF" />
        <rect x="0" y="0" width="14" height="4" rx="1.5" fill="#FFFFFF" />
        <path d="M14 0 L4 10 L4 18 L18 4 Z" fill="#FFFFFF" />
      </g>
      {/* Flèche orange descendante */}
      <g transform="translate(38, 12)">
        <rect x="14" y="0" width="4" height="14" rx="1.5" fill="#FF7900" />
        <rect x="4" y="24" width="14" height="4" rx="1.5" fill="#FF7900" />
        <path d="M0 24 L18 6 L18 14 L8 24 Z" fill="#FF7900" />
      </g>
      <text
        x="78" y="32"
        fontFamily="Arial, Helvetica, sans-serif"
        fontWeight="700"
        fontSize="14"
        fill="#FFFFFF"
      >
        Orange Money
      </text>
    </SvgBase>
  );
}

// MTN Mobile Money — jaune #FFCB05 + rouge #ED1C24
function MtnMoneyLogo({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <SvgBase viewBox="0 0 160 50" className={className} {...props}>
      <title>MTN Mobile Money</title>
      <rect width="160" height="50" rx="8" fill="#FFCB05" />
      <text
        x="14" y="32"
        fontFamily="Arial, Helvetica, sans-serif"
        fontWeight="900"
        fontSize="22"
        fill="#000000"
      >
        MTN
      </text>
      <text
        x="64" y="22"
        fontFamily="Arial, Helvetica, sans-serif"
        fontWeight="800"
        fontSize="12"
        fill="#000000"
      >
        Mobile
      </text>
      <text
        x="64" y="36"
        fontFamily="Arial, Helvetica, sans-serif"
        fontWeight="800"
        fontSize="12"
        fill="#ED1C24"
      >
        Money
      </text>
    </SvgBase>
  );
}

// Moov Money — bleu #00549F + croissant orange #F47A1F
function MoovMoneyLogo({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <SvgBase viewBox="0 0 160 50" className={className} {...props}>
      <title>Moov Money</title>
      <rect width="160" height="50" rx="8" fill="#00549F" />
      <text
        x="16" y="30"
        fontFamily="Arial, Helvetica, sans-serif"
        fontWeight="900"
        fontSize="18"
        fill="#FFFFFF"
      >
        Moov
      </text>
      {/* Croissant orange (logo Moov simplifié) */}
      <path
        d="M88 16 Q 110 12, 130 28 Q 132 30, 130 32 Q 110 18, 90 22 Z"
        fill="#F47A1F"
      />
      <text
        x="84" y="42"
        fontFamily="Arial, Helvetica, sans-serif"
        fontWeight="700"
        fontSize="9"
        fill="#FFFFFF"
      >
        MONEY
      </text>
    </SvgBase>
  );
}

// Wave — bleu cyan #1DC8FB
function WaveLogo({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <SvgBase viewBox="0 0 160 50" className={className} {...props}>
      <title>Wave</title>
      <rect width="160" height="50" rx="8" fill="#1DC8FB" />
      {/* Vague stylisée à gauche */}
      <path
        d="M14 30 Q 24 20, 34 30 T 54 30"
        stroke="#FFFFFF"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      <text
        x="62" y="34"
        fontFamily="Arial, Helvetica, sans-serif"
        fontWeight="900"
        fontSize="22"
        fill="#FFFFFF"
        letterSpacing="-0.5"
      >
        wave
      </text>
    </SvgBase>
  );
}

// Paiya-Pay — couleurs marker bleu/orange Soutra-Paiya
function PaiyaPayLogo({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <SvgBase viewBox="0 0 160 50" className={className} {...props}>
      <title>Paiya-Pay</title>
      <defs>
        <linearGradient id="paiya-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2E6BC8" />
          <stop offset="100%" stopColor="#F58220" />
        </linearGradient>
      </defs>
      <rect width="160" height="50" rx="8" fill="url(#paiya-bg)" />
      {/* Mini marker à gauche (rappel logo Soutra) */}
      <g transform="translate(12, 8)">
        <path d="M14 0 C 6 0, 0 6, 0 14 C 0 22, 14 34, 14 34 C 14 34, 28 22, 28 14 C 28 6, 22 0, 14 0 Z" fill="#FFFFFF" />
        <circle cx="14" cy="14" r="6" fill="#2E6BC8" />
      </g>
      <text
        x="52" y="32"
        fontFamily="Arial, Helvetica, sans-serif"
        fontWeight="900"
        fontSize="20"
        fill="#FFFFFF"
        letterSpacing="-0.5"
      >
        Paiya<tspan fill="#FFE5C2">-Pay</tspan>
      </text>
    </SvgBase>
  );
}
