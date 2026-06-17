import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ScrollView, View, Text, Pressable, StyleSheet, ActivityIndicator,
  Image, Modal, Alert, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import DateTimePicker from '@react-native-community/datetimepicker';
import { typography, radius, spacing, formatXOF, type ColorPalette } from '@soutra/shared';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useColors } from '@/lib/theme';
import { ScreenHeader } from '@/components/ScreenHeader';

/**
 * /hotel/[venueId] — réservation de chambres mobile.
 *
 * Pattern Booking.com simplifié :
 *   1) Header venue + sélecteur dates/voyageurs
 *   2) Liste chambres disponibles (RPC list_available_rooms)
 *   3) Tap chambre → modal détail + CTA "Réserver"
 *   4) RPC create_room_booking → invoke paystack-pay-room-booking
 *   5) WebBrowser.openBrowserAsync(authorization_url)
 *
 * Schéma DB (migration 0059) : 1 chambre = 1 ressource indivisible. Anti-
 * overbooking garanti par EXCLUDE constraint GIST. RPCs prennent `p_guests`
 * (un entier unique), pas adults/children séparés.
 */

interface VenueLite {
  id: string;
  name: string;
  category: string;
  address: string | null;
  cover_url: string | null;
}

// Schéma exact de list_available_rooms (migration 0059)
interface AvailableRoom {
  id: string;
  name: string;
  description: string | null;
  room_type: string | null;
  capacity: number;
  price_per_night_xof: number;
  total_for_stay_xof: number;
  photos: string[];
  amenities: string[];
}

function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmtDateHuman(d: Date): string {
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

function nightsBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)));
}

export default function HotelScreen() {
  const { venueId } = useLocalSearchParams<{ venueId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  const today = useMemo(() => { const d = new Date(); d.setHours(12, 0, 0, 0); return d; }, []);
  const tomorrow = useMemo(() => { const d = new Date(today); d.setDate(d.getDate() + 1); return d; }, [today]);

  const [venue, setVenue] = useState<VenueLite | null>(null);
  const [checkIn, setCheckIn] = useState<Date>(today);
  const [checkOut, setCheckOut] = useState<Date>(tomorrow);
  const [guests, setGuests] = useState(2);

  const [rooms, setRooms] = useState<AvailableRoom[]>([]);
  const [loadingVenue, setLoadingVenue] = useState(true);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const [showCheckIn, setShowCheckIn] = useState(false);
  const [showCheckOut, setShowCheckOut] = useState(false);
  const [showGuests, setShowGuests] = useState(false);
  const [selected, setSelected] = useState<AvailableRoom | null>(null);
  const [booking, setBooking] = useState(false);

  const nights = useMemo(() => nightsBetween(checkIn, checkOut), [checkIn, checkOut]);

  // Chargement venue (header)
  useEffect(() => {
    if (!venueId) return;
    (async () => {
      try {
        const { data } = await supabase
          .from('venues')
          .select('id, name, category, address, cover_url')
          .eq('id', venueId)
          .maybeSingle();
        setVenue(data as VenueLite | null);
      } catch (err) {
        console.error('[hotel] venue load:', err);
      } finally {
        setLoadingVenue(false);
      }
    })();
  }, [venueId]);

  // Recherche dispo
  const search = useCallback(async () => {
    if (!venueId) return;
    setSearching(true);
    try {
      const { data, error } = await (supabase.rpc as any)('list_available_rooms', {
        p_venue_id: venueId,
        p_check_in: fmtDate(checkIn),
        p_check_out: fmtDate(checkOut),
        p_guests: guests,
      });
      if (error) throw error;
      setRooms((data as AvailableRoom[]) ?? []);
      setSearched(true);
    } catch (err: any) {
      console.error('[hotel] search:', err);
      Alert.alert('Erreur', err.message || 'Impossible de chercher les chambres');
    } finally {
      setSearching(false);
    }
  }, [venueId, checkIn, checkOut, guests]);

  // Auto-search au 1er chargement quand venue prêt
  useEffect(() => { if (venue && !searched) void search(); }, [venue, searched, search]);

  const onCheckInChange = useCallback((_e: any, d?: Date) => {
    if (Platform.OS !== 'ios') setShowCheckIn(false);
    if (!d) return;
    d.setHours(12, 0, 0, 0);
    setCheckIn(d);
    if (d.getTime() >= checkOut.getTime()) {
      const next = new Date(d); next.setDate(next.getDate() + 1);
      setCheckOut(next);
    }
    setSearched(false);
  }, [checkOut]);

  const onCheckOutChange = useCallback((_e: any, d?: Date) => {
    if (Platform.OS !== 'ios') setShowCheckOut(false);
    if (!d) return;
    d.setHours(12, 0, 0, 0);
    if (d.getTime() <= checkIn.getTime()) {
      Alert.alert('Date invalide', 'La date de départ doit être après l\'arrivée.');
      return;
    }
    setCheckOut(d);
    setSearched(false);
  }, [checkIn]);

  // Réservation + paiement
  const handleReserve = useCallback(async (room: AvailableRoom) => {
    if (!user) {
      Alert.alert('Connexion requise', 'Connecte-toi pour réserver.');
      router.push('/login' as any);
      return;
    }
    setBooking(true);
    try {
      // 1) Créer le booking pending
      const { data: bk, error: bkErr } = await (supabase.rpc as any)('create_room_booking', {
        p_room_id: room.id,
        p_check_in: fmtDate(checkIn),
        p_check_out: fmtDate(checkOut),
        p_guests: guests,
        p_contact_name: null,
        p_contact_phone: null,
        p_notes: null,
      });
      if (bkErr) throw bkErr;
      const bookingId = (bk as any)?.booking_id;
      if (!bookingId) throw new Error('Réservation créée sans identifiant');

      // 2) Initier le paiement
      const { data: pay, error: payErr } = await (supabase.functions as any).invoke(
        'paystack-pay-room-booking',
        { body: { booking_id: bookingId } },
      );
      if (payErr) throw payErr;
      const url = (pay as any)?.authorization_url;
      if (!url) throw new Error('Lien de paiement indisponible');

      setSelected(null);
      // 3) Ouvrir Paystack — au retour, /paystack/callback web fera le deep-link
      await WebBrowser.openBrowserAsync(url);
      // Rafraîchit la dispo pour refléter l'unavailability
      void search();
    } catch (err: any) {
      console.error('[hotel] reserve:', err);
      const msg = mapBookingError(err?.message);
      Alert.alert('Erreur', msg);
    } finally {
      setBooking(false);
    }
  }, [user, checkIn, checkOut, guests, router, search]);

  if (loadingVenue) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <ScreenHeader title="Hôtel" />
        <View style={s.center}>
          <ActivityIndicator color={c.primary[500]} />
        </View>
      </SafeAreaView>
    );
  }

  if (!venue) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <ScreenHeader title="Hôtel" />
        <View style={s.center}>
          <Ionicons name="alert-circle-outline" size={48} color={c.neutral[400]} />
          <Text style={s.errText}>Établissement introuvable</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader title={venue.name} subtitle={venue.address ?? 'Hôtel'} />

      <ScrollView contentContainerStyle={s.scrollContent}>
        {/* Hero cover */}
        {venue.cover_url ? (
          <Image source={{ uri: venue.cover_url }} style={s.hero} />
        ) : (
          <View style={[s.hero, s.heroPlaceholder]}>
            <Ionicons name="bed-outline" size={48} color={c.neutral[400]} />
          </View>
        )}

        {/* Search bar (dates + guests) */}
        <View style={s.searchCard}>
          <View style={s.searchRow}>
            <Pressable style={s.searchCell} onPress={() => setShowCheckIn(true)}>
              <Text style={s.searchLabel}>Arrivée</Text>
              <Text style={s.searchValue}>{fmtDateHuman(checkIn)}</Text>
            </Pressable>
            <View style={s.searchDivider} />
            <Pressable style={s.searchCell} onPress={() => setShowCheckOut(true)}>
              <Text style={s.searchLabel}>Départ</Text>
              <Text style={s.searchValue}>{fmtDateHuman(checkOut)}</Text>
            </Pressable>
          </View>
          <Pressable style={s.guestsCell} onPress={() => setShowGuests(true)}>
            <View>
              <Text style={s.searchLabel}>Voyageurs</Text>
              <Text style={s.searchValue}>
                {guests} {guests > 1 ? 'personnes' : 'personne'}
              </Text>
            </View>
            <Ionicons name="chevron-down" size={20} color={c.neutral[500]} />
          </Pressable>

          <Pressable
            onPress={search}
            disabled={searching}
            style={({ pressed }) => [s.searchBtn, pressed && { opacity: 0.9 }]}
          >
            {searching ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="search" size={18} color="#fff" />
                <Text style={s.searchBtnText}>Rechercher · {nights} nuit{nights > 1 ? 's' : ''}</Text>
              </>
            )}
          </Pressable>
        </View>

        {/* Liste chambres */}
        {searching && !rooms.length ? (
          <View style={s.center}><ActivityIndicator color={c.primary[500]} /></View>
        ) : rooms.length === 0 && searched ? (
          <View style={s.empty}>
            <Ionicons name="bed-outline" size={56} color={c.neutral[400]} />
            <Text style={s.emptyTitle}>Aucune chambre disponible</Text>
            <Text style={s.emptyBody}>Essaie d&apos;autres dates ou réduis le nombre de voyageurs.</Text>
          </View>
        ) : (
          <View style={s.roomList}>
            {rooms.map((r) => (
              <RoomCard key={r.id} c={c} room={r} nights={nights} onPress={() => setSelected(r)} />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Date pickers */}
      {showCheckIn && (
        <DateTimePicker
          value={checkIn}
          mode="date"
          minimumDate={today}
          onChange={onCheckInChange}
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
        />
      )}
      {showCheckOut && (
        <DateTimePicker
          value={checkOut}
          mode="date"
          minimumDate={new Date(checkIn.getTime() + 86400000)}
          onChange={onCheckOutChange}
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
        />
      )}

      {/* Guests modal */}
      <Modal visible={showGuests} transparent animationType="slide" onRequestClose={() => setShowGuests(false)}>
        <View style={s.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowGuests(false)} />
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>Voyageurs</Text>
            <View style={s.guestRow}>
              <Text style={s.guestLabel}>Nombre de personnes</Text>
              <View style={s.qtyRow}>
                <Pressable
                  onPress={() => { setGuests((g) => Math.max(1, g - 1)); setSearched(false); }}
                  style={[s.qtyBtn, guests <= 1 && s.qtyBtnDisabled]}
                  hitSlop={6}
                  disabled={guests <= 1}
                >
                  <Ionicons name="remove" size={18} color={guests <= 1 ? c.neutral[400] : c.dark} />
                </Pressable>
                <Text style={s.qtyValue}>{guests}</Text>
                <Pressable
                  onPress={() => { setGuests((g) => Math.min(20, g + 1)); setSearched(false); }}
                  style={[s.qtyBtn, guests >= 20 && s.qtyBtnDisabled]}
                  hitSlop={6}
                  disabled={guests >= 20}
                >
                  <Ionicons name="add" size={18} color={guests >= 20 ? c.neutral[400] : c.dark} />
                </Pressable>
              </View>
            </View>
            <Pressable
              style={({ pressed }) => [s.addBtn, pressed && { opacity: 0.9 }]}
              onPress={() => { setShowGuests(false); void search(); }}
            >
              <Text style={s.addBtnText}>Appliquer</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Détail chambre + CTA Réserver */}
      <RoomDetailModal
        room={selected}
        nights={nights}
        booking={booking}
        onClose={() => !booking && setSelected(null)}
        onReserve={handleReserve}
      />
    </SafeAreaView>
  );
}

// Mappe les erreurs SQL en messages utilisateur lisibles
function mapBookingError(msg?: string): string {
  if (!msg) return 'Réservation impossible';
  const m = msg.toUpperCase();
  if (m.includes('PERIOD_TAKEN')) return 'Cette chambre vient d\'être réservée. Essaie une autre.';
  if (m.includes('CAPACITY_EXCEEDED')) return 'Cette chambre n\'accueille pas autant de voyageurs.';
  if (m.includes('ROOM_NOT_BOOKABLE')) return 'Cette chambre n\'est plus réservable.';
  if (m.includes('CHECK_IN_IN_PAST')) return 'La date d\'arrivée est dans le passé.';
  if (m.includes('INVALID_PERIOD')) return 'Période invalide : départ avant arrivée.';
  if (m.includes('NOT_AUTHENTICATED')) return 'Connexion requise.';
  return msg;
}

/* ─────────────────────────────────────────────────── *
 *  ROOM CARD                                          *
 * ─────────────────────────────────────────────────── */

function RoomCard({ c, room, nights, onPress }: { c: ColorPalette; room: AvailableRoom; nights: number; onPress: () => void }) {
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <Pressable style={({ pressed }) => [s.roomCard, pressed && { opacity: 0.95, transform: [{ scale: 0.99 }] }]} onPress={onPress}>
      <View style={s.roomImg}>
        {room.photos?.[0] ? (
          <Image source={{ uri: room.photos[0] }} style={s.roomImgFill} />
        ) : (
          <View style={[s.roomImgFill, s.roomImgPlaceholder]}>
            <Ionicons name="bed-outline" size={36} color={c.neutral[400]} />
          </View>
        )}
      </View>
      <View style={s.roomBody}>
        {room.room_type && <Text style={s.roomType}>{room.room_type}</Text>}
        <Text style={s.roomName} numberOfLines={2}>{room.name}</Text>
        <View style={s.roomMeta}>
          <Ionicons name="people-outline" size={14} color={c.neutral[600]} />
          <Text style={s.roomMetaText}>
            Jusqu&apos;à {room.capacity} {room.capacity > 1 ? 'pers.' : 'pers.'}
          </Text>
        </View>
        {room.amenities?.length > 0 && (
          <View style={s.amenityRow}>
            {room.amenities.slice(0, 3).map((a) => (
              <View key={a} style={s.amenityPill}>
                <Text style={s.amenityText}>{a}</Text>
              </View>
            ))}
            {room.amenities.length > 3 && (
              <Text style={s.amenityMore}>+{room.amenities.length - 3}</Text>
            )}
          </View>
        )}
        <View style={s.roomFooter}>
          <View>
            <Text style={s.roomPrice}>{formatXOF(room.price_per_night_xof)}</Text>
            <Text style={s.roomPriceUnit}>/ nuit</Text>
          </View>
          <View style={s.roomTotalBox}>
            <Text style={s.roomTotalLabel}>{nights} nuit{nights > 1 ? 's' : ''}</Text>
            <Text style={s.roomTotal}>{formatXOF(room.total_for_stay_xof)}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

/* ─────────────────────────────────────────────────── *
 *  ROOM DETAIL MODAL                                  *
 * ─────────────────────────────────────────────────── */

function RoomDetailModal({ room, nights, booking, onClose, onReserve }: {
  room: AvailableRoom | null;
  nights: number;
  booking: boolean;
  onClose: () => void;
  onReserve: (r: AvailableRoom) => void;
}) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  if (!room) return null;
  const total = room.total_for_stay_xof;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={s.modalSheet}>
          <View style={s.modalHandle} />
          <ScrollView contentContainerStyle={s.modalContent} showsVerticalScrollIndicator={false}>
            {room.photos?.[0] && (
              <Image source={{ uri: room.photos[0] }} style={s.modalImg} />
            )}
            {room.room_type && <Text style={s.modalCat}>{room.room_type}</Text>}
            <Text style={s.modalName}>{room.name}</Text>
            <View style={s.roomMeta}>
              <Ionicons name="people-outline" size={14} color={c.neutral[600]} />
              <Text style={s.roomMetaText}>Jusqu&apos;à {room.capacity} personnes</Text>
            </View>
            {room.description && <Text style={s.modalDesc}>{room.description}</Text>}
            {room.amenities?.length > 0 && (
              <View style={s.amenityBlock}>
                <Text style={s.variantLabel}>Équipements</Text>
                <View style={s.amenityRow}>
                  {room.amenities.map((a) => (
                    <View key={a} style={s.amenityPill}>
                      <Text style={s.amenityText}>{a}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
            <View style={s.priceBlock}>
              <View style={s.priceRow}>
                <Text style={s.priceLine}>{formatXOF(room.price_per_night_xof)} × {nights} nuit{nights > 1 ? 's' : ''}</Text>
                <Text style={s.priceLine}>{formatXOF(total)}</Text>
              </View>
              <View style={s.priceTotal}>
                <Text style={s.priceTotalLabel}>Total</Text>
                <Text style={s.priceTotalAmt}>{formatXOF(total)}</Text>
              </View>
            </View>

            <Pressable
              onPress={() => onReserve(room)}
              disabled={booking}
              style={({ pressed }) => [s.addBtn, pressed && { opacity: 0.9 }, booking && { opacity: 0.7 }]}
            >
              {booking ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="card" size={18} color="#fff" />
                  <Text style={s.addBtnText}>Réserver · {formatXOF(total)}</Text>
                </>
              )}
            </Pressable>
            <Pressable onPress={onClose} style={s.cancelBtn} disabled={booking}>
              <Text style={s.cancelBtnText}>Annuler</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/* ─────────────────────────────────────────────────── *
 *  STYLES                                             *
 * ─────────────────────────────────────────────────── */

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.light },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
    errText: { fontSize: typography.fontSize.base, color: c.neutral[600], marginTop: spacing.sm },
    scrollContent: { paddingBottom: spacing['2xl'] },

    hero: { width: '100%', height: 180 },
    heroPlaceholder: { backgroundColor: c.neutral[100], alignItems: 'center', justifyContent: 'center' },

    searchCard: {
      margin: spacing.md,
      marginTop: -spacing.lg,
      backgroundColor: '#fff',
      borderRadius: radius.xl,
      padding: spacing.md,
      shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 6,
    },
    searchRow: { flexDirection: 'row', borderWidth: 1, borderColor: c.neutral[200], borderRadius: radius.lg, overflow: 'hidden' },
    searchCell: { flex: 1, padding: spacing.md },
    searchDivider: { width: 1, backgroundColor: c.neutral[200] },
    searchLabel: { fontSize: 10, color: c.neutral[500], fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
    searchValue: { fontSize: typography.fontSize.base, color: c.dark, fontWeight: '700', marginTop: 2 },
    guestsCell: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      borderWidth: 1, borderColor: c.neutral[200], borderRadius: radius.lg,
      padding: spacing.md, marginTop: spacing.sm,
    },
    searchBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
      backgroundColor: c.primary[500],
      paddingVertical: spacing.md, borderRadius: radius.full, marginTop: spacing.md,
      shadowColor: c.primary[500], shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4,
    },
    searchBtnText: { color: '#fff', fontWeight: '800', fontSize: typography.fontSize.base },

    empty: { alignItems: 'center', padding: spacing.xl, gap: spacing.sm, marginTop: spacing.lg },
    emptyTitle: { fontSize: typography.fontSize.base, fontWeight: '700', color: c.dark },
    emptyBody: { fontSize: typography.fontSize.sm, color: c.neutral[600], textAlign: 'center', paddingHorizontal: spacing.lg },

    roomList: { paddingHorizontal: spacing.md, gap: spacing.md, paddingTop: spacing.sm },
    roomCard: {
      backgroundColor: '#fff',
      borderRadius: radius.lg,
      borderWidth: 1, borderColor: c.neutral[200],
      overflow: 'hidden',
    },
    roomImg: { width: '100%', height: 160, position: 'relative' },
    roomImgFill: { ...StyleSheet.absoluteFillObject },
    roomImgPlaceholder: { backgroundColor: c.neutral[100], alignItems: 'center', justifyContent: 'center' },
    roomBody: { padding: spacing.md, gap: spacing.xs },
    roomType: { fontSize: 10, color: c.primary[600], fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
    roomName: { fontSize: typography.fontSize.base, fontWeight: '700', color: c.dark },
    roomMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    roomMetaText: { fontSize: typography.fontSize.xs, color: c.neutral[600] },
    amenityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, alignItems: 'center' },
    amenityPill: { backgroundColor: c.neutral[100], paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full },
    amenityText: { fontSize: 10, color: c.neutral[700], fontWeight: '600' },
    amenityMore: { fontSize: 10, color: c.neutral[600], fontWeight: '700' },
    roomFooter: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
      marginTop: spacing.sm, paddingTop: spacing.sm,
      borderTopWidth: 1, borderTopColor: c.neutral[100],
    },
    roomPrice: { fontSize: typography.fontSize.lg, fontWeight: '900', color: c.dark, fontVariant: ['tabular-nums'] },
    roomPriceUnit: { fontSize: typography.fontSize.xs, color: c.neutral[500] },
    roomTotalBox: { alignItems: 'flex-end' },
    roomTotalLabel: { fontSize: 10, color: c.neutral[500], fontWeight: '700' },
    roomTotal: { fontSize: typography.fontSize.base, fontWeight: '800', color: c.primary[600], fontVariant: ['tabular-nums'] },

    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
    modalSheet: {
      backgroundColor: c.light,
      borderTopLeftRadius: 28, borderTopRightRadius: 28,
      maxHeight: '90%',
      paddingTop: spacing.sm,
    },
    modalHandle: { alignSelf: 'center', width: 44, height: 4, borderRadius: 2, backgroundColor: c.neutral[300], marginBottom: spacing.sm },
    modalTitle: { textAlign: 'center', fontSize: typography.fontSize.lg, fontWeight: '800', color: c.dark, marginBottom: spacing.md, paddingHorizontal: spacing.lg },
    modalContent: { padding: spacing.lg, paddingBottom: spacing['2xl'] },
    modalImg: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.lg, marginBottom: spacing.md, backgroundColor: c.neutral[100] },
    modalCat: { fontSize: 11, color: c.primary[600], fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
    modalName: { fontSize: typography.fontSize.xl, fontWeight: '800', color: c.dark, marginTop: 4 },
    modalDesc: { fontSize: typography.fontSize.sm, color: c.neutral[700], marginTop: spacing.md, lineHeight: 20 },

    amenityBlock: { marginTop: spacing.lg },
    variantLabel: { fontSize: 11, color: c.neutral[600], fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: spacing.xs },

    priceBlock: { marginTop: spacing.lg, padding: spacing.md, backgroundColor: c.neutral[100], borderRadius: radius.lg },
    priceRow: { flexDirection: 'row', justifyContent: 'space-between' },
    priceLine: { fontSize: typography.fontSize.sm, color: c.neutral[700] },
    priceTotal: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: c.neutral[300] },
    priceTotalLabel: { fontSize: typography.fontSize.base, fontWeight: '800', color: c.dark },
    priceTotalAmt: { fontSize: typography.fontSize.lg, fontWeight: '900', color: c.primary[600], fontVariant: ['tabular-nums'] },

    guestRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderBottomWidth: 1, borderBottomColor: c.neutral[100] },
    guestLabel: { fontSize: typography.fontSize.base, fontWeight: '600', color: c.dark },
    qtyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    qtyBtn: {
      width: 36, height: 36, borderRadius: radius.full,
      borderWidth: 1, borderColor: c.neutral[300],
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: '#fff',
    },
    qtyBtnDisabled: { borderColor: c.neutral[200], backgroundColor: c.neutral[100] },
    qtyValue: { fontSize: typography.fontSize.lg, fontWeight: '800', minWidth: 28, textAlign: 'center', color: c.dark, fontVariant: ['tabular-nums'] },

    addBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
      backgroundColor: c.primary[500],
      paddingVertical: spacing.md + 2, borderRadius: radius.full, marginTop: spacing.lg, marginHorizontal: spacing.lg,
      shadowColor: c.primary[500], shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4,
    },
    addBtnText: { color: '#fff', fontWeight: '800', fontSize: typography.fontSize.base },
    cancelBtn: { paddingVertical: spacing.md, alignItems: 'center' },
    cancelBtnText: { color: c.neutral[600], fontWeight: '600', fontSize: typography.fontSize.sm },
  });
}
