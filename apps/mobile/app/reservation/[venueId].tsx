import { useState, useEffect } from 'react';
import { ScrollView, View, Text, Pressable, TextInput, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import QRCode from 'react-native-qrcode-svg';
import { colors, typography, radius, spacing, formatXOF, reservationFormSchema } from '@soutra/shared';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { payWithGeniuspay } from '@/lib/geniuspay';
import { validatePromoCode, applyDiscount, reasonLabel } from '@/lib/promo';

interface Venue {
  id: string;
  name: string;
  avg_price_xof: number;
}

const DEPOSIT_PERCENTAGE = 0.2; // 20% deposit

export default function ReservationForm() {
  const { venueId } = useLocalSearchParams<{ venueId: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [venue, setVenue] = useState<Venue | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<'form' | 'review' | 'confirmation'>('form');

  // Form fields
  const [selectedDate, setSelectedDate] = useState(new Date(Date.now() + 86400000)); // Tomorrow
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedTime, setSelectedTime] = useState(new Date());
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [partySize, setPartySize] = useState('2');
  const [notes, setNotes] = useState('');
  const [qrCode, setQrCode] = useState<string>('');

  // Code promo : saisie + validation côté serveur. `applied` est rempli
  // uniquement quand le code a passé `validate_promo_code`.
  const [promoInput, setPromoInput] = useState('');
  const [promoChecking, setPromoChecking] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [applied, setApplied] = useState<{ id: string; code: string; discount_pct: number } | null>(null);
  // Conservé entre deux tentatives : on ne recrée pas la réservation si le
  // paiement de l'acompte a échoué et que l'utilisateur réessaie.
  const [reservationId, setReservationId] = useState<string | null>(null);

  useEffect(() => {
    loadVenue();
  }, [venueId]);

  const loadVenue = async () => {
    if (!venueId) {
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('venues')
        .select('id, name, avg_price_xof')
        .eq('id', venueId)
        .maybeSingle();

      if (error) {
        console.error('[reservation] load venue error:', error);
        Alert.alert('Erreur', `Impossible de charger le lieu : ${error.message}`);
        setVenue(null);
      } else {
        setVenue(data as Venue | null);
      }
    } catch (err: any) {
      console.error('[reservation] unexpected:', err);
      setVenue(null);
    } finally {
      setLoading(false);
    }
  };

  const handleDateChange = (event: any, date?: Date) => {
    if (date) setSelectedDate(date);
    setShowDatePicker(false);
  };

  const handleTimeChange = (event: any, date?: Date) => {
    if (date) setSelectedTime(date);
    setShowTimePicker(false);
  };

  const calculateBaseDeposit = (): number => {
    if (!venue) return 0;
    const perPerson = venue.avg_price_xof ?? 0;
    const total = perPerson * parseInt(partySize || '1');
    return Math.ceil(total * DEPOSIT_PERCENTAGE);
  };

  const calculateDeposit = (): number => {
    const base = calculateBaseDeposit();
    if (!applied) return base;
    return applyDiscount(base, applied.discount_pct);
  };

  async function checkPromo() {
    if (!venue) return;
    setPromoError(null);
    if (!promoInput.trim()) { setApplied(null); return; }
    setPromoChecking(true);
    try {
      const res = await validatePromoCode(venue.id, promoInput.trim());
      if (res.ok) {
        setApplied({ id: res.promo_id, code: res.code, discount_pct: res.discount_pct });
      } else {
        setApplied(null);
        setPromoError(reasonLabel(res.reason));
      }
    } catch (err: any) {
      setApplied(null);
      setPromoError(err?.message ?? 'Validation impossible');
    } finally {
      setPromoChecking(false);
    }
  }

  function clearPromo() {
    setApplied(null);
    setPromoInput('');
    setPromoError(null);
  }

  const validateForm = () => {
    const formData = {
      date: selectedDate,
      party_size: parseInt(partySize),
      notes,
    };

    try {
      reservationFormSchema.parse(formData);
      return true;
    } catch (error) {
      Alert.alert('Validation', 'Veuillez remplir correctement tous les champs');
      return false;
    }
  };

  const createReservation = async () => {
    if (!validateForm()) return;
    if (!venue) {
      Alert.alert('Erreur', 'Lieu introuvable.');
      return;
    }
    if (!user?.id) {
      Alert.alert('Session expirée', 'Veuillez vous reconnecter.');
      router.replace('/(auth)/login');
      return;
    }

    try {
      setSubmitting(true);
      const deposit = calculateDeposit();

      // 1. Crée la réservation « pending » — une seule fois, même si le
      //    paiement échoue et que l'utilisateur réessaie.
      let resaId = reservationId;
      if (!resaId) {
        const dateTime = new Date(selectedDate);
        dateTime.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);

        const qrContent = `${venue.id.slice(0, 8)}-${user.id.slice(0, 8)}-${Date.now()}`;
        setQrCode(qrContent);

        const payload = {
          user_id: user.id,
          venue_id: venue.id,
          date_time: dateTime.toISOString(),
          party_size: parseInt(partySize, 10),
          deposit_xof: deposit,
          notes: notes || null,
          qr_code: qrContent.replace(/-/g, ''),
          status: 'pending' as const,
          // Le trigger `consume_promo_on_confirm` (migration 0028) incrémente
          // `uses_count` au passage en `confirmed`. Aucune action client requise.
          promo_code_id: applied?.id ?? null,
        };

        const { data: created, error: resError } = await (supabase as any)
          .from('reservations')
          .insert(payload)
          .select('id')
          .single();

        if (resError || !created) {
          console.error('[reservation] insert error:', resError);
          Alert.alert('Erreur réservation', resError?.message ?? 'Création impossible');
          return;
        }
        resaId = created.id as string;
        setReservationId(resaId);
      }

      // 2. Réservation sans acompte : confirmation directe.
      if (deposit < 100) {
        setStep('confirmation');
        return;
      }

      // 3. Paiement de l'acompte via GeniusPay. Le montant est déterminé
      //    côté serveur à partir de la réservation.
      const result = await payWithGeniuspay({
        purpose: 'reservation_deposit',
        reservationId: resaId,
      });

      if (result.status === 'success') {
        setStep('confirmation');
      } else if (result.status === 'pending') {
        Alert.alert(
          'Paiement en cours',
          'Ton acompte est en cours de validation. Ta réservation est enregistrée.',
          [{ text: 'OK', onPress: () => setStep('confirmation') }],
        );
      } else {
        Alert.alert(
          'Acompte non payé',
          "Ta réservation est enregistrée mais l'acompte n'a pas été réglé. " +
            'Touche « Continuer vers le paiement » pour réessayer.',
        );
      }
    } catch (err: any) {
      console.error('[reservation] unexpected:', err);
      Alert.alert('Erreur', err?.message ?? 'Impossible de créer la réservation');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || authLoading) {
    return (
      <SafeAreaView style={s.safe}>
        <ActivityIndicator size="large" color={colors.primary[500]} style={s.center} />
      </SafeAreaView>
    );
  }

  if (!venue) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}>
          <Text style={s.errorText}>Lieu non trouvé</Text>
          <Pressable style={[s.button, { marginTop: spacing.lg }]} onPress={() => router.back()}>
            <Text style={s.buttonText}>Retour</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const deposit = calculateDeposit();
  const dateTimeStr = `${selectedDate.toLocaleDateString()} à ${selectedTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;

  if (step === 'confirmation' && qrCode) {
    return (
      <SafeAreaView style={s.safe}>
        <ScrollView contentContainerStyle={s.scrollContent}>
          <View style={s.confirmationBox}>
            <Ionicons name="checkmark-circle" size={64} color={colors.success ?? colors.primary[500]} style={s.icon} />
            <Text style={s.confirmTitle}>Réservation confirmée!</Text>
            <Text style={s.confirmSubtitle}>Votre réservation est en attente d'approbation du restaurant.</Text>

            {/* QR Code */}
            <View style={s.qrContainer}>
              <QRCode value={qrCode} size={200} />
              <Text style={s.qrLabel}>Code de vérification</Text>
            </View>

            {/* Reservation Details */}
            <View style={s.detailsBox}>
              <DetailRow label="Restaurant" value={venue.name} />
              <DetailRow label="Date et heure" value={dateTimeStr} />
              <DetailRow label="Nombre de personnes" value={partySize} />
              <DetailRow label="Dépôt à payer" value={formatXOF(deposit)} />
            </View>

            {/* Info Box */}
            <View style={s.infoBox}>
              <Ionicons name="information-circle" size={20} color={colors.primary[500]} />
              <Text style={s.infoText}>
                Le restaurant a 48 heures pour confirmer votre réservation. Vous recevrez une notification.
              </Text>
            </View>

            <Pressable
              style={({ pressed }) => [s.button, pressed && { opacity: 0.85 }]}
              onPress={() => router.push('/(tabs)/explore')}
            >
              <Text style={s.buttonText}>Retour à l'accueil</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scrollContent}>
        {/* Header */}
        <View style={s.header}>
          <Pressable hitSlop={10} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={28} color={colors.dark} />
          </Pressable>
          <Text style={s.headerTitle}>Nouvelle réservation</Text>
          <View style={{ width: 28 }} />
        </View>

        {/* Restaurant Name */}
        <Text style={s.venueName}>{venue.name}</Text>

        {/* Form */}
        <View style={s.form}>
          {/* Date Picker */}
          <View style={s.fieldGroup}>
            <Text style={s.label}>Date</Text>
            <Pressable
              style={s.input}
              onPress={() => setShowDatePicker(true)}
            >
              <Ionicons name="calendar" size={20} color={colors.primary[500]} />
              <Text style={s.inputText}>{selectedDate.toLocaleDateString('fr-FR')}</Text>
            </Pressable>
            {showDatePicker && (
              <DateTimePicker
                value={selectedDate}
                mode="date"
                minimumDate={new Date()}
                onChange={handleDateChange}
              />
            )}
          </View>

          {/* Time Picker */}
          <View style={s.fieldGroup}>
            <Text style={s.label}>Heure</Text>
            <Pressable
              style={s.input}
              onPress={() => setShowTimePicker(true)}
            >
              <Ionicons name="time" size={20} color={colors.primary[500]} />
              <Text style={s.inputText}>
                {selectedTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </Pressable>
            {showTimePicker && (
              <DateTimePicker
                value={selectedTime}
                mode="time"
                onChange={handleTimeChange}
              />
            )}
          </View>

          {/* Party Size */}
          <View style={s.fieldGroup}>
            <Text style={s.label}>Nombre de personnes</Text>
            <View style={s.partySizeRow}>
              {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
                <Pressable
                  key={n}
                  style={[
                    s.partySizeBtn,
                    partySize === String(n) && s.partySizeBtnActive,
                  ]}
                  onPress={() => setPartySize(String(n))}
                >
                  <Text
                    style={[
                      s.partySizeText,
                      partySize === String(n) && s.partySizeTextActive,
                    ]}
                  >
                    {n}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Notes */}
          <View style={s.fieldGroup}>
            <Text style={s.label}>Notes spéciales (optionnel)</Text>
            <TextInput
              style={s.textarea}
              placeholder="Ex: Événement privé, pas d'ail, etc."
              placeholderTextColor={colors.neutral[400]}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
            />
          </View>

          {/* Code promo */}
          <View style={s.fieldGroup}>
            <Text style={s.label}>Code promo (optionnel)</Text>
            {applied ? (
              <View style={s.promoApplied}>
                <Ionicons name="pricetag" size={18} color={colors.success ?? colors.primary[500]} />
                <View style={{ flex: 1 }}>
                  <Text style={s.promoAppliedCode}>{applied.code}</Text>
                  <Text style={s.promoAppliedHint}>-{applied.discount_pct}% sur l'acompte</Text>
                </View>
                <Pressable onPress={clearPromo} hitSlop={10}>
                  <Ionicons name="close-circle" size={22} color={colors.neutral[500]} />
                </Pressable>
              </View>
            ) : (
              <View style={s.promoRow}>
                <TextInput
                  style={s.promoInput}
                  placeholder="ETE2026"
                  placeholderTextColor={colors.neutral[400]}
                  value={promoInput}
                  onChangeText={(v) => { setPromoInput(v.toUpperCase()); setPromoError(null); }}
                  autoCapitalize="characters"
                />
                <Pressable
                  style={[s.promoBtn, (!promoInput.trim() || promoChecking) && s.promoBtnDisabled]}
                  onPress={checkPromo}
                  disabled={!promoInput.trim() || promoChecking}
                >
                  {promoChecking ? <ActivityIndicator color="#fff" /> : <Text style={s.promoBtnText}>Appliquer</Text>}
                </Pressable>
              </View>
            )}
            {promoError && <Text style={s.promoError}>{promoError}</Text>}
          </View>

          {/* Price Summary */}
          <View style={s.summary}>
            <SummaryRow
              label="Prix moyen/pers"
              value={formatXOF(venue.avg_price_xof ?? 0)}
            />
            <SummaryRow
              label="Nombre de personnes"
              value={partySize}
            />
            <SummaryRow
              label="Total estimé"
              value={formatXOF((venue.avg_price_xof ?? 0) * parseInt(partySize))}
            />
            <View style={s.summaryDivider} />
            <SummaryRow label="Acompte (20%)" value={formatXOF(calculateBaseDeposit())} />
            {applied && (
              <SummaryRow
                label={`Promo ${applied.code} (-${applied.discount_pct}%)`}
                value={`- ${formatXOF(calculateBaseDeposit() - deposit)}`}
              />
            )}
            <View style={s.summaryDivider} />
            <SummaryRow
              label="À payer"
              value={formatXOF(deposit)}
              bold
            />
          </View>

          {/* CTA */}
          <Pressable
            style={({ pressed }) => [s.button, pressed && { opacity: 0.85 }, submitting && s.buttonDisabled]}
            onPress={createReservation}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.buttonText}>Continuer vers le paiement</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.detailRow}>
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={s.detailValue}>{value}</Text>
    </View>
  );
}

function SummaryRow({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <View style={s.summaryRow}>
      <Text style={[s.summaryLabel, bold && s.summaryLabelBold]}>
        {label}
      </Text>
      <Text style={[s.summaryValue, bold && s.summaryValueBold]}>
        {value}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.light },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { paddingBottom: spacing['2xl'] },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.base,
  },
  headerTitle: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.dark },
  venueName: {
    paddingHorizontal: spacing.lg,
    fontSize: typography.fontSize['2xl'],
    fontWeight: '700',
    color: colors.dark,
    marginBottom: spacing.md,
  },
  form: { paddingHorizontal: spacing.lg },
  fieldGroup: { marginBottom: spacing.lg },
  label: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.dark, marginBottom: spacing.sm },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  inputText: { flex: 1, fontSize: typography.fontSize.base, color: colors.dark },
  partySizeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  partySizeBtn: {
    flex: 0.3,
    aspectRatio: 1,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.neutral[300],
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  partySizeBtnActive: { borderColor: colors.primary[500], backgroundColor: colors.primary[50] ?? '#fff' },
  partySizeText: { fontSize: typography.fontSize.base, fontWeight: '600', color: colors.neutral[600] },
  partySizeTextActive: { color: colors.primary[500] },
  textarea: {
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: typography.fontSize.sm,
    color: colors.dark,
    textAlignVertical: 'top',
  },
  summary: {
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginVertical: spacing.lg,
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md },
  summaryLabel: { fontSize: typography.fontSize.sm, color: colors.neutral[600] },
  summaryLabelBold: { fontWeight: '700', color: colors.dark },
  summaryValue: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.dark },
  summaryValueBold: { fontSize: typography.fontSize.lg, color: colors.primary[500] },
  summaryDivider: { height: 1, backgroundColor: colors.neutral[200], marginVertical: spacing.md },
  promoRow: { flexDirection: 'row', gap: spacing.sm },
  promoInput: { flex: 1, backgroundColor: '#fff', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.neutral[200], paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: typography.fontSize.sm, color: colors.dark },
  promoBtn: { backgroundColor: colors.primary[500], borderRadius: radius.lg, paddingHorizontal: spacing.lg, alignItems: 'center', justifyContent: 'center', minWidth: 100 },
  promoBtnDisabled: { backgroundColor: colors.neutral[300] },
  promoBtnText: { color: '#fff', fontWeight: '700', fontSize: typography.fontSize.sm },
  promoError: { marginTop: spacing.xs, fontSize: typography.fontSize.xs, color: colors.danger ?? '#dc2626' },
  promoApplied: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, backgroundColor: '#dcfce7', borderRadius: radius.lg },
  promoAppliedCode: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.dark, fontFamily: 'monospace' },
  promoAppliedHint: { fontSize: typography.fontSize.xs, color: colors.success ?? colors.primary[500], fontWeight: '600' },
  button: {
    backgroundColor: colors.primary[500],
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { fontSize: typography.fontSize.base, fontWeight: '700', color: '#fff' },
  errorText: { fontSize: typography.fontSize.base, color: colors.danger ?? colors.primary[500] },

  // Confirmation screen
  confirmationBox: { padding: spacing.lg, alignItems: 'center' },
  icon: { marginVertical: spacing.lg },
  confirmTitle: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: '700',
    color: colors.dark,
    marginBottom: spacing.sm,
  },
  confirmSubtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.neutral[600],
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  qrContainer: { marginVertical: spacing.lg, alignItems: 'center' },
  qrLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.neutral[600],
    marginTop: spacing.md,
  },
  detailsBox: {
    backgroundColor: colors.neutral[50] ?? '#f5f5f5',
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginVertical: spacing.lg,
    width: '100%',
  },
  detailRow: { marginBottom: spacing.md, flexDirection: 'row', justifyContent: 'space-between' },
  detailLabel: { fontSize: typography.fontSize.sm, color: colors.neutral[600] },
  detailValue: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.dark },
  infoBox: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.primary[50] ?? '#fff',
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginVertical: spacing.lg,
  },
  infoText: { flex: 1, fontSize: typography.fontSize.sm, color: colors.neutral[700] },
});
