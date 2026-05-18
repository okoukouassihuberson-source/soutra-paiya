import { z } from 'zod';

// Téléphone CI : +225 + 10 chiffres
export const phoneSchema = z
  .string()
  .regex(/^\+225[0-9]{10}$/, 'Numéro invalide. Format attendu : +225XXXXXXXXXX');

export const otpSchema = z.string().length(6, 'Le code doit faire 6 chiffres').regex(/^\d{6}$/);

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
export type ReservationFormInput = z.infer<typeof reservationFormSchema>;
export type ReservationInput = z.infer<typeof reservationSchema>;
export type ReviewInput = z.infer<typeof reviewSchema>;
