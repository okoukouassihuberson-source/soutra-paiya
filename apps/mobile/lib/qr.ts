// ============================================================================
// QR de paiement Soutra-Paiya — encodage / décodage.
// Module pur (aucune dépendance React Native). Un QR encode l'identité du
// destinataire, et éventuellement un montant.
// ============================================================================

const QR_TYPE = 'soutrapay';

export interface PaymentQr {
  phone: string;
  name?: string;
  amount?: number;
}

// Génère la charge utile d'un QR de paiement (écran « Mon QR »).
export function buildPaymentQr(data: PaymentQr): string {
  return JSON.stringify({
    t: QR_TYPE,
    phone: data.phone,
    name: data.name,
    amount: data.amount,
  });
}

// Analyse un QR scanné. Renvoie null si ce n'est pas un QR Soutra-Paiya valide.
export function parsePaymentQr(raw: string): PaymentQr | null {
  let obj: any;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  if (obj?.t !== QR_TYPE || typeof obj.phone !== 'string') return null;
  if (!/^\+225[0-9]{10}$/.test(obj.phone)) return null;
  const amount =
    Number.isInteger(obj.amount) && obj.amount > 0 ? obj.amount : undefined;
  return {
    phone: obj.phone,
    name: typeof obj.name === 'string' ? obj.name : undefined,
    amount,
  };
}
