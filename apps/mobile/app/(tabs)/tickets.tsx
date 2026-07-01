import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Image, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { typography, radius, spacing, formatXOF, type ColorPalette } from '@soutra/shared';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { TabHeader } from '@/components/TabHeader';
import { Skeleton } from '@/components/Skeleton';
import { useColors } from '@/lib/theme';
import { exportTicketPdf } from '@/lib/ticket-pdf';

// ============================================================================
// Onglet Billets — vue unifiée réservations resto + orders boutique +
// room_bookings hôtel. Chaque source est normalisée en Ticket via une des
// fonctions mapXxxToTicket. Le tri se fait sur `date` (date de service pour
// les reservations/bookings, created_at pour les orders).
// ============================================================================

type TicketKind = 'reservation' | 'order' | 'booking';

// Vue normalisée d'un billet : ce que la card affiche + une backref
// vers l'objet source pour le modal détail spécifique.
interface Ticket {
  id: string;
  kind: TicketKind;
  title: string;             // venue name / order number / booking number
  date: Date;                // date_time / check_in_date / created_at
  status: string;
  amount: number;            // deposit_xof / total_xof
  coverUrl: string | null;
  location?: string | null;  // district / delivery_address
  nightsOrCountOrSize: number;
  raw: unknown;              // objet source (Reservation | Order | RoomBooking)
  qrCode?: string;           // reservations only pour l'instant (voir PR C)
}

// PR C : génération PDF LOCALE pour les 3 types via expo-print +
// react-native-qrcode-svg. Voir lib/ticket-pdf.ts.

// ============================================================================
// Sources
// ============================================================================

interface RawReservation {
  id: string;
  venue_id: string;
  date_time: string;
  party_size: number;
  deposit_xof: number;
  status: string;
  qr_code: string;
  notes: string | null;
  created_at: string;
  venue: {
    id: string;
    name: string;
    cover_url: string | null;
    city: string | null;
    district: string | null;
  } | null;
}

interface RawOrder {
  order_id: string;
  order_number: string;
  status: string;
  payment_status: string;
  total_xof: number;
  items_count: number;
  delivery_method: string;
  created_at: string;
  venue_name: string | null;
  venue_cover_url: string | null;
}

interface RawBooking {
  booking_id: string;
  booking_number: string;
  status: string;
  payment_status: string;
  total_xof: number;
  nights_count: number;
  check_in_date: string;
  check_out_date: string;
  venue_name: string | null;
  venue_cover_url: string | null;
  venue_district: string | null;
}

function mapReservationToTicket(r: RawReservation): Ticket {
  return {
    id: r.id,
    kind: 'reservation',
    title: r.venue?.name ?? 'Lieu inconnu',
    date: new Date(r.date_time),
    status: r.status,
    amount: r.deposit_xof,
    coverUrl: r.venue?.cover_url ?? null,
    location: r.venue?.district ?? r.venue?.city ?? null,
    nightsOrCountOrSize: r.party_size,
    raw: r,
    qrCode: r.qr_code,
  };
}

function mapOrderToTicket(o: RawOrder): Ticket {
  return {
    id: o.order_id,
    kind: 'order',
    title: o.venue_name ?? 'Boutique',
    date: new Date(o.created_at),
    status: o.status,
    amount: o.total_xof,
    coverUrl: o.venue_cover_url,
    location: o.delivery_method === 'delivery' ? 'Livraison' : 'À retirer',
    nightsOrCountOrSize: o.items_count,
    raw: o,
  };
}

function mapBookingToTicket(b: RawBooking): Ticket {
  return {
    id: b.booking_id,
    kind: 'booking',
    title: b.venue_name ?? 'Hôtel',
    date: new Date(b.check_in_date),
    status: b.status,
    amount: b.total_xof,
    coverUrl: b.venue_cover_url,
    location: b.venue_district,
    nightsOrCountOrSize: b.nights_count,
    raw: b,
  };
}

// ============================================================================
// Composant principal
// ============================================================================

export default function Tickets() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadAll = useCallback(async () => {
    if (!user?.id) {
      setTickets([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      // Charge les 3 sources en parallèle. Un échec sur l'une ne bloque
      // pas l'affichage des autres — chaque promesse est isolée.
      const [resRes, orderRes, bookRes] = await Promise.all([
        supabase
          .from('reservations')
          .select(`
            id, venue_id, date_time, party_size, deposit_xof, status, qr_code, notes, created_at,
            venue:venues(id, name, cover_url, city, district)
          `)
          .eq('user_id', user.id)
          .order('date_time', { ascending: false })
          .limit(50),
        (supabase.rpc as any)('list_my_orders', { p_limit: 50 }),
        (supabase.rpc as any)('list_my_room_bookings', { p_limit: 50 }),
      ]);

      const collected: Ticket[] = [];

      if (resRes.error) {
        console.error('[tickets] reservations:', resRes.error);
      } else {
        for (const r of (resRes.data ?? []) as unknown as RawReservation[]) {
          collected.push(mapReservationToTicket(r));
        }
      }

      if (orderRes.error) {
        console.error('[tickets] orders:', orderRes.error);
      } else {
        for (const o of (orderRes.data ?? []) as RawOrder[]) {
          collected.push(mapOrderToTicket(o));
        }
      }

      if (bookRes.error) {
        console.error('[tickets] bookings:', bookRes.error);
      } else {
        for (const b of (bookRes.data ?? []) as RawBooking[]) {
          collected.push(mapBookingToTicket(b));
        }
      }

      collected.sort((a, b) => b.date.getTime() - a.date.getTime());
      setTickets(collected);
    } catch (err: any) {
      console.error('[tickets] unexpected:', err);
      Alert.alert('Erreur', err?.message ?? 'Erreur inattendue');
      setTickets([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (authLoading) return;
    loadAll();
  }, [authLoading, loadAll]);

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const up: Ticket[] = [];
    const dn: Ticket[] = [];
    for (const t of tickets) {
      if (isTicketUpcoming(t, now)) up.push(t);
      else dn.push(t);
    }
    // upcoming trié du plus proche au plus lointain
    up.sort((a, b) => a.date.getTime() - b.date.getTime());
    return { upcoming: up, past: dn };
  }, [tickets]);

  const subtitle = tickets.length === 0
    ? 'Aucun billet pour l\'instant'
    : `${upcoming.length} à venir · ${past.length} dans l'historique`;

  if (authLoading || loading) {
    return (
      <SafeAreaView style={s.safe}>
        <TabHeader subtitle="Chargement…" />
        <View style={{ paddingTop: spacing.md }}>
          <View style={s.skeletonSection}>
            <Skeleton width={140} height={18} />
          </View>
          <TicketSkeleton c={c} />
          <TicketSkeleton c={c} />
        </View>
      </SafeAreaView>
    );
  }

  if (!tickets.length) {
    return (
      <SafeAreaView style={s.safe}>
        <TabHeader subtitle={subtitle} />
        <ScrollView
          contentContainerStyle={s.emptyBody}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadAll(); }} />}
        >
          <View style={s.emptyIconWrap}>
            <Ionicons name="ticket-outline" size={56} color={c.primary[400]} />
          </View>
          <Text style={s.emptyTitle}>Pas encore de billet</Text>
          <Text style={s.emptyText}>
            Réserve une table, commande dans une boutique ou une nuit d&apos;hôtel —
            tes billets apparaîtront tous ici.
          </Text>
          <Pressable
            style={({ pressed }) => [s.cta, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}
            onPress={() => router.push('/(tabs)/explore')}
          >
            <Ionicons name="compass" size={18} color="#fff" />
            <Text style={s.ctaText}>Explorer les lieux</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <TabHeader subtitle={subtitle} />
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing['2xl'] }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadAll(); }} />}
      >
        {upcoming.length > 0 && (
          <>
            <View style={s.sectionTitleRow}>
              <View style={[s.sectionAccent, { backgroundColor: c.primary[500] }]} />
              <Text style={s.sectionTitle}>À venir</Text>
              <Text style={s.sectionCount}>{upcoming.length}</Text>
            </View>
            {upcoming.map((t) => (
              <TicketCard c={c} key={`${t.kind}-${t.id}`} ticket={t} onPress={() => openDetail(t, c)} />
            ))}
          </>
        )}

        {past.length > 0 && (
          <>
            <View style={s.sectionTitleRow}>
              <View style={[s.sectionAccent, { backgroundColor: c.neutral[400] }]} />
              <Text style={s.sectionTitle}>Historique</Text>
              <Text style={s.sectionCount}>{past.length}</Text>
            </View>
            {past.map((t) => (
              <TicketCard c={c} key={`${t.kind}-${t.id}`} ticket={t} muted onPress={() => openDetail(t, c)} />
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ============================================================================
// Détail — Alert par type. PR C remplacera par un modal + génération PDF+QR.
// ============================================================================

function openDetail(t: Ticket, c: ColorPalette) {
  const status = statusMeta(t.kind, t.status, c);
  const dateStr = t.date.toLocaleString('fr-FR');
  const pdfButton = { text: 'Télécharger le ticket PDF', onPress: () => downloadTicketPdf(t, c) };
  const closeButton = { text: 'Fermer', style: 'cancel' as const };

  if (t.kind === 'reservation') {
    const r = t.raw as RawReservation;
    Alert.alert(
      t.title,
      `Statut : ${status.label}\n` +
      `Date : ${dateStr}\n` +
      `Personnes : ${r.party_size}\n` +
      `Dépôt : ${formatXOF(t.amount)}\n` +
      `QR : ${r.qr_code.slice(0, 8)}…`,
      [pdfButton, closeButton],
    );
    return;
  }

  if (t.kind === 'order') {
    const o = t.raw as RawOrder;
    Alert.alert(
      `Commande ${o.order_number}`,
      `Boutique : ${t.title}\n` +
      `Statut : ${status.label}\n` +
      `${o.items_count} article${o.items_count > 1 ? 's' : ''}\n` +
      `Livraison : ${o.delivery_method === 'delivery' ? 'À domicile' : 'À retirer'}\n` +
      `Total : ${formatXOF(t.amount)}\n` +
      `Passée le : ${dateStr}`,
      [pdfButton, closeButton],
    );
    return;
  }

  // booking
  const b = t.raw as RawBooking;
  Alert.alert(
    `Réservation ${b.booking_number}`,
    `Hôtel : ${t.title}\n` +
    `Statut : ${status.label}\n` +
    `Check-in : ${new Date(b.check_in_date).toLocaleDateString('fr-FR')}\n` +
    `Check-out : ${new Date(b.check_out_date).toLocaleDateString('fr-FR')}\n` +
    `${b.nights_count} nuit${b.nights_count > 1 ? 's' : ''}\n` +
    `Total : ${formatXOF(t.amount)}`,
    [pdfButton, closeButton],
  );
}

/**
 * Passe le Ticket (union) au format TicketPdfPayload puis délègue à
 * lib/ticket-pdf.ts pour la génération HTML+SVG+PDF+partage.
 */
function downloadTicketPdf(t: Ticket, c: ColorPalette) {
  const status = statusMeta(t.kind, t.status, c);
  const dateStr = t.date.toLocaleString('fr-FR', {
    dateStyle: 'long',
    timeStyle: 'short',
  });

  const detailsLines: Array<{ label: string; value: string }> = [];

  let code: string;
  if (t.kind === 'reservation') {
    const r = t.raw as RawReservation;
    code = r.qr_code;
    detailsLines.push(
      { label: 'Personnes', value: String(r.party_size) },
    );
    if (r.notes) detailsLines.push({ label: 'Notes', value: r.notes });
  } else if (t.kind === 'order') {
    const o = t.raw as RawOrder;
    code = o.order_number;
    detailsLines.push(
      { label: 'N° commande', value: o.order_number },
      { label: 'Articles', value: String(o.items_count) },
      { label: 'Livraison', value: o.delivery_method === 'delivery' ? 'À domicile' : 'À retirer' },
    );
  } else {
    const b = t.raw as RawBooking;
    code = b.booking_number;
    detailsLines.push(
      { label: 'N° réservation', value: b.booking_number },
      { label: 'Check-in', value: new Date(b.check_in_date).toLocaleDateString('fr-FR') },
      { label: 'Check-out', value: new Date(b.check_out_date).toLocaleDateString('fr-FR') },
      { label: 'Durée', value: `${b.nights_count} nuit${b.nights_count > 1 ? 's' : ''}` },
    );
  }

  void exportTicketPdf({
    kind: t.kind,
    id: t.id,
    code,
    title: t.title,
    subtitle: t.location ?? undefined,
    date: dateStr,
    status: status.label,
    amountXof: t.amount,
    detailsLines,
  });
}

// ============================================================================
// Helpers
// ============================================================================

function isTicketUpcoming(t: Ticket, nowMs: number): boolean {
  const alive = !['cancelled', 'refunded', 'no_show', 'delivered'].includes(t.status);
  if (!alive) return false;
  if (t.kind === 'reservation') return t.date.getTime() >= nowMs;
  if (t.kind === 'booking') return t.date.getTime() >= nowMs;
  // orders : "à venir" = pas encore livrée (pending/confirmed/preparing/ready)
  return ['pending', 'confirmed', 'preparing', 'ready'].includes(t.status);
}

function statusMeta(kind: TicketKind, status: string, c: ColorPalette): { color: string; label: string; icon: keyof typeof Ionicons.glyphMap } {
  // Reservations
  if (kind === 'reservation') {
    switch (status) {
      case 'pending': return { color: c.warning, label: 'En attente', icon: 'time-outline' };
      case 'confirmed': return { color: c.success, label: 'Confirmée', icon: 'checkmark-circle' };
      case 'arrived': return { color: c.primary[600], label: 'Arrivé', icon: 'walk' };
      case 'no_show': return { color: c.danger, label: 'No show', icon: 'alert-circle' };
      case 'cancelled': return { color: c.danger, label: 'Annulée', icon: 'close-circle' };
      case 'refunded': return { color: c.neutral[500], label: 'Remboursée', icon: 'arrow-undo' };
    }
  }
  // Orders
  if (kind === 'order') {
    switch (status) {
      case 'pending': return { color: c.warning, label: 'En attente', icon: 'time-outline' };
      case 'confirmed': return { color: '#3b82f6', label: 'Confirmée', icon: 'checkmark-circle' };
      case 'preparing': return { color: '#6366f1', label: 'En préparation', icon: 'cube-outline' };
      case 'ready': return { color: c.success, label: 'Prête', icon: 'bag-check' };
      case 'delivered': return { color: '#059669', label: 'Livrée', icon: 'checkmark-done' };
      case 'cancelled': return { color: c.danger, label: 'Annulée', icon: 'close-circle' };
      case 'refunded': return { color: c.neutral[500], label: 'Remboursée', icon: 'arrow-undo' };
    }
  }
  // Bookings
  if (kind === 'booking') {
    switch (status) {
      case 'pending': return { color: c.warning, label: 'En attente', icon: 'time-outline' };
      case 'confirmed': return { color: c.success, label: 'Confirmée', icon: 'checkmark-circle' };
      case 'checked_in': return { color: c.primary[600], label: 'Check-in', icon: 'log-in' };
      case 'checked_out': return { color: '#059669', label: 'Séjour terminé', icon: 'log-out' };
      case 'cancelled': return { color: c.danger, label: 'Annulée', icon: 'close-circle' };
      case 'refunded': return { color: c.neutral[500], label: 'Remboursée', icon: 'arrow-undo' };
    }
  }
  return { color: c.neutral[500], label: status, icon: 'help-circle' };
}

function kindMeta(kind: TicketKind): { label: string; icon: keyof typeof Ionicons.glyphMap; color: string } {
  switch (kind) {
    case 'reservation': return { label: 'Réservation', icon: 'restaurant', color: '#f97316' };
    case 'order':       return { label: 'Commande',    icon: 'bag',        color: '#7c3aed' };
    case 'booking':     return { label: 'Hôtel',       icon: 'bed',        color: '#0891b2' };
  }
}

function relativeDateTime(d: Date): string {
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `Aujourd'hui à ${time}`;
  if (isTomorrow) return `Demain à ${time}`;
  const diffDays = Math.round((d.getTime() - now.getTime()) / (24 * 3600 * 1000));
  if (diffDays > 1 && diffDays <= 7) return `Dans ${diffDays} jours`;
  if (diffDays < -1 && diffDays >= -7) return `Il y a ${Math.abs(diffDays)} jours`;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ============================================================================
// Card générique
// ============================================================================

function TicketCard({
  c,
  ticket,
  onPress,
  muted,
}: {
  c: ColorPalette;
  ticket: Ticket;
  onPress: () => void;
  muted?: boolean;
}) {
  const s = useMemo(() => makeStyles(c), [c]);
  const kind = kindMeta(ticket.kind);
  const status = statusMeta(ticket.kind, ticket.status, c);
  const dateLabel = relativeDateTime(ticket.date);

  // Sous-ligne contextuelle selon le type
  let secondaryLine: string;
  if (ticket.kind === 'reservation') {
    secondaryLine = `${ticket.nightsOrCountOrSize} personne${ticket.nightsOrCountOrSize > 1 ? 's' : ''}`;
  } else if (ticket.kind === 'order') {
    secondaryLine = `${ticket.nightsOrCountOrSize} article${ticket.nightsOrCountOrSize > 1 ? 's' : ''}`;
  } else {
    secondaryLine = `${ticket.nightsOrCountOrSize} nuit${ticket.nightsOrCountOrSize > 1 ? 's' : ''}`;
  }

  return (
    <Pressable
      style={({ pressed }) => [s.card, muted && s.cardMuted, pressed && { transform: [{ scale: 0.98 }], opacity: 0.92 }]}
      onPress={onPress}
    >
      <View style={s.thumbWrap}>
        {ticket.coverUrl ? (
          <Image source={{ uri: ticket.coverUrl }} style={s.thumb} />
        ) : (
          <View style={[s.thumb, s.thumbPlaceholder]}>
            <Ionicons name={kind.icon} size={28} color={c.neutral[400]} />
          </View>
        )}
        <View style={[s.kindBadge, { backgroundColor: kind.color }]}>
          <Ionicons name={kind.icon} size={10} color="#fff" />
        </View>
      </View>
      <View style={s.cardBody}>
        <Text style={s.venueName} numberOfLines={1}>{ticket.title}</Text>
        <View style={s.metaRow}>
          <Ionicons name="calendar-outline" size={13} color={c.neutral[500]} />
          <Text style={s.metaText}>{dateLabel}</Text>
        </View>
        <View style={s.metaRow}>
          <Ionicons name={kind.icon} size={13} color={c.neutral[500]} />
          <Text style={s.metaText}>{secondaryLine}</Text>
          {ticket.location ? (
            <>
              <Text style={s.metaSep}>·</Text>
              <Ionicons name="location-outline" size={13} color={c.neutral[500]} />
              <Text style={s.metaText} numberOfLines={1}>{ticket.location}</Text>
            </>
          ) : null}
        </View>
        <View style={s.footerRow}>
          <View style={[s.statusBadge, { backgroundColor: status.color + '1A', borderColor: status.color + '40' }]}>
            <Ionicons name={status.icon} size={11} color={status.color} />
            <Text style={[s.statusText, { color: status.color }]}>{status.label}</Text>
          </View>
          <Text style={s.deposit}>{formatXOF(ticket.amount)}</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={c.neutral[400]} style={s.chev} />
    </Pressable>
  );
}

function TicketSkeleton({ c }: { c: ColorPalette }) {
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <View style={s.card}>
      <Skeleton width={88} height={88} borderRadius={12} />
      <View style={s.cardBody}>
        <Skeleton width="70%" height={18} />
        <Skeleton width="50%" height={12} style={{ marginTop: 10 }} />
        <Skeleton width="40%" height={12} style={{ marginTop: 8 }} />
      </View>
    </View>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.light },
    skeletonSection: { paddingHorizontal: spacing.lg, marginBottom: spacing.md },
    emptyBody: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
    emptyIconWrap: { width: 112, height: 112, borderRadius: 56, backgroundColor: c.primary[50], alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
    emptyTitle: { fontSize: typography.fontSize.lg, fontWeight: '700', color: c.dark, marginBottom: spacing.xs },
    emptyText: { fontSize: typography.fontSize.sm, color: c.neutral[500], textAlign: 'center', maxWidth: 300, lineHeight: 20 },
    cta: {
      marginTop: spacing.xl,
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      backgroundColor: c.primary[500],
      paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.full,
      shadowColor: c.primary[500], shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4,
    },
    ctaText: { color: '#fff', fontWeight: '700', fontSize: typography.fontSize.base },
    sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.lg, marginBottom: spacing.md },
    sectionAccent: { width: 4, height: 18, borderRadius: 2 },
    sectionTitle: { flex: 1, fontSize: typography.fontSize.lg, fontWeight: '700', color: c.dark },
    sectionCount: { fontSize: typography.fontSize.xs, fontWeight: '700', color: c.neutral[500], backgroundColor: c.neutral[100], paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.full },
    card: {
      flexDirection: 'row', alignItems: 'center',
      marginHorizontal: spacing.lg, marginBottom: spacing.md,
      padding: spacing.md, gap: spacing.md,
      backgroundColor: c.neutral[50], borderRadius: radius.lg,
      elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    },
    cardMuted: { opacity: 0.78 },
    thumbWrap: { width: 88, height: 88, position: 'relative' },
    thumb: { width: 88, height: 88, borderRadius: 12, backgroundColor: c.neutral[100] },
    thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
    kindBadge: {
      position: 'absolute', bottom: -4, right: -4,
      width: 22, height: 22, borderRadius: 11,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 2, borderColor: c.neutral[50],
    },
    cardBody: { flex: 1, gap: 4 },
    venueName: { fontSize: typography.fontSize.base, fontWeight: '700', color: c.dark },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    metaText: { fontSize: typography.fontSize.xs, color: c.neutral[600] },
    metaSep: { color: c.neutral[400], marginHorizontal: 4 },
    footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
    statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.full, borderWidth: 1 },
    statusText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
    deposit: { fontSize: typography.fontSize.sm, fontWeight: '700', color: c.primary[600] },
    chev: { marginLeft: -spacing.sm },
  });
}
