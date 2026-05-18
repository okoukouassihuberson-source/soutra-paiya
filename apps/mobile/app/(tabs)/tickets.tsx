import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, radius, spacing, formatXOF } from '@soutra/shared';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

interface Reservation {
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

export default function Tickets() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadReservations = useCallback(async () => {
    // Si pas d'utilisateur connecté, on arrête le loader immédiatement
    if (!user?.id) {
      setReservations([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('reservations')
        .select(`
          id,
          venue_id,
          date_time,
          party_size,
          deposit_xof,
          status,
          qr_code,
          notes,
          created_at,
          venue:venues(id, name, cover_url, city, district)
        `)
        .eq('user_id', user.id)
        .order('date_time', { ascending: false })
        .limit(50);

      if (error) {
        console.error('[tickets] load error:', error);
        Alert.alert('Erreur', `Impossible de charger les réservations : ${error.message}`);
        setReservations([]);
      } else {
        setReservations((data ?? []) as unknown as Reservation[]);
      }
    } catch (err: any) {
      console.error('[tickets] unexpected:', err);
      Alert.alert('Erreur', err?.message ?? 'Erreur inattendue');
      setReservations([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    // On attend que authLoading soit terminé avant de charger
    if (authLoading) return;
    loadReservations();
  }, [authLoading, loadReservations]);

  const onRefresh = () => {
    setRefreshing(true);
    loadReservations();
  };

  // Loader pendant que l'auth se charge ou pendant la première requête
  if (authLoading || loading) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <Text style={s.title}>Mes Billets & Réservations</Text>
        </View>
        <View style={[s.body, { justifyContent: 'center' }]}>
          <ActivityIndicator size="large" color={colors.primary[500]} />
        </View>
      </SafeAreaView>
    );
  }

  // Pas de réservations : empty state
  if (!reservations.length) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <Text style={s.title}>Mes Billets & Réservations</Text>
        </View>
        <ScrollView
          contentContainerStyle={s.body}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <Ionicons name="ticket-outline" size={64} color={colors.neutral[300]} />
          <Text style={s.empty}>Tes prochains billets et réservations apparaîtront ici.</Text>
          <Pressable
            style={({ pressed }) => [s.cta, pressed && { opacity: 0.85 }]}
            onPress={() => router.push('/(tabs)/explore')}
          >
            <Text style={s.ctaText}>Explorer les lieux</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Text style={s.title}>Mes Billets & Réservations</Text>
      </View>
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing['2xl'] }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {reservations.map((res) => (
          <ReservationCard
            key={res.id}
            reservation={res}
            onPress={() =>
              Alert.alert(
                res.venue?.name ?? 'Réservation',
                `Statut: ${res.status}\nDate: ${new Date(res.date_time).toLocaleString('fr-FR')}\nPersonnes: ${res.party_size}\nDépôt: ${formatXOF(res.deposit_xof)}\nQR: ${res.qr_code.slice(0, 8)}…`
              )
            }
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function ReservationCard({ reservation, onPress }: { reservation: Reservation; onPress: () => void }) {
  const dateTime = new Date(reservation.date_time);
  const { color: statusColor, label: statusLabel } = statusMeta(reservation.status);

  return (
    <Pressable
      style={({ pressed }) => [s.card, pressed && { opacity: 0.85 }]}
      onPress={onPress}
    >
      <View style={{ flex: 1 }}>
        <Text style={s.venueName}>{reservation.venue?.name ?? 'Lieu inconnu'}</Text>
        <Text style={s.detail}>
          📅 {dateTime.toLocaleDateString('fr-FR')} à{' '}
          {dateTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </Text>
        <Text style={s.detail}>👥 {reservation.party_size} personne{reservation.party_size > 1 ? 's' : ''}</Text>
        {reservation.venue?.district && (
          <Text style={s.detail}>📍 {reservation.venue.district}</Text>
        )}
        <View style={s.footer}>
          <View style={[s.statusBadge, { backgroundColor: statusColor + '20' }]}>
            <Text style={[s.statusText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
          <Text style={s.deposit}>Dépôt : {formatXOF(reservation.deposit_xof)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function statusMeta(status: string): { color: string; label: string } {
  switch (status) {
    case 'pending': return { color: colors.warning, label: 'En attente' };
    case 'confirmed': return { color: colors.success, label: 'Confirmée' };
    case 'arrived': return { color: colors.success, label: 'Arrivé' };
    case 'no_show': return { color: colors.danger, label: 'No show' };
    case 'cancelled': return { color: colors.danger, label: 'Annulée' };
    case 'refunded': return { color: colors.neutral[500], label: 'Remboursée' };
    default: return { color: colors.neutral[500], label: status };
  }
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.light },
  header: { padding: spacing.lg },
  title: { fontSize: typography.fontSize.xl, fontWeight: '700', color: colors.dark },
  body: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  empty: { marginTop: spacing.base, color: colors.neutral[500], textAlign: 'center' },
  cta: {
    marginTop: spacing.xl,
    backgroundColor: colors.primary[500],
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.full,
  },
  ctaText: { color: '#fff', fontWeight: '700', fontSize: typography.fontSize.base },
  card: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.lg,
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },
  venueName: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.dark, marginBottom: spacing.sm },
  detail: { fontSize: typography.fontSize.sm, color: colors.neutral[600], marginBottom: spacing.xs },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md },
  statusBadge: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.full },
  statusText: { fontSize: typography.fontSize.xs, fontWeight: '600' },
  deposit: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.primary[500] },
});
