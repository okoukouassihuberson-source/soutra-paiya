import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ScrollView, View, Text, Pressable, StyleSheet, RefreshControl, ActivityIndicator,
  Image, Modal, Alert, TextInput, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { typography, radius, spacing, formatXOF, type ColorPalette } from '@soutra/shared';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useColors } from '@/lib/theme';
import { ScreenHeader } from '@/components/ScreenHeader';

/**
 * /hotel/[venueId] — recherche + réservation de chambre.
 *
 * Pattern miroir de /shop/[venueId] mais adapté à la nuitée :
 *   1. Sélection check-in / check-out (DATE, pas timestamptz)
 *   2. Nombre d'invités
 *   3. Appel RPC list_available_rooms → liste filtrée des chambres dispo
 *   4. Tap sur une chambre → modal détail + bouton Réserver
 *   5. Réserver → RPC create_room_booking → redirect vers /hotel-bookings
 *      pour passer au paiement Paystack
 */

interface VenueLite {
  id: string;
  name: string;
  category: string;
  cover_url: string | null;
}

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

// Helpers DATE (YYYY-MM-DD, sans fuseau — la migration travaille en DATE).
function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}
function nightsBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return Math.max(1, Math.round(ms / 86_400_000));
}
function formatDateFR(d: Date): string {
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' });
}

export default function HotelScreen() {
  const { venueId } = useLocalSearchParams<{ venueId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  const [venue, setVenue] = useState<VenueLite | null>(null);
  const [rooms, setRooms] = useState<AvailableRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<AvailableRoom | null>(null);

  // Par défaut : check-in demain, check-out après-demain, 2 personnes
  const [checkIn, setCheckIn] = useState<Date>(() => addDays(new Date(), 1));
  const [checkOut, setCheckOut] = useState<Date>(() => addDays(new Date(), 2));
  const [guests, setGuests] = useState<number>(2);
  const [showCheckInPicker, setShowCheckInPicker] = useState(false);
  const [showCheckOutPicker, setShowCheckOutPicker] = useState(false);

  const nights = useMemo(() => nightsBetween(checkIn, checkOut), [checkIn, checkOut]);

  const loadVenue = useCallback(async () => {
    if (!venueId) { setLoading(false); return; }
    const { data, error } = await supabase
      .from('venues')
      .select('id, name, category, cover_url')
      .eq('id', venueId)
      .maybeSingle();
    if (error) {
      console.error('[hotel] load venue:', error);
      setVenue(null);
    } else {
      setVenue(data as VenueLite | null);
    }
    setLoading(false);
  }, [venueId]);

  const search = useCallback(async () => {
    if (!venueId) return;
    setSearching(true);
    try {
      const { data, error } = await (supabase.rpc as any)('list_available_rooms', {
        p_venue_id: venueId,
        p_check_in: toIsoDate(checkIn),
        p_check_out: toIsoDate(checkOut),
        p_guests: guests,
      });
      if (error) {
        console.error('[hotel] list_available_rooms:', error);
        Alert.alert('Erreur', error.message || 'Impossible de charger les chambres');
        setRooms([]);
      } else {
        setRooms((data as AvailableRoom[]) ?? []);
      }
    } finally {
      setSearching(false);
      setRefreshing(false);
    }
  }, [venueId, checkIn, checkOut, guests]);

  useEffect(() => { loadVenue(); }, [loadVenue]);
  useEffect(() => { search(); }, [search]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    search();
  }, [search]);

  const onCheckInChange = useCallback((_e: unknown, d?: Date) => {
    setShowCheckInPicker(Platform.OS === 'ios');
    if (!d) return;
    setCheckIn(d);
    // Si le check-out devient invalide, on le pousse à check-in + 1
    if (checkOut <= d) setCheckOut(addDays(d, 1));
  }, [checkOut]);

  const onCheckOutChange = useCallback((_e: unknown, d?: Date) => {
    setShowCheckOutPicker(Platform.OS === 'ios');
    if (!d) return;
    if (d <= checkIn) {
      Alert.alert('Date invalide', 'Le check-out doit être au moins 1 jour après le check-in.');
      return;
    }
    setCheckOut(d);
  }, [checkIn]);

  const onBooked = useCallback(() => {
    setSelected(null);
    router.replace('/hotel-bookings' as any);
  }, [router]);

  if (loading && !venue) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <ScreenHeader title="Hôtel" />
        <View style={s.center}><ActivityIndicator color={c.primary[500]} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader
        title={venue?.name || 'Hôtel'}
        subtitle={`${nights} nuit${nights > 1 ? 's' : ''} · ${guests} invité${guests > 1 ? 's' : ''}`}
      />

      <ScrollView
        contentContainerStyle={s.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* SEARCH PANEL */}
        <View style={s.panel}>
          <Text style={s.panelTitle}>Votre séjour</Text>

          <View style={s.row}>
            <Pressable
              style={({ pressed }) => [s.dateBox, pressed && { opacity: 0.85 }]}
              onPress={() => setShowCheckInPicker(true)}
            >
              <Text style={s.dateLabel}>Arrivée</Text>
              <Text style={s.dateValue}>{formatDateFR(checkIn)}</Text>
            </Pressable>

            <View style={s.arrowBox}>
              <Ionicons name="arrow-forward" size={18} color={c.neutral[500]} />
            </View>

            <Pressable
              style={({ pressed }) => [s.dateBox, pressed && { opacity: 0.85 }]}
              onPress={() => setShowCheckOutPicker(true)}
            >
              <Text style={s.dateLabel}>Départ</Text>
              <Text style={s.dateValue}>{formatDateFR(checkOut)}</Text>
            </Pressable>
          </View>

          <View style={[s.row, { marginTop: spacing.md }]}>
            <View style={s.guestsBox}>
              <Text style={s.dateLabel}>Invités</Text>
              <View style={s.guestsRow}>
                <Pressable
                  onPress={() => setGuests((g) => Math.max(1, g - 1))}
                  style={s.qtyBtn}
                  hitSlop={6}
                >
                  <Ionicons name="remove" size={18} color={c.dark} />
                </Pressable>
                <Text style={s.qtyValue}>{guests}</Text>
                <Pressable
                  onPress={() => setGuests((g) => Math.min(20, g + 1))}
                  style={s.qtyBtn}
                  hitSlop={6}
                >
                  <Ionicons name="add" size={18} color={c.dark} />
                </Pressable>
              </View>
            </View>

            <View style={s.summaryBox}>
              <Text style={s.dateLabel}>Durée</Text>
              <Text style={s.dateValue}>{nights} nuit{nights > 1 ? 's' : ''}</Text>
            </View>
          </View>
        </View>

        {showCheckInPicker && (
          <DateTimePicker
            value={checkIn}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            minimumDate={new Date()}
            onChange={onCheckInChange}
          />
        )}
        {showCheckOutPicker && (
          <DateTimePicker
            value={checkOut}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            minimumDate={addDays(checkIn, 1)}
            onChange={onCheckOutChange}
          />
        )}

        {/* RESULTS */}
        {searching ? (
          <View style={s.center}>
            <ActivityIndicator color={c.primary[500]} />
            <Text style={s.searchingText}>Recherche des chambres disponibles…</Text>
          </View>
        ) : rooms.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="bed-outline" size={56} color={c.neutral[400]} />
            <Text style={s.emptyTitle}>Aucune chambre disponible</Text>
            <Text style={s.emptyBody}>
              Modifie les dates ou le nombre d&apos;invités pour voir d&apos;autres options.
            </Text>
          </View>
        ) : (
          <View style={s.list}>
            <Text style={s.resultsLabel}>
              {rooms.length} chambre{rooms.length > 1 ? 's' : ''} disponible{rooms.length > 1 ? 's' : ''}
            </Text>
            {rooms.map((r) => (
              <RoomCard key={r.id} c={c} room={r} nights={nights} onPress={() => setSelected(r)} />
            ))}
          </View>
        )}
      </ScrollView>

      <RoomDetailModal
        room={selected}
        nights={nights}
        guests={guests}
        checkIn={checkIn}
        checkOut={checkOut}
        onClose={() => setSelected(null)}
        onBooked={onBooked}
        userId={user?.id ?? null}
      />
    </SafeAreaView>
  );
}

/* ─────────────────────────────────────────────────── *
 *  ROOM CARD                                          *
 * ─────────────────────────────────────────────────── */

function RoomCard({
  c, room, nights, onPress,
}: { c: ColorPalette; room: AvailableRoom; nights: number; onPress: () => void }) {
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.card, pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] }]}
    >
      <View style={s.cardImg}>
        {room.photos[0] ? (
          <Image source={{ uri: room.photos[0] }} style={s.cardImgFill} />
        ) : (
          <View style={[s.cardImgFill, s.cardImgPlaceholder]}>
            <Ionicons name="bed-outline" size={36} color={c.neutral[400]} />
          </View>
        )}
        <View style={s.capacityBadge}>
          <Ionicons name="person" size={11} color="#fff" />
          <Text style={s.capacityText}>{room.capacity}</Text>
        </View>
      </View>
      <View style={s.cardBody}>
        {room.room_type && <Text style={s.cardCat}>{room.room_type}</Text>}
        <Text style={s.cardName} numberOfLines={1}>{room.name}</Text>
        {room.amenities && room.amenities.length > 0 && (
          <Text style={s.cardAmenities} numberOfLines={1}>
            {room.amenities.slice(0, 3).join(' · ')}
          </Text>
        )}
        <View style={s.cardPriceRow}>
          <Text style={s.cardPrice}>{formatXOF(room.price_per_night_xof)}</Text>
          <Text style={s.cardPriceUnit}>/nuit</Text>
        </View>
        <Text style={s.cardTotal}>
          Total {nights} nuit{nights > 1 ? 's' : ''} · {formatXOF(room.total_for_stay_xof)}
        </Text>
      </View>
    </Pressable>
  );
}

/* ─────────────────────────────────────────────────── *
 *  ROOM DETAIL MODAL + BOOK                           *
 * ─────────────────────────────────────────────────── */

function RoomDetailModal({
  room, nights, guests, checkIn, checkOut, onClose, onBooked, userId,
}: {
  room: AvailableRoom | null;
  nights: number;
  guests: number;
  checkIn: Date;
  checkOut: Date;
  onClose: () => void;
  onBooked: () => void;
  userId: string | null;
}) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const [booking, setBooking] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    // Reset à chaque ouverture
    if (room) {
      setContactName('');
      setContactPhone('');
      setNotes('');
    }
  }, [room]);

  const handleBook = useCallback(async () => {
    if (!room) return;
    if (!userId) {
      Alert.alert('Connexion requise', 'Connecte-toi pour réserver une chambre.');
      return;
    }
    setBooking(true);
    try {
      const { data, error } = await (supabase.rpc as any)('create_room_booking', {
        p_room_id: room.id,
        p_check_in: toIsoDate(checkIn),
        p_check_out: toIsoDate(checkOut),
        p_guests: guests,
        p_contact_name: contactName.trim() || null,
        p_contact_phone: contactPhone.trim() || null,
        p_notes: notes.trim() || null,
      });
      if (error) {
        // Erreurs métier remontées en français lisible
        const msg = String(error.message || '');
        if (msg.includes('PERIOD_TAKEN')) {
          Alert.alert(
            'Chambre prise',
            'Cette chambre vient d\'être réservée par quelqu\'un d\'autre. Choisis-en une autre.',
          );
        } else if (msg.includes('CAPACITY_EXCEEDED')) {
          Alert.alert('Capacité dépassée', 'Cette chambre ne peut pas accueillir autant d\'invités.');
        } else if (msg.includes('INVALID_PERIOD') || msg.includes('CHECK_IN_IN_PAST')) {
          Alert.alert('Dates invalides', 'Vérifie tes dates de check-in et check-out.');
        } else if (msg.includes('NOT_AUTHENTICATED')) {
          Alert.alert('Connexion requise', 'Connecte-toi pour réserver.');
        } else {
          Alert.alert('Erreur', msg || 'Impossible de créer la réservation');
        }
        return;
      }
      const result = data as { ok: boolean; booking_number?: string };
      Alert.alert(
        'Réservation créée',
        `Ta réservation ${result?.booking_number ?? ''} est en attente de paiement.`,
      );
      onBooked();
    } finally {
      setBooking(false);
    }
  }, [room, userId, checkIn, checkOut, guests, contactName, contactPhone, notes, onBooked]);

  if (!room) return null;

  return (
    <Modal visible={!!room} onRequestClose={onClose} animationType="slide" transparent>
      <View style={s.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={s.modalSheet}>
          <View style={s.modalHandle} />
          <ScrollView contentContainerStyle={s.modalContent} showsVerticalScrollIndicator={false}>
            {room.photos[0] ? (
              <Image source={{ uri: room.photos[0] }} style={s.modalImg} />
            ) : (
              <View style={[s.modalImg, s.cardImgPlaceholder]}>
                <Ionicons name="bed-outline" size={48} color={c.neutral[400]} />
              </View>
            )}

            {room.room_type && <Text style={s.modalCat}>{room.room_type}</Text>}
            <Text style={s.modalName}>{room.name}</Text>
            <View style={s.modalPriceRow}>
              <Text style={s.modalPrice}>{formatXOF(room.price_per_night_xof)}</Text>
              <Text style={s.modalPriceUnit}>/nuit</Text>
            </View>

            {room.description && (
              <Text style={s.modalDesc}>{room.description}</Text>
            )}

            {/* Stay recap */}
            <View style={s.recap}>
              <RecapRow c={c} label="Arrivée" value={formatDateFR(checkIn)} />
              <RecapRow c={c} label="Départ" value={formatDateFR(checkOut)} />
              <RecapRow c={c} label="Durée" value={`${nights} nuit${nights > 1 ? 's' : ''}`} />
              <RecapRow c={c} label="Invités" value={`${guests}`} />
              <View style={s.recapDivider} />
              <RecapRow c={c} label="Total" value={formatXOF(room.total_for_stay_xof)} bold />
            </View>

            {/* Amenities */}
            {room.amenities && room.amenities.length > 0 && (
              <>
                <Text style={s.sectionLabel}>Équipements</Text>
                <View style={s.amenities}>
                  {room.amenities.map((a, i) => (
                    <View key={i} style={s.amenityPill}>
                      <Text style={s.amenityText}>{a}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* Contact form */}
            <Text style={s.sectionLabel}>Contact (optionnel)</Text>
            <TextInput
              value={contactName}
              onChangeText={setContactName}
              placeholder="Nom"
              placeholderTextColor={c.neutral[400]}
              style={s.input}
              maxLength={120}
            />
            <TextInput
              value={contactPhone}
              onChangeText={setContactPhone}
              placeholder="Téléphone"
              placeholderTextColor={c.neutral[400]}
              style={s.input}
              keyboardType="phone-pad"
              maxLength={40}
            />
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Notes (ex: arrivée tardive vers 23h)"
              placeholderTextColor={c.neutral[400]}
              style={[s.input, s.textarea]}
              multiline
              maxLength={1000}
            />

            {/* CTA */}
            <Pressable
              onPress={handleBook}
              disabled={booking}
              style={({ pressed }) => [s.bookBtn, (booking || pressed) && { opacity: 0.85 }]}
            >
              <Ionicons name="bed" size={20} color="#fff" />
              <Text style={s.bookBtnText}>
                {booking ? 'Création…' : `Réserver · ${formatXOF(room.total_for_stay_xof)}`}
              </Text>
            </Pressable>
            <Text style={s.bookHint}>
              Tu paieras ensuite via Paystack depuis &laquo; Mes réservations &raquo;.
            </Text>

            <Pressable onPress={onClose} style={s.cancelBtn}>
              <Text style={s.cancelBtnText}>Annuler</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function RecapRow({
  c, label, value, bold = false,
}: { c: ColorPalette; label: string; value: string; bold?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
      <Text style={{ color: bold ? c.dark : c.neutral[600], fontWeight: bold ? '800' : '500', fontSize: typography.fontSize.sm }}>
        {label}
      </Text>
      <Text style={{ color: bold ? c.dark : c.neutral[700], fontWeight: bold ? '800' : '600', fontSize: typography.fontSize.sm, fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
    </View>
  );
}

/* ─────────────────────────────────────────────────── *
 *  STYLES                                             *
 * ─────────────────────────────────────────────────── */

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.light },
    center: { padding: spacing.xl, alignItems: 'center', gap: spacing.sm },
    scrollContent: { paddingBottom: spacing['2xl'] },

    panel: {
      backgroundColor: '#fff',
      marginHorizontal: spacing.md,
      marginTop: spacing.md,
      padding: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 1, borderColor: c.neutral[200],
    },
    panelTitle: {
      fontSize: 11, color: c.neutral[600], fontWeight: '700',
      textTransform: 'uppercase', letterSpacing: 0.8,
      marginBottom: spacing.sm,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    dateBox: {
      flex: 1,
      backgroundColor: c.neutral[50],
      borderRadius: radius.md,
      paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
      borderWidth: 1, borderColor: c.neutral[200],
    },
    arrowBox: { paddingHorizontal: spacing.xs },
    dateLabel: { fontSize: 10, color: c.neutral[500], fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
    dateValue: { fontSize: typography.fontSize.sm, fontWeight: '700', color: c.dark, marginTop: 2 },

    guestsBox: {
      flex: 1,
      backgroundColor: c.neutral[50],
      borderRadius: radius.md,
      paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
      borderWidth: 1, borderColor: c.neutral[200],
    },
    guestsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 4 },
    qtyBtn: {
      width: 28, height: 28, borderRadius: 14,
      borderWidth: 1, borderColor: c.neutral[300],
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: '#fff',
    },
    qtyValue: { fontSize: typography.fontSize.base, fontWeight: '800', minWidth: 22, textAlign: 'center', color: c.dark, fontVariant: ['tabular-nums'] },
    summaryBox: {
      flex: 1,
      backgroundColor: c.primary[50],
      borderRadius: radius.md,
      paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
      borderWidth: 1, borderColor: c.primary[200],
    },

    searchingText: { fontSize: typography.fontSize.sm, color: c.neutral[600] },

    empty: { alignItems: 'center', padding: spacing.xl, gap: spacing.sm, marginTop: spacing.xl },
    emptyTitle: { fontSize: typography.fontSize.base, fontWeight: '700', color: c.dark },
    emptyBody: { fontSize: typography.fontSize.sm, color: c.neutral[600], textAlign: 'center' },

    list: { paddingHorizontal: spacing.md, paddingTop: spacing.md, gap: spacing.sm },
    resultsLabel: { fontSize: 11, color: c.neutral[600], fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },

    card: {
      backgroundColor: '#fff',
      borderRadius: radius.lg,
      overflow: 'hidden',
      borderWidth: 1, borderColor: c.neutral[200],
      flexDirection: 'row',
    },
    cardImg: { width: 120, height: 120, position: 'relative' },
    cardImgFill: { ...StyleSheet.absoluteFillObject },
    cardImgPlaceholder: { backgroundColor: c.neutral[100], alignItems: 'center', justifyContent: 'center' },
    capacityBadge: {
      position: 'absolute', top: spacing.xs, left: spacing.xs,
      flexDirection: 'row', alignItems: 'center', gap: 2,
      backgroundColor: 'rgba(0,0,0,0.6)',
      paddingHorizontal: 6, paddingVertical: 2,
      borderRadius: radius.full,
    },
    capacityText: { color: '#fff', fontSize: 10, fontWeight: '800' },
    cardBody: { flex: 1, padding: spacing.sm, gap: 2 },
    cardCat: { fontSize: 10, color: c.primary[600], fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
    cardName: { fontSize: typography.fontSize.base, fontWeight: '700', color: c.dark },
    cardAmenities: { fontSize: 11, color: c.neutral[500], marginTop: 2 },
    cardPriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 6 },
    cardPrice: { fontSize: typography.fontSize.base, fontWeight: '900', color: c.dark, fontVariant: ['tabular-nums'] },
    cardPriceUnit: { fontSize: 11, color: c.neutral[500], fontWeight: '600' },
    cardTotal: { fontSize: 11, color: c.primary[700], fontWeight: '700', marginTop: 2 },

    // Modal
    modalBackdrop: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
      justifyContent: 'flex-end',
    },
    modalSheet: {
      backgroundColor: c.light,
      borderTopLeftRadius: 28, borderTopRightRadius: 28,
      maxHeight: '92%',
      paddingTop: spacing.sm,
    },
    modalHandle: {
      alignSelf: 'center', width: 44, height: 4,
      borderRadius: 2, backgroundColor: c.neutral[300],
      marginBottom: spacing.sm,
    },
    modalContent: { padding: spacing.lg, paddingBottom: spacing['2xl'] },
    modalImg: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.lg, marginBottom: spacing.md, backgroundColor: c.neutral[100] },
    modalCat: { fontSize: 11, color: c.primary[600], fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
    modalName: { fontSize: typography.fontSize.xl, fontWeight: '800', color: c.dark, marginTop: 4 },
    modalPriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: spacing.xs },
    modalPrice: { fontSize: typography.fontSize.xl, fontWeight: '900', color: c.primary[600], fontVariant: ['tabular-nums'] },
    modalPriceUnit: { fontSize: typography.fontSize.sm, color: c.neutral[600], fontWeight: '600' },
    modalDesc: { fontSize: typography.fontSize.sm, color: c.neutral[700], marginTop: spacing.md, lineHeight: 20 },

    recap: {
      marginTop: spacing.lg,
      padding: spacing.md,
      backgroundColor: '#fff',
      borderRadius: radius.lg,
      borderWidth: 1, borderColor: c.neutral[200],
    },
    recapDivider: { height: 1, backgroundColor: c.neutral[200], marginVertical: spacing.xs },

    sectionLabel: {
      fontSize: 11, color: c.neutral[600], fontWeight: '700',
      textTransform: 'uppercase', letterSpacing: 0.8,
      marginTop: spacing.lg, marginBottom: spacing.xs,
    },
    amenities: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
    amenityPill: {
      paddingHorizontal: spacing.sm, paddingVertical: 4,
      borderRadius: radius.full,
      backgroundColor: c.neutral[100],
    },
    amenityText: { fontSize: typography.fontSize.xs, color: c.neutral[700], fontWeight: '600' },

    input: {
      backgroundColor: '#fff',
      borderRadius: radius.md,
      borderWidth: 1, borderColor: c.neutral[300],
      paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
      fontSize: typography.fontSize.sm,
      color: c.dark,
      marginTop: spacing.xs,
    },
    textarea: { minHeight: 80, textAlignVertical: 'top' },

    bookBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
      backgroundColor: c.primary[500],
      paddingVertical: spacing.md + 2, borderRadius: radius.full,
      marginTop: spacing.xl,
      shadowColor: c.primary[500], shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4,
    },
    bookBtnText: { color: '#fff', fontWeight: '800', fontSize: typography.fontSize.base, fontVariant: ['tabular-nums'] },
    bookHint: { fontSize: typography.fontSize.xs, color: c.neutral[600], textAlign: 'center', marginTop: spacing.sm },
    cancelBtn: { marginTop: spacing.sm, paddingVertical: spacing.sm, alignItems: 'center' },
    cancelBtnText: { color: c.neutral[600], fontWeight: '600' },
  });
}
