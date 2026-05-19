import { z } from 'zod';

// Téléphone CI : +225 + 10 chiffres
export const phoneSchema = z
  .string()
  .regex(/^\+225[0-9]{10}$/, 'Numéro invalide. Format attendu : +225XXXXXXXXXX');

// Mot de passe : 8 caractères minimum (priorité à la longueur — NIST 800-63B).
// Plafond 72 octets : bcrypt tronque silencieusement au-delà.
export const passwordSchema = z
  .string()
  .min(8, 'Mot de passe : 8 caractères minimum')
  .max(72, 'Mot de passe : 72 caractères maximum');

export const pinSchema = z.string().length(4, 'PIN à 4 chiffres').regex(/^\d{4}$/);

export const amountSchema = z
  .number()
  .int()
  .min(100, 'Montant minimum : 100 FCFA')
  .max(2_000_000, 'Montant maximum : 2 000 000 FCFA');

export const topupSchema = z.object({
  amount_xof: amountSchema,
  provider: z.enum(['orange', 'mtn', 'wave', 'moov']),
  phone: phoneSchema,
});

export const transferSchema = z.object({
  recipient_phone: phoneSchema,
  amount_xof: amountSchema,
  note: z.string().max(140).optional(),
});

// Paystack — démarrage d'un encaissement : recharge du wallet ou acompte
// de réservation.
export const paystackPurposeSchema = z.enum(['topup', 'reservation_deposit']);

export const paystackInitSchema = z.object({
  amount_xof: amountSchema,
  purpose: paystackPurposeSchema,
  reservation_id: z.string().uuid().optional(),
});

// Retrait du wallet vers un compte mobile money.
// Paystack ne propose le payout XOF que pour Orange, MTN et Wave (Moov exclu).
export const withdrawSchema = z.object({
  amount_xof: amountSchema,
  provider: z.enum(['orange', 'mtn', 'wave']),
  phone: phoneSchema,
});

export const reservationFormSchema = z.object({
  date: z.date().min(new Date()),
  party_size: z.number().int().min(1).max(50),
  notes: z.string().max(280).optional(),
});

export const reservationSchema = z.object({
  venue_id: z.string().uuid(),
  date_time: z.string().datetime(),
  party_size: z.number().int().min(1).max(50),
  deposit_xof: z.number().int().min(0).optional(),
  notes: z.string().max(280).optional(),
});

export const reviewSchema = z.object({
  venue_id: z.string().uuid().optional(),
  event_id: z.string().uuid().optional(),
  reservation_id: z.string().uuid().optional(),
  ticket_id: z.string().uuid().optional(),
  rating: z.number().int().min(1).max(5),
  body: z.string().max(2000).optional(),
});

export type TopupInput = z.infer<typeof topupSchema>;
export type TransferInput = z.infer<typeof transferSchema>;
export type PaystackInitInput = z.infer<typeof paystackInitSchema>;
export type WithdrawInput = z.infer<typeof withdrawSchema>;
export type ReservationFormInput = z.infer<typeof reservationFormSchema>;
export type ReservationInput = z.infer<typeof reservationSchema>;
export type ReviewInput = z.infer<typeof reviewSchema>;
