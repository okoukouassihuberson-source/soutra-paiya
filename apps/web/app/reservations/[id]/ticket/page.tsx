import { redirect, notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { supabaseServer } from '@/lib/supabase-server';
import { TicketView } from './_components/TicketView';

export const metadata: Metadata = {
  title: 'Ticket de réservation — Soutra-Explore',
  description: 'Ticket de réservation Soutra-Explore',
  robots: { index: false, follow: false },
};

/**
 * /reservations/[id]/ticket — ticket HTML imprimable d'une réservation.
 *
 * Server :
 *   1. Auth gate (redirect /login si non auth)
 *   2. Fetch la réservation + venue. RLS reservations couvre déjà :
 *      - user_id = self (resa_user)
 *      - venue.owner_id = self (resa_owner)
 *      donc le venue owner peut aussi imprimer (utile pour check-in).
 *   3. 404 si introuvable ou inaccessible (RLS bloque)
 */
export default async function ReservationTicketPage({
  params,
}: {
  params: { id: string };
}) {
  const sb = supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const { data: resa, error } = await (sb as any)
    .from('reservations')
    .select(`
      id, user_id, venue_id, date_time, party_size, deposit_xof, status,
      qr_code, notes, created_at, arrived_at, cancelled_at,
      venue:venues (
        id, name, slug, category, address, city, district, phone, email, cover_url
      )
    `)
    .eq('id', params.id)
    .maybeSingle();

  if (error) {
    console.error('[ticket] load error:', error);
  }
  if (!resa) notFound();

  // Fetch le nom du user pour personnaliser le ticket
  const { data: profile } = await (sb as any)
    .from('profiles')
    .select('full_name, phone, email')
    .eq('id', resa.user_id)
    .maybeSingle();

  return <TicketView resa={resa} profile={profile} />;
}
