// ============================================================================
// /event/[id] — fiche événement + achat de billet (Phase 4 refonte UX).
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import {
  ScrollView, View, Text, Pressable, StyleSheet, Image, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { typography, radius, spacing, formatXOF, type ColorPalette } from '@soutra/shared';
import { supabase } from '@/lib/supabase';
import { useColors } from '@/lib/theme';
import { ScreenHeader } from '@/components/ScreenHeader';
import { payForTicket } from '@/lib/geniuspay';

interface TicketTier {
  name: string;
  price_xof: number;
  qty: number;
  sold: number;
}

interface EventDetail {
  event_id: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  starts_at: string;
  ends_at: string;
  capacity: number | null;
  ticket_tiers: TicketTier[];
  status: string;
  city: string | null;
  organizer_name: string | null;
  venue: { id: string; name: string; address: string | null; cover_url: string | null; district: string | null } | null;
}

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<'detail' | 'confirmation'>('detail');

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const { data, error } = await (supabase.rpc as any)('get_event_detail', { p_event_id: id });
        if (error) throw error;
        setEvent(data as EventDetail);
      } catch (err: any) {
        Alert.alert('Erreur', err?.message === 'EVENT_NOT_FOUND' ? 'Événement introuvable.' : "Impossible de charger l'événement.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const buy = async () => {
    if (!event || !selectedTier) return;
    try {
      setSubmitting(true);
      const result = await payForTicket({ eventId: event.event_id, tierName: selectedTier });
      if (result.status === 'success') {
        setStep('confirmation');
      } else if (result.status === 'pending') {
        Alert.alert(
          'Paiement en cours',
          'Ton billet est en cours de validation. Il apparaîtra dans tes billets une fois confirmé.',
          [{ text: 'OK', onPress: () => setStep('confirmation') }],
        );
      } else {
        Alert.alert('Paiement non abouti', "Le paiement n'a pas abouti, le billet n'a pas été acheté. Réessaie.");
      }
    } catch (err: any) {
      Alert.alert('Erreur', err?.message ?? "Impossible d'acheter ce billet.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <ActivityIndicator size="large" color={c.primary[500]} style={s.center} />
      </SafeAreaView>
    );
  }

  if (!event) {
    return (
      <SafeAreaView style={s.safe}>
        <ScreenHeader title="Événement" />
        <View style={s.center}>
          <Text style={s.errorText}>Événement introuvable</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (step === 'confirmation') {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}>
          <View style={s.successIcon}>
            <Ionicons name="checkmark" size={32} color="#fff" />
          </View>
          <Text style={s.confirmTitle}>Billet acheté 🎉</Text>
          <Text style={s.confirmText}>Ton billet pour {event.title} est disponible dans tes billets.</Text>
          <Pressable style={s.ctaButton} onPress={() => router.push('/(tabs)/tickets')}>
            <Text style={s.ctaText}>Voir mes billets</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const tiers = event.ticket_tiers ?? [];
  const hasTiers = tiers.length > 0;
  const selected = tiers.find((t) => t.name === selectedTier) ?? null;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader title="Événement" />
      <ScrollView contentContainerStyle={{ paddingBottom: spacing['2xl'] }}>
        <View style={s.hero}>
          {event.cover_url ? (
            <Image source={{ uri: event.cover_url }} style={StyleSheet.absoluteFill} />
          ) : (
            <Text style={s.heroFallback}>🎉</Text>
          )}
        </View>

        <View style={s.content}>
          <Text style={s.title}>{event.title}</Text>

          <View style={s.infoRow}>
            <Ionicons name="calendar-outline" size={18} color={c.primary[500]} />
            <Text style={s.infoText}>{formatDateRange(event.starts_at, event.ends_at)}</Text>
          </View>
          <View style={s.infoRow}>
            <Ionicons name="location-outline" size={18} color={c.primary[500]} />
            <Text style={s.infoText}>
              {event.venue ? `${event.venue.name}${event.venue.address ? ` — ${event.venue.address}` : ''}` : (event.city ?? 'Lieu à confirmer')}
            </Text>
          </View>
          {event.organizer_name && (
            <View style={s.infoRow}>
              <Ionicons name="person-outline" size={18} color={c.primary[500]} />
              <Text style={s.infoText}>Organisé par {event.organizer_name}</Text>
            </View>
          )}

          {event.description && (
            <>
              <Text style={s.sectionTitle}>Programme</Text>
              <Text style={s.description}>{event.description}</Text>
            </>
          )}

          <Text style={s.sectionTitle}>Billets</Text>
          {!hasTiers ? (
            <View style={s.freeBanner}>
              <Ionicons name="information-circle-outline" size={18} color={c.primary[600]} />
              <Text style={s.freeBannerText}>Entrée libre — présente-toi directement sur place.</Text>
            </View>
          ) : (
            tiers.map((tier) => {
              const remaining = tier.qty - tier.sold;
              const soldOut = remaining <= 0;
              const active = selectedTier === tier.name;
              return (
                <Pressable
                  key={tier.name}
                  disabled={soldOut}
                  onPress={() => setSelectedTier(tier.name)}
                  style={[s.tierRow, active && s.tierRowActive, soldOut && s.tierRowDisabled]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={s.tierName}>{tier.name}</Text>
                    <Text style={s.tierRemaining}>{soldOut ? 'Épuisé' : `${remaining} place${remaining > 1 ? 's' : ''} restante${remaining > 1 ? 's' : ''}`}</Text>
                  </View>
                  <Text style={s.tierPrice}>{formatXOF(tier.price_xof)}</Text>
                </Pressable>
              );
            })
          )}
        </View>
      </ScrollView>

      {hasTiers && (
        <View style={s.footer}>
          <Pressable
            disabled={!selected || submitting}
            onPress={buy}
            style={({ pressed }) => [
              s.ctaButton,
              (!selected || submitting) && s.ctaButtonDisabled,
              pressed && selected && !submitting && { opacity: 0.9 },
            ]}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.ctaText}>
                {selected ? `Acheter — ${formatXOF(selected.price_xof)}` : 'Choisis un tarif'}
              </Text>
            )}
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

function formatDateRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const dateStr = start.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' });
  const startTime = start.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const endTime = end.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${dateStr} · ${startTime} - ${endTime}`;
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.light },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xl },
    errorText: { fontSize: typography.fontSize.base, color: c.neutral[600] },
    hero: { width: '100%', height: 220, backgroundColor: c.neutral[100], alignItems: 'center', justifyContent: 'center' },
    heroFallback: { fontSize: 56 },
    content: { padding: spacing.lg },
    title: { fontSize: typography.fontSize['2xl'], fontWeight: '700', color: c.dark, marginBottom: spacing.md },
    infoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
    infoText: { flex: 1, fontSize: typography.fontSize.sm, color: c.neutral[700] },
    sectionTitle: { fontSize: typography.fontSize.lg, fontWeight: '700', color: c.dark, marginTop: spacing.lg, marginBottom: spacing.sm },
    description: { fontSize: typography.fontSize.sm, color: c.neutral[700], lineHeight: 20 },
    freeBanner: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      backgroundColor: c.primary[50], borderRadius: radius.md, padding: spacing.md,
    },
    freeBannerText: { flex: 1, fontSize: typography.fontSize.sm, color: c.primary[700] },
    tierRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingVertical: spacing.md, paddingHorizontal: spacing.md,
      borderRadius: radius.lg, borderWidth: 1, borderColor: c.neutral[200],
      backgroundColor: c.neutral[50], marginBottom: spacing.sm,
    },
    tierRowActive: { borderColor: c.primary[500], backgroundColor: c.primary[50] },
    tierRowDisabled: { opacity: 0.5 },
    tierName: { fontSize: typography.fontSize.sm, fontWeight: '700', color: c.dark },
    tierRemaining: { fontSize: typography.fontSize.xs, color: c.neutral[500], marginTop: 2 },
    tierPrice: { fontSize: typography.fontSize.base, fontWeight: '700', color: c.primary[600] },
    footer: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: c.neutral[100], backgroundColor: c.light },
    ctaButton: { backgroundColor: c.primary[500], borderRadius: radius.full, paddingVertical: spacing.lg, alignItems: 'center' },
    ctaButtonDisabled: { backgroundColor: c.neutral[200] },
    ctaText: { fontSize: typography.fontSize.base, fontWeight: '700', color: '#fff' },
    successIcon: {
      width: 64, height: 64, borderRadius: 32, backgroundColor: c.success,
      alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md,
    },
    confirmTitle: { fontSize: typography.fontSize.xl, fontWeight: '700', color: c.dark, marginBottom: spacing.sm },
    confirmText: { fontSize: typography.fontSize.sm, color: c.neutral[600], textAlign: 'center', marginBottom: spacing.lg },
  });
}
