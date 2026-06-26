/**
 * PaymentLogo — affiche les logos des moyens de paiement acceptés.
 *
 * Charge le SVG depuis /public/payment-logos/<name>.svg. Pour utiliser les
 * vrais PNG officiels, il suffit de remplacer le fichier dans ce dossier
 * (garder le même nom + extension svg, ou changer l'ext pour png et mettre
 * à jour la constante EXT plus bas).
 */

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

const EXT = 'svg';

interface PaymentLogoProps {
  name: PaymentMethodName;
  className?: string;
  title?: string;
}

export function PaymentLogo({ name, className = 'h-10 w-auto', title }: PaymentLogoProps) {
  const label = title ?? LABELS[name];
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/payment-logos/${name}.${EXT}`}
      alt={label}
      title={label}
      className={className}
      loading="lazy"
      decoding="async"
      width={240}
      height={80}
    />
  );
}
