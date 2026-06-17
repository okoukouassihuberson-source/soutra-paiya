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
 * Le sélecteur de dates utilise DateTimePicker natif (iOS=spinner, Android=
 * popup). Par défaut : check-in = aujourd'hui, check-out = demain.
 */

interface VenueLite {
  id: string;
  name: string;
  category: string;
  address: string | null;
  cover_url: string | null;
}

interface AvailableRoom {
  room_id: string;
  name: string;
  room_type: string | null;
  capacity_adults: number;
  capacity_children: number;
  price_per_night_xof: number;
  amenities: string[];
  photos: string[];
  description: string | null;
  available_count: number;
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
  const [guestsAdults, setGuestsAdults] = useState(2);
  const [guestsChildren, setGuestsChildren] = useState(0);

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
        p_guests_adults: guestsAdults,
        p_guests_children: guestsChildren,
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
  }, [venueId, checkIn, checkOut, guestsAdults, guestsChildren]);

  // Auto-search au 1er chargement quand venue prêt
  useEffect(() => { if (venue && !searched) void search(); }, [venue, searched, search]);

  // Date picker handlers — DateTimePicker se ferme automatiquement sur Android
  // après sélection; sur iOS reste ouvert jusqu'à dismiss manuel.
  const onCheckInChange = useCallback((_e: any, d?: Date) => {
    if (Platform.OS !== 'ios') setShowCheckIn(false);
    if (!d) return;
    d.setHours(12, 0, 0, 0);
    setCheckIn(d);
    // Si check_out devient <= check_in, on l'avance
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
        p_room_id: room.room_id,
        p_check_in: fmtDate(checkIn),
        p_check_out: fmtDate(checkOut),
        p_guests_adults: guestsAdults,
        p_guests_children: guestsChildren,
        p_guest_notes: null,
      });
      if (bkErr) throw bkErr;
      const bookingId = (bk as any)?.booking_id ?? (typeof bk === 'string' ? bk : null);
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
      // 3) Ouvrir Paystack
      await WebBrowser.openBrowserAsync(url);
      // Au retour, l'utilisateur arrive sur la callback web → deep-link soutrapaiya://
      // On rafraîchit la liste de chambres pour refléter l'unavailability
      void search();
    } catch (err: any) {
      console.error('[hotel] reserve:', err);
      Alert.alert('Erreur', err.message || 'Réservation impossible');
    } finally {
      setBooking(false);
    }
  }, [user, checkIn, checkOut, guestsAdults, guestsChildren, router, search]);

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
                {guestsAdults} adulte{guestsAdults > 1 ? 's' : ''}
                {guestsChildren > 0 ? ` · ${guestsChildren} enfant${guestsChildren > 1 ? 's' : ''}` : ''}
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
              <RoomCard key={r.room_id} c={c} room={r} nights={nights} onPress={() => setSelected(r)} />
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
            <GuestRow
              c={c}
              label="Adultes"
              value={guestsAdults}
              min={1} max={10}
              onChange={(v) => { setGuestsAdults(v); setSearched(false); }}
            />
            <GuestRow
              c={c}
              label="Enfants"
              value={guestsChildren}
              min={0} max={10}
              onChange={(v) => { setGuestsChildren(v); setSearched(false); }}
            />
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

/* ─────────────────────────────────────────────────── *
 *  ROOM CARD                                          *
 * ─────────────────────────────────────────────────── */

function RoomCard({ c, room, nights, onPress }: { c: ColorPalette; room: AvailableRoom; nights: number; onPress: () => void }) {
  const s = useMemo(() => makeStyles(c), [c]);
  const total = room.price_per_night_xof * nights;
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
        {room.available_count <= 2 && (
          <View style={s.scarcityBadge}>
            <Text style={s.scarcityText}>
              Plus que {room.available_count} dispo{room.available_count > 1 ? 's' : ''}
            </Text>
          </View>
        )}
      </View>
      <View style={s.roomBody}>
        {room.room_type && <Text style={s.roomType}>{room.room_type}</Text>}
        <Text style={s.roomName} numberOfLines={2}>{room.name}</Text>
        <View style={s.roomMeta}>
          <Ionicons name="people-outline" size={14} color={c.neutral[600]} />
          <Text style={s.roomMetaText}>
            {room.capacity_adults} adulte{room.capacity_adults > 1 ? 's' : ''}
            {room.capacity_children > 0 ? ` · ${room.capacity_children} enf.` : ''}
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
            <Text style={s.roomTotal}>{formatXOF(total)}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

/* ─────────────────────────────────────────────────── *
 *  GUEST ROW                                          *
 * ─────────────────────────────────────────────────── */

function GuestRow({ c, label, value, min, max, onChange }: {
  c: ColorPalette; label: string; value: number; min: number; max: number; onChange: (v: number) => void;
}) {
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <View style={s.guestRow}>
      <Text style={s.guestLabel}>{label}</Text>
      <View style={s.qtyRow}>
        <Pressable
          onPress={() => onChange(Math.max(min, value - 1))}
          style={[s.qtyBtn, value <= min && s.qtyBtnDisabled]}
          hitSlop={6}
          disabled={value <= min}
        >
          <Ionicons name="remove" size={18} color={value <= min ? c.neutral[400] : c.dark} />
        </Pressable>
        <Text style={s.qtyValue}>{value}</Text>
        <Pressable
          onPress={() => onChange(Math.min(max, value + 1))}
          style={[s.qtyBtn, value >= max && s.qtyBtnDisabled]}
          hitSlop={6}
          disabled={value >= max}
        >
          <Ionicons name="add" size={18} color={value >= max ? c.neutral[400] : c.dark} />
        </Pressable>
      </View>
    </View>
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
  const total = room.price_per_night_xof * nights;

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
              <Text style={s.roomMetaText}>
                {room.capacity_adults} adulte{room.capacity_adults > 1 ? 's' : ''}
                {room.capacity_children > 0 ? ` · ${room.capacity_children} enf.` : ''}
              </Text>
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

    // Search card
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

    // Empty
    empty: { alignItems: 'center', padding: spacing.xl, gap: spacing.sm, marginTop: spacing.lg },
    emptyTitle: { fontSize: typography.fontSize.base, fontWeight: '700', color: c.dark },
    emptyBody: { fontSize: typography.fontSize.sm, color: c.neutral[600], textAlign: 'center', paddingHorizontal: spacing.lg },

    // Room list
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
    scarcityBadge: {
      position: 'absolute', top: spacing.sm, left: spacing.sm,
      backgroundColor: c.warning?.[500] ?? '#f59e0b',
      paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.full,
    },
    scarcityText: { color: '#fff', fontWeight: '700', fontSize: 10, letterSpacing: 0.5 },
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

    // Modal
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

    // Guest modal
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
