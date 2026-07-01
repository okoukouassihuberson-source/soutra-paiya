import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ScrollView, View, Text, Pressable, StyleSheet, RefreshControl,
  ActivityIndicator, Image, Modal, Alert,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { typography, radius, spacing, formatXOF, type ColorPalette } from '@soutra/shared';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useColors } from '@/lib/theme';
import { ScreenHeader } from '@/components/ScreenHeader';
import { PaymentMethodsStrip } from '@/components/PaymentMethodsStrip';

/**
 * /orders — mes commandes mobile.
 * Liste les orders du user (RLS = self), tap pour voir détails + timeline.
 */

type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled' | 'refunded';
type DeliveryMethod = 'pickup' | 'delivery';

interface OrderItem {
  product_id: string;
  name: string;
  unit_price_xof: number;
  qty: number;
  variant: Record<string, string> | null;
  subtotal_xof: number;
}

interface Order {
  id: string;
  order_number: string;
  venue_id: string;
  items: OrderItem[];
  items_count: number;
  subtotal_xof: number;
  delivery_fee_xof: number;
  total_xof: number;
  status: OrderStatus;
  delivery_method: DeliveryMethod;
  delivery_address: string | null;
  delivery_notes: string | null;
  contact_phone: string | null;
  contact_name: string | null;
  payment_status: string;
  created_at: string;
  confirmed_at: string | null;
  ready_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  venue: {
    name: string;
    cover_url: string | null;
    category: string | null;
    payment_methods: string[] | null;
  } | null;
}

const STATUS_META: Record<OrderStatus, { label: string; color: string; icon: string }> = {
  pending:   { label: 'En attente',     color: '#f59e0b', icon: 'time-outline' },
  confirmed: { label: 'Confirmée',      color: '#3b82f6', icon: 'checkmark-circle-outline' },
  preparing: { label: 'En préparation', color: '#6366f1', icon: 'cube-outline' },
  ready:     { label: 'Prête',          color: '#10b981', icon: 'bag-check-outline' },
  delivered: { label: 'Livrée',         color: '#059669', icon: 'checkmark-done-outline' },
  cancelled: { label: 'Annulée',        color: '#737373', icon: 'close-circle-outline' },
  refunded:  { label: 'Remboursée',     color: '#a855f7', icon: 'refresh-circle-outline' },
};

export default function OrdersScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<Order | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) { setOrders([]); setLoading(false); setRefreshing(false); return; }
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id, order_number, venue_id, items, items_count,
          subtotal_xof, delivery_fee_xof, total_xof, status,
          delivery_method, delivery_address, delivery_notes,
          contact_phone, contact_name, payment_status,
          created_at, confirmed_at, ready_at, delivered_at, cancelled_at,
          venue:venues(name, cover_url, category, payment_methods)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) {
        console.error('[orders] load:', error);
        setOrders([]);
      } else {
        setOrders(((data as any[]) ?? []).map((o) => ({ ...o, venue: o.venue || null })));
      }
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <ScreenHeader title="Mes commandes" />
        <View style={s.center}><ActivityIndicator color={c.primary[500]} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader title="Mes commandes" subtitle={`${orders.length} commande${orders.length > 1 ? 's' : ''}`} />

      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing['2xl'] }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {orders.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="receipt-outline" size={56} color={c.neutral[400]} />
            <Text style={s.emptyTitle}>Aucune commande pour l&apos;instant</Text>
            <Text style={s.emptyBody}>
              Explore les boutiques et passe ta première commande.
            </Text>
            <Pressable onPress={() => router.push('/(tabs)/explore')} style={s.cta}>
              <Ionicons name="compass" size={18} color="#fff" />
              <Text style={s.ctaText}>Explorer</Text>
            </Pressable>
          </View>
        ) : (
          orders.map((o) => (
            <OrderCard key={o.id} c={c} order={o} onPress={() => setSelected(o)} />
          ))
        )}
      </ScrollView>

      <OrderDetailModal order={selected} onClose={() => setSelected(null)} />
    </SafeAreaView>
  );
}

/* ─────────────────────────────────────────────────── *
 *  ORDER CARD                                         *
 * ─────────────────────────────────────────────────── */

function OrderCard({ c, order, onPress }: { c: ColorPalette; order: Order; onPress: () => void }) {
  const s = useMemo(() => makeStyles(c), [c]);
  const meta = STATUS_META[order.status];
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.card, pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] }]}
    >
      <View style={s.cardHeader}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.cardNumber}>{order.order_number}</Text>
          <Text style={s.cardVenue} numberOfLines={1}>{order.venue?.name || 'Boutique'}</Text>
        </View>
        <View style={[s.statusPill, { backgroundColor: meta.color + '20' }]}>
          <Ionicons name={meta.icon as any} size={12} color={meta.color} />
          <Text style={[s.statusText, { color: meta.color }]}>{meta.label}</Text>
        </View>
      </View>
      <View style={s.cardFooter}>
        <Text style={s.cardMeta}>
          {order.items_count} art. · {relativeDate(order.created_at)}
        </Text>
        <Text style={s.cardTotal}>{formatXOF(order.total_xof)}</Text>
      </View>
    </Pressable>
  );
}

/* ─────────────────────────────────────────────────── *
 *  ORDER DETAIL MODAL                                 *
 * ─────────────────────────────────────────────────── */

function OrderDetailModal({ order, onClose }: { order: Order | null; onClose: () => void }) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const [paying, setPaying] = useState(false);

  const handlePay = useCallback(async () => {
    if (!order) return;
    setPaying(true);
    try {
      const { data, error } = await (supabase.functions as any).invoke('geniuspay-pay-order', {
        body: { order_id: order.id },
      });
      if (error) {
        Alert.alert('Erreur', error.message || 'Impossible de démarrer le paiement');
        return;
      }
      const url = (data as any)?.checkout_url;
      const reference = (data as any)?.reference;
      if (!url || !reference) {
        Alert.alert('Erreur', 'Réponse GeniusPay invalide');
        return;
      }
      // openAuthSessionAsync (au lieu de openBrowserAsync) referme
      // automatiquement le navigateur quand la page callback deep-linke vers
      // soutrapaiya://geniuspay. Ensuite on force la vérification côté serveur
      // pour que la transaction passe de pending → success sans attendre
      // uniquement le webhook (qui reste la source de vérité serveur).
      await WebBrowser.openAuthSessionAsync(url, 'soutrapaiya://geniuspay');
      await (supabase.functions as any).invoke('geniuspay-verify', {
        body: { reference },
      });
    } catch (err) {
      Alert.alert('Erreur', err instanceof Error ? err.message : 'Erreur inattendue');
    } finally {
      setPaying(false);
    }
  }, [order]);

  if (!order) return null;
  const meta = STATUS_META[order.status];
  const canPay = order.status === 'pending' && order.payment_status === 'pending';

  // Timeline étapes (filtrées selon ce qui s'est passé)
  const steps: { label: string; date: string | null; done: boolean }[] = [
    { label: 'Commande passée',   date: order.created_at,   done: true },
    { label: 'Paiement confirmé', date: order.confirmed_at, done: !!order.confirmed_at },
    { label: 'En préparation',    date: null,               done: ['preparing','ready','delivered'].includes(order.status) },
    { label: 'Prête',             date: order.ready_at,     done: !!order.ready_at },
    { label: 'Livrée',            date: order.delivered_at, done: !!order.delivered_at },
  ];
  if (order.status === 'cancelled') {
    steps.push({ label: 'Annulée', date: order.cancelled_at, done: true });
  }

  return (
    <Modal visible={!!order} onRequestClose={onClose} animationType="slide" transparent>
      <View style={s.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={s.modalSheet}>
          <View style={s.modalHandle} />
          <ScrollView contentContainerStyle={s.modalContent} showsVerticalScrollIndicator={false}>
            <Text style={s.modalNumber}>{order.order_number}</Text>
            <View style={[s.statusPill, { backgroundColor: meta.color + '20', alignSelf: 'flex-start', marginTop: spacing.xs }]}>
              <Ionicons name={meta.icon as any} size={14} color={meta.color} />
              <Text style={[s.statusText, { color: meta.color, fontSize: typography.fontSize.sm }]}>{meta.label}</Text>
            </View>

            {/* Venue */}
            <View style={s.modalVenue}>
              {order.venue?.cover_url ? (
                <Image source={{ uri: order.venue.cover_url }} style={s.modalVenueImg} />
              ) : (
                <View style={[s.modalVenueImg, { backgroundColor: c.neutral[200] }]} />
              )}
              <View>
                <Text style={s.modalVenueName}>{order.venue?.name || '—'}</Text>
                <Text style={s.modalVenueCat}>{order.venue?.category || ''}</Text>
              </View>
            </View>

            {/* Items */}
            <Text style={s.sectionTitle}>Articles</Text>
            {order.items.map((it, i) => (
              <View key={i} style={s.itemRow}>
                <View style={s.itemQtyBox}><Text style={s.itemQtyText}>×{it.qty}</Text></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.itemName}>{it.name}</Text>
                  {it.variant && (
                    <Text style={s.itemVariant}>
                      {Object.entries(it.variant).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                    </Text>
                  )}
                </View>
                <Text style={s.itemPrice}>{formatXOF(it.subtotal_xof)}</Text>
              </View>
            ))}

            {/* Totaux */}
            <View style={s.totals}>
              <Row label="Sous-total" value={formatXOF(order.subtotal_xof)} />
              {order.delivery_fee_xof > 0 && (
                <Row label="Livraison" value={formatXOF(order.delivery_fee_xof)} />
              )}
              <Row label="Total" value={formatXOF(order.total_xof)} bold />
            </View>

            {/* Delivery */}
            <Text style={s.sectionTitle}>
              {order.delivery_method === 'delivery' ? '🚚 Livraison' : '🏪 Retrait'}
            </Text>
            {order.delivery_method === 'delivery' && order.delivery_address && (
              <Text style={s.modalText}>{order.delivery_address}</Text>
            )}
            {order.delivery_notes && (
              <Text style={s.modalNote}>📝 {order.delivery_notes}</Text>
            )}

            {/* Contact */}
            {(order.contact_name || order.contact_phone) && (
              <>
                <Text style={s.sectionTitle}>Contact</Text>
                {order.contact_name && <Text style={s.modalText}>{order.contact_name}</Text>}
                {order.contact_phone && <Text style={s.modalText}>{order.contact_phone}</Text>}
              </>
            )}

            {/* Timeline */}
            <Text style={s.sectionTitle}>Suivi</Text>
            <View style={s.timeline}>
              {steps.map((step, i) => (
                <View key={i} style={s.tlStep}>
                  <View style={[s.tlDot, step.done && s.tlDotDone]}>
                    {step.done && <Ionicons name="checkmark" size={12} color="#fff" />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.tlLabel, step.done && s.tlLabelDone]}>{step.label}</Text>
                    {step.date && (
                      <Text style={s.tlDate}>{new Date(step.date).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
                    )}
                  </View>
                </View>
              ))}
            </View>

            {/* CTA Payer si commande non payée */}
            {canPay && (
              <>
                {/* Strip "Moyens disponibles" — effet confiance avant Paystack */}
                <PaymentMethodsStrip methods={order.venue?.payment_methods} />
                <Pressable
                  onPress={handlePay}
                  disabled={paying}
                  style={({ pressed }) => [
                    s.payBtn,
                    paying && { opacity: 0.6 },
                    pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                  ]}
                >
                  <Ionicons name="card" size={20} color="#fff" />
                  <Text style={s.payBtnText}>
                    {paying ? 'Démarrage Paystack…' : `Payer maintenant · ${formatXOF(order.total_xof)}`}
                  </Text>
                </Pressable>
              </>
            )}

            <Pressable onPress={onClose} style={s.closeBtn}>
              <Text style={s.closeBtnText}>Fermer</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Row({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
      <Text style={{ color: bold ? c.dark : c.neutral[600], fontWeight: bold ? '800' : '500', fontSize: typography.fontSize.sm }}>{label}</Text>
      <Text style={{ color: bold ? c.dark : c.neutral[700], fontWeight: bold ? '800' : '600', fontSize: typography.fontSize.sm, fontVariant: ['tabular-nums'] }}>{value}</Text>
    </View>
  );
}

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `il y a ${d} j`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.light },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    empty: { alignItems: 'center', padding: spacing.xl, gap: spacing.sm, marginTop: spacing['2xl'] },
    emptyTitle: { fontSize: typography.fontSize.lg, fontWeight: '800', color: c.dark, marginTop: spacing.sm },
    emptyBody: { fontSize: typography.fontSize.sm, color: c.neutral[600], textAlign: 'center', paddingHorizontal: spacing.lg },
    cta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: c.primary[500], paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.full, marginTop: spacing.md },
    ctaText: { color: '#fff', fontWeight: '700' },

    card: { backgroundColor: '#fff', borderRadius: radius.lg, marginHorizontal: spacing.md, marginTop: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: c.neutral[200] },
    cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    cardNumber: { fontFamily: 'monospace', fontSize: typography.fontSize.xs, color: c.neutral[600], fontWeight: '700' },
    cardVenue: { fontSize: typography.fontSize.base, fontWeight: '700', color: c.dark, marginTop: 2 },
    cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: c.neutral[100] },
    cardMeta: { fontSize: typography.fontSize.xs, color: c.neutral[500] },
    cardTotal: { fontSize: typography.fontSize.base, fontWeight: '800', color: c.dark, fontVariant: ['tabular-nums'] },

    statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.full },
    statusText: { fontSize: 11, fontWeight: '700' },

    // Modal
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
    modalSheet: { backgroundColor: c.light, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '90%', paddingTop: spacing.sm },
    modalHandle: { alignSelf: 'center', width: 44, height: 4, borderRadius: 2, backgroundColor: c.neutral[300], marginBottom: spacing.sm },
    modalContent: { padding: spacing.lg, paddingBottom: spacing['2xl'] },
    modalNumber: { fontFamily: 'monospace', fontSize: typography.fontSize.base, fontWeight: '800', color: c.dark },

    modalVenue: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg, marginBottom: spacing.md },
    modalVenueImg: { width: 48, height: 48, borderRadius: radius.md },
    modalVenueName: { fontSize: typography.fontSize.base, fontWeight: '800', color: c.dark },
    modalVenueCat: { fontSize: typography.fontSize.xs, color: c.neutral[500] },

    sectionTitle: { fontSize: 11, color: c.neutral[600], fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: spacing.lg, marginBottom: spacing.xs },
    itemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: spacing.xs },
    itemQtyBox: { backgroundColor: c.neutral[100], borderRadius: radius.sm, paddingHorizontal: spacing.xs, paddingVertical: 2 },
    itemQtyText: { fontFamily: 'monospace', fontSize: 11, fontWeight: '800', color: c.neutral[700] },
    itemName: { fontSize: typography.fontSize.sm, fontWeight: '600', color: c.dark },
    itemVariant: { fontSize: 11, color: c.neutral[500], marginTop: 2 },
    itemPrice: { fontSize: typography.fontSize.sm, fontWeight: '700', color: c.dark, fontVariant: ['tabular-nums'] },

    totals: { marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: c.neutral[200] },
    modalText: { fontSize: typography.fontSize.sm, color: c.dark, marginTop: 2 },
    modalNote: { fontSize: typography.fontSize.xs, color: c.neutral[600], marginTop: spacing.xs, fontStyle: 'italic' },

    timeline: { marginTop: spacing.xs },
    tlStep: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: 6 },
    tlDot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: c.neutral[300], backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
    tlDotDone: { backgroundColor: c.success[600], borderColor: c.success[600] },
    tlLabel: { fontSize: typography.fontSize.sm, color: c.neutral[500], fontWeight: '600' },
    tlLabelDone: { color: c.dark, fontWeight: '700' },
    tlDate: { fontSize: 11, color: c.neutral[500], marginTop: 2 },

    payBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
      backgroundColor: c.primary[500],
      paddingVertical: spacing.md + 2, borderRadius: radius.full,
      marginTop: spacing.xl,
      shadowColor: c.primary[500], shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4,
    },
    payBtnText: { color: '#fff', fontWeight: '800', fontSize: typography.fontSize.base, fontVariant: ['tabular-nums'] },
    closeBtn: { marginTop: spacing.sm, paddingVertical: spacing.sm, alignItems: 'center' },
    closeBtnText: { color: c.neutral[600], fontWeight: '600' },
  });
}
